// LIVE helper: raw REST client (Node20-safe, no supabase-js realtime/WebSocket issue)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const dir = path.dirname(fileURLToPath(import.meta.url));
export const env = Object.fromEntries(
  fs.readFileSync(path.join(dir, ".env.live"), "utf8").split("\n")
    .filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);

export function emailForUsername(u) {
  return `${u.trim().toLowerCase().replace(/\s+/g, ".")}@internal.app`;
}

export async function login() {
  const email = env.TEST_EMAIL.includes("@") ? env.TEST_EMAIL : emailForUsername(env.TEST_EMAIL);
  const r = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: env.TEST_PASSWORD }),
  });
  if (!r.ok) throw new Error(`LOGIN FAILED (${r.status}): ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return { accessToken: j.access_token, userId: j.user.id, email };
}

export class Rest {
  constructor(token) { this.token = token; }
  headers(extra = {}) {
    return {
      apikey: env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${this.token}`,
      Accept: "application/json",
      ...extra,
    };
  }
  async req(method, url, body, extraHeaders = {}) {
    const r = await fetch(`${env.VITE_SUPABASE_URL}${url}`, {
      method,
      headers: this.headers(body ? { "Content-Type": "application/json", ...extraHeaders } : extraHeaders),
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return { status: r.status, ok: r.ok, json, text };
  }
  select(table, query) { return this.req("GET", `/rest/v1/${table}?${query}`); }
  insert(table, rows, prefer = "return=representation") {
    return this.req("POST", `/rest/v1/${table}?`, rows, { Prefer: prefer });
  }
  update(table, query, patch) {
    return this.req("PATCH", `/rest/v1/${table}?${query}`, patch, { Prefer: "return=representation" });
  }
  del(table, query) { return this.req("DELETE", `/rest/v1/${table}?${query}`); }
  rpc(fn, args) { return this.req("POST", `/rest/v1/rpc/${fn}`, args); }
}

export function uuid() { return crypto.randomUUID(); }
