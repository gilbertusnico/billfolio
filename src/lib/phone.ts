/* ---------------------------------------------------------------------------
 * Phone helpers — WhatsApp-friendly, Indonesia-first formatting.
 * "0812 3456 7890" → "628123456789" → https://wa.me/628123456789
 * ------------------------------------------------------------------------- */

function digitsOnly(input: string): string {
  return (input ?? "").replace(/\D/g, "");
}

/**
 * Normalise a phone number to the international format WhatsApp expects.
 * - leading "0" (local number) → "0812…" becomes "62812…"
 * - bare "8…" that looks like a local mobile → prefixed with "62"
 * - already "62…" → kept as-is
 * - any other country code → kept as-is
 * All punctuation, spaces and a leading "+" are stripped.
 */
export function sanitizePhone(input: string): string {
  const d = digitsOnly(input);
  if (d.startsWith("62")) return d;
  if (d.startsWith("0")) return `62${d.slice(1)}`;
  if (d.startsWith("8")) return `62${d}`;
  return d;
}

/** Sanity check: 9–15 digits after normalisation. */
export function isValidPhone(input: string): boolean {
  const d = digitsOnly(input);
  return d.length >= 9 && d.length <= 15;
}

/** https://wa.me/<number> — the number must include the country code (62…). */
export function whatsAppLink(phone: string): string {
  return `https://wa.me/${sanitizePhone(phone)}`;
}

/** Full wa.me deep link with a URL-encoded message. */
export function whatsAppShareUrl(phone: string, message: string): string {
  return `${whatsAppLink(phone)}?text=${encodeURIComponent(message)}`;
}

/** Default invoice reminder message used by "Share to WhatsApp". */
export function buildWhatsAppMessage(opts: {
  clientName: string;
  invoiceNumber: string;
  grandTotal: string;
  link: string;
}): string {
  return (
    `Halo ${opts.clientName}, Berikut invoice ${opts.invoiceNumber} sebesar ${opts.grandTotal}. ` +
    `Silakan cek detail dan lakukan pembayaran melalui link berikut: ${opts.link}`
  );
}