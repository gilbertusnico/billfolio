import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function amount(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Only POST requests are supported." }, 405);

  const serverKey = Deno.env.get("MIDTRANS_SERVER_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("BILLFOLIO_SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const isProduction = Deno.env.get("MIDTRANS_IS_PRODUCTION") === "true";
  if (!serverKey || !supabaseUrl || !serviceRoleKey) {
    console.error("Missing required Snap server environment variables.");
    return json({ error: "Payment service is not configured." }, 500);
  }

  let body: { invoice_id?: unknown };
  try {
    body = await request.json() as { invoice_id?: unknown };
  } catch {
    return json({ error: "Invalid JSON payload." }, 400);
  }

  const invoiceId = text(body.invoice_id);
  if (!invoiceId) return json({ error: "invoice_id is required." }, 400);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, status, subtotal, tax_amount, discount, grand_total, client_snapshot, items")
    .eq("id", invoiceId)
    .maybeSingle();

  if (invoiceError) {
    console.error("Invoice lookup failed", invoiceError);
    return json({ error: "Could not load invoice." }, 500);
  }
  if (!invoice) return json({ error: "Invoice not found." }, 404);
  if (invoice.status !== "PENDING") {
    return json({ error: "Only pending invoices can be paid." }, 409);
  }

  const grossAmount = amount(invoice.grand_total);
  if (grossAmount <= 0) return json({ error: "Invoice amount must be greater than zero." }, 422);

  const snapshot = (invoice.client_snapshot ?? {}) as Record<string, unknown>;
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const itemDetails = items
    .map((item) => {
      const row = (item ?? {}) as Record<string, unknown>;
      const price = amount(row.unitPrice ?? row.unit_price);
      const quantity = Math.max(1, amount(row.quantity));
      return {
        id: text(row.id) || text(row.description) || "invoice-item",
        price,
        quantity,
        name: text(row.description) || "Invoice item",
      };
    })
    .filter((item) => item.price > 0);

  const taxAmount = amount(invoice.tax_amount);
  const discountAmount = amount(invoice.discount);
  if (taxAmount > 0) itemDetails.push({ id: "invoice-tax", price: taxAmount, quantity: 1, name: "Tax" });
  if (discountAmount > 0) itemDetails.push({ id: "invoice-discount", price: -discountAmount, quantity: 1, name: "Discount" });

  const itemTotal = itemDetails.reduce((sum, item) => sum + item.price * item.quantity, 0);
  if (itemTotal !== grossAmount) {
    itemDetails.push({
      id: "invoice-adjustment",
      price: grossAmount - itemTotal,
      quantity: 1,
      name: "Invoice adjustment",
    });
  }

  const endpoint = isProduction
    ? "https://app.midtrans.com/snap/v1/transactions"
    : "https://app.sandbox.midtrans.com/snap/v1/transactions";
  const paymentOrderId = `${invoice.id}__${Date.now().toString(36)}`;
  const authorization = `Basic ${btoa(`${serverKey}:`)}`;
  const midtransResponse = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authorization,
    },
    body: JSON.stringify({
      transaction_details: { order_id: paymentOrderId, gross_amount: grossAmount },
      customer_details: { first_name: text(snapshot.name) || "Customer" },
      item_details: itemDetails,
    }),
  });

  const responseText = await midtransResponse.text();
  let responseBody: Record<string, unknown> = {};
  try {
    responseBody = JSON.parse(responseText) as Record<string, unknown>;
  } catch {
    console.error("Midtrans returned non-JSON response", midtransResponse.status);
  }

  if (!midtransResponse.ok) {
    console.error("Midtrans Snap token request failed", midtransResponse.status, responseBody);
    return json({ error: "Midtrans could not create a payment session." }, 502);
  }

  const token = text(responseBody.token);
  const redirectUrl = text(responseBody.redirect_url);
  if (!token) return json({ error: "Midtrans returned no Snap token." }, 502);

  return json({ token, redirect_url: redirectUrl || null });
});
