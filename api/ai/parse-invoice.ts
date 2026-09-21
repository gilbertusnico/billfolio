import { GoogleGenAI, Type } from "@google/genai";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const systemInstruction =
  "Kamu adalah asisten keuangan presisi. Tugasmu adalah mengekstrak teks bebas pengguna menjadi struktur JSON data invoice. Ekstrak nama klien, nama proyek, item pekerjaan, kuantitas, harga satuan, pajak, diskon, dan perkiraan hari jatuh tempo.";

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    client_name: { type: Type.STRING },
    project_name: { type: Type.STRING },
    due_days: { type: Type.NUMBER },
    tax_rate: { type: Type.NUMBER },
    discount: { type: Type.NUMBER },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          description: { type: Type.STRING },
          quantity: { type: Type.NUMBER },
          unit_price: { type: Type.NUMBER },
        },
        required: ["description", "quantity", "unit_price"],
      },
    },
  },
  required: ["client_name", "project_name", "due_days", "tax_rate", "discount", "items"],
};

function finiteNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

function normalizeResult(value: unknown, prompt: string) {
  const raw = (value ?? {}) as Record<string, unknown>;
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const dueDaysMentioned = /(jatuh\s*tempo|tempo|due\s*date|duedate|due|payment\s*term)[^0-9]{0,30}\d{1,3}\s*(hari|days?)/i.test(prompt);

  return {
    client_name: typeof raw.client_name === "string" ? raw.client_name.trim() : "",
    project_name: typeof raw.project_name === "string" ? raw.project_name.trim() : "",
    due_days: dueDaysMentioned ? finiteNumber(raw.due_days, 7) : 7,
    tax_rate: finiteNumber(raw.tax_rate, 0),
    discount: finiteNumber(raw.discount, 0),
    items: rawItems
      .map((item) => {
        const row = (item ?? {}) as Record<string, unknown>;
        return {
          description: typeof row.description === "string" ? row.description.trim() : "",
          quantity: finiteNumber(row.quantity, 1) || 1,
          unit_price: finiteNumber(row.unit_price, 0),
        };
      })
      .filter((item) => item.description || item.unit_price > 0),
  };
}

function errorStatus(error: unknown): number {
  return typeof error === "object" && error !== null && "status" in error
    ? Number((error as { status?: unknown }).status)
    : 0;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 503;
}

async function generateWithRetry(ai: GoogleGenAI, prompt: string) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-3.6-flash",
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema,
        },
      });
    } catch (error) {
      const status = errorStatus(error);
      if (!isRetryableStatus(status) || attempt === maxAttempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw new Error("Gemini request failed after retries.");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Only POST requests are supported." });
  }

  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  if (!prompt || prompt.length > 10_000) {
    return res.status(400).json({ error: "Prompt wajib diisi dan maksimal 10.000 karakter." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY belum dikonfigurasi di server." });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await generateWithRetry(ai, prompt);

    const text = response.text?.trim();
    if (!text) {
      return res.status(502).json({ error: "AI tidak menghasilkan data invoice." });
    }

    return res.status(200).json(normalizeResult(JSON.parse(text), prompt));
  } catch (error) {
    console.error("AI invoice parsing failed", error);
    const status = errorStatus(error);
    if (status === 401) {
      return res.status(502).json({
        error: "GEMINI_API_KEY tidak valid atau tidak memiliki akses Gemini API. Perbarui key di environment server.",
      });
    }
    if (status === 404) {
      return res.status(502).json({
        error: "Model Gemini yang digunakan tidak tersedia untuk API key ini. Periksa konfigurasi model di server.",
      });
    }
    if (status === 429 || status === 503) {
      return res.status(503).json({
        error: "Layanan Gemini sedang penuh atau rate limit tercapai. Coba Generate Invoice lagi beberapa saat lagi.",
      });
    }
    return res.status(502).json({ error: "AI gagal memproses prompt invoice. Coba gunakan detail yang lebih jelas." });
  }
}
