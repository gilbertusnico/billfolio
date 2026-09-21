// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-signature-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type MidtransPayload = {
  order_id?: unknown;
  transaction_status?: unknown;
  fraud_status?: unknown;
  status_code?: unknown;
  gross_amount?: unknown;
  signature_key?: unknown;
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

async function sha512(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-512", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function resolveStatus(transactionStatus: string, fraudStatus: string): "PAID" | "FAILED" | "PENDING" | null {
  if (transactionStatus === "settlement") return "PAID";
  if (transactionStatus === "capture" && fraudStatus === "accept") return "PAID";
  if (["cancel", "deny", "expire"].includes(transactionStatus)) return "FAILED";
  if (transactionStatus === "pending") return "PENDING";
  return null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method === "GET") {
    return json({ status: "OK", message: "Webhook endpoint is reachable" });
  }
  if (request.method !== "POST") return json({ error: "Only POST requests are supported." }, 405);

  const serverKey = Deno.env.get("MIDTRANS_SERVER_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serverKey || !supabaseUrl || !serviceRoleKey) {
    console.error("Missing required server environment variables.");
    return json({ error: "Webhook server is not configured." }, 500);
  }

  let payload: MidtransPayload;
  try {
    payload = await request.json() as MidtransPayload;
  } catch {
    return json({ status: "OK", message: "Webhook endpoint reachable" });
  }

  const orderId = text(payload.order_id);
  const invoiceId = orderId.split("__", 1)[0];
  const transactionStatus = text(payload.transaction_status).toLowerCase();
  const fraudStatus = text(payload.fraud_status).toLowerCase();
  const statusCode = text(payload.status_code);
  const grossAmount = text(payload.gross_amount);
  const signatureKey = text(payload.signature_key).toLowerCase();
  if (!orderId || !transactionStatus || !statusCode || !grossAmount || !signatureKey) {
    return json({ status: "OK", message: "Webhook received; no transaction to process" });
  }

  const expectedSignature = await sha512(`${orderId}${statusCode}${grossAmount}${serverKey}`);
  if (!safeEqual(signatureKey, expectedSignature)) return json({ error: "Invalid webhook signature." }, 401);

  const nextStatus = resolveStatus(transactionStatus, fraudStatus);
  if (!nextStatus) return json({ status: "OK", message: "Webhook status ignored" });

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const update: Record<string, string | null> = {
    status: nextStatus,
    paid_at: nextStatus === "PAID" ? new Date().toISOString() : null,
  };
  const { error } = await supabase.from("invoices").update(update).eq("id", invoiceId);
  if (error) {
    console.error("Invoice update failed", error);
    return json({ error: "Invoice update failed." }, 500);
  }

  return json({ status: "OK", message: "Webhook processed" });
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/midtrans-webhook' \
    --header 'apiKey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH' \
    --data '{"name":"Functions"}'

*/
