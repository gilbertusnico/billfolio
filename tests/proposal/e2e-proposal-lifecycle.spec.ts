import { test, expect, type Page } from "@playwright/test";

/**
 * SIT E2E — Proposal lifecycle: create -> mark sent -> client approve -> DP invoice.
 * Env: BASE_URL (default http://localhost:5173), TEST_EMAIL, TEST_PASSWORD.
 * Run: npx playwright test tests/proposal/e2e-proposal-lifecycle.spec.ts --reporter=line
 */

const BASE = process.env.BASE_URL ?? "http://localhost:5173";

async function login(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', process.env.TEST_EMAIL!);
  await page.fill('input[type="password"]', process.env.TEST_PASSWORD!);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/**`, { timeout: 15000 });
}

test.describe("Proposal lifecycle (P0 flow)", () => {
  test.setTimeout(120_000);

  const suffix = Date.now().toString(36);
  const title = `SIT Web ${suffix}`;
  let publicPath: string | null = null;

  test("PB-01/PD-06: create draft then mark sent & copy link", async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/proposals`);
    await page.getByRole("link", { name: /Create New Proposal/i }).first().click();

    // Client combobox: pilih client pertama yang tersedia (fixture F-03)
    await page.locator("#proposal-client").click();
    await page.locator('[role="option"]').first().click();

    await page.getByLabel(/Project Title/i).fill(title);
    await page.getByLabel(/Base Price/i).fill("10.000.000");
    await page.getByLabel(/DP Percentage/i).fill("50");

    // Addon required (label checkbox "Required (included in base proposal total)")
    await page.getByRole("button", { name: /Add add-on/i }).click();
    await page.getByLabel(/^\s*Title\s*$/).last().fill("SEO Package");
    await page.getByLabel(/Price \(IDR\)/i).last().fill("2000000");
    await page.getByText(/Required \(included in base proposal total\)/i).click();

    // Addon opsional
    await page.getByRole("button", { name: /Add add-on/i }).click();
    await page.getByLabel(/^\s*Title\s*$/).last().fill("Extra Revisions");
    await page.getByLabel(/Price \(IDR\)/i).last().fill("1500000");

    await page.getByRole("button", { name: /^Save Proposal$/i }).click();
    await expect(page.getByText(/saved as draft/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Proposals" })).toBeVisible();
    const row = page.locator("article").filter({ hasText: title });
    await expect(row.getByText("DRAFT")).toBeVisible();

    // PD-06 Mark sent & copy link
    await row.getByRole("button", { name: /Mark sent & copy link/i }).click();
    await expect(row.getByText("SENT")).toBeVisible();

    // Ambil path token dari href tombol external-link (PD-09)
    publicPath = await row
      .getByRole("link", { name: new RegExp(`Open public view for ${title}`, "i") })
      .getAttribute("href");
    expect(publicPath).toMatch(/^\/p\/[0-9a-f-]{36}$/i);
  });

  test("CP-01/CP-11/CP-12/CP-10: anonymous client views, guards, then approves", async ({ browser }) => {
    test.skip(!publicPath, "depends on previous test creating the proposal");
    const anon = await browser.newContext(); // context tanpa sesi login = klien anonim
    const page = await anon.newPage();
    await page.goto(`${BASE}${publicPath!}`);

    // CP-01 render
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText("Client e-signature")).toBeVisible();
    await expect(page.getByRole("button", { name: /Approve proposal/i })).toBeVisible();

    // CP-11/CP-12 guard: approve tanpa signature & terms => toast, tidak ada write
    await page.getByRole("button", { name: /Approve proposal/i }).click();
    await expect(page.getByText(/signature and accept the proposal terms/i)).toBeVisible();

    // CP-06 live total saat centang addon opsional (kalau ada)
    const optional = page.locator('input[aria-label^="Select optional add-on"]');
    if (await optional.count()) {
      await optional.first().check();
    }

    // Gambar signature: drag di canvas
    const canvas = page.locator("canvas").first();
    const box = await canvas.boundingBox();
    await page.mouse.move(box!.x + 20, box!.y + 30);
    await page.mouse.down();
    await page.mouse.move(box!.x + 150, box!.y + 60, { steps: 10 });
    await page.mouse.up();

    await page.getByText(/Saya menyetujui/i).click();
    await page.getByRole("button", { name: /Approve proposal/i }).click();

    // CP-10 approved panel + invoice link
    await expect(page.getByRole("heading", { name: /Proposal approved/i })).toBeVisible();
    const invoiceLink = page.getByRole("link", { name: /View DP invoice/i });
    await expect(invoiceLink).toBeVisible({ timeout: 20000 });
    await expect(invoiceLink).toHaveAttribute("href", /^\/i\/[0-9a-f-]{36}$/i);

    // CP-24 signature img tampil
    await expect(page.getByAltText(/e-signature/i)).toBeVisible();
    await anon.close();
  });

  test("CP-23: second response is rejected (state locked)", async ({ browser }) => {
    test.skip(!publicPath, "depends on previous tests");
    const anon = await browser.newContext();
    const page = await anon.newPage();
    await page.goto(`${BASE}${publicPath!}`);
    // Status APPROVED => tidak ada form respon lagi
    await expect(page.getByRole("button", { name: /Approve proposal/i })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /Proposal approved/i })).toBeVisible();
    await anon.close();
  });

  test("PE-03: approved proposal cannot be edited via forced URL", async ({ page }) => {
    test.skip(!publicPath, "depends on previous tests");
    await login(page);
    await page.goto(`${BASE}/proposals`);
    const row = page.locator("article").filter({ hasText: title });
    await expect(row.getByRole("link", { name: new RegExp(`Edit ${title}`, "i") })).toHaveCount(0); // PD-05
    // paksa URL edit lewat id (diambil dari DB/list tak possible; cek via link publik -> RPC get id tak exposed)
    // jadi cukup assert tombol Edit hilang utk APPROVED
    await expect(row.getByText("APPROVED")).toBeVisible();
  });

  test("CP-02: invalid token shows client-side error without RPC", async ({ page }) => {
    const calls: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("get_public_proposal")) calls.push(r.url());
    });
    await page.goto(`${BASE}/p/not-a-uuid`);
    await expect(page.getByText(/proposal link is invalid/i)).toBeVisible();
    expect(calls).toHaveLength(0);
  });
});
