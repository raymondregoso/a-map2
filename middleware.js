// Runs before every request: nothing loads (pages or /api) without a valid JVM sign-in.
import { next } from "@vercel/functions";

export const config = { matcher: "/:path*" };

const OPEN = new Set(["/login", "/login.html", "/api/login", "/favicon.ico", "/favicon.svg", "/jvm-logo.png", "/robots.txt"]);
const COOKIE = "btr_session";

function b64urlToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}
function bytesToB64url(buf) {
  let bin = ""; for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function userEmails() {
  return new Set(String(process.env.JVM_USERS || "").split(/[,\n]+/)
    .map(x => x.trim().replace(/^"|"$/g, "").split(":")[0].toLowerCase()).filter(Boolean));
}

async function validSession(req) {
  const secret = process.env.SESSION_SECRET || "";
  if (secret.length < 32) return false;
  const m = (req.headers.get("cookie") || "").match(/(?:^|;\s*)btr_session=([^;]+)/);
  if (!m) return false;
  const [payload, sig] = m[1].split(".");
  if (!payload || !sig) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const want = bytesToB64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  if (want.length !== sig.length) return false;
  let diff = 0; for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff) return false;
  try {
    const { e, x } = JSON.parse(new TextDecoder().decode(b64urlToBytes(payload)));
    return !!e && Date.now() < x && userEmails().has(e);   // removed employees lose access on their next click
  } catch { return false; }
}

export default async function middleware(req) {
  const url = new URL(req.url);
  if (OPEN.has(url.pathname)) return next();
  if (await validSession(req)) return next();
  if (url.pathname.startsWith("/api/"))
    return new Response(JSON.stringify({ error: "Signed out." }), { status: 401, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  const to = new URL("/login", url);
  if (url.pathname !== "/") to.searchParams.set("next", url.pathname + url.search);
  return Response.redirect(to, 302);
}
