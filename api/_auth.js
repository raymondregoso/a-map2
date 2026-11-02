// Employee sign-in: who may log in, password checks, and signed session cookies.
// Configured with Vercel environment variables (Settings → Environment Variables):
//   SESSION_SECRET  — any long random string (32+ characters). Required; sign-in is off without it.
//   JVM_USERS       — one entry per employee, "email:salt:hash", separated by commas or new lines.
//                     Make entries with:  node scripts/add-user.mjs name@jvmlending.com
//   ALLOWED_DOMAIN  — optional, defaults to jvmlending.com. Only emails at this domain can sign in.
import crypto from "node:crypto";

export const COOKIE = "jvm_tour_session";
export const SESSION_HOURS = 12;
const DOMAIN = (process.env.ALLOWED_DOMAIN || "jvmlending.com").toLowerCase().trim();

function secret() {
  const s = process.env.SESSION_SECRET || "";
  return s.length >= 32 ? s : null;
}
export function authConfigured() { return !!secret() && users().size > 0; }

export function allowedEmail(email) {
  return typeof email === "string" && /^[^@\s]+@[^@\s]+$/.test(email) && email.toLowerCase().endsWith("@" + DOMAIN);
}

function users() {
  const map = new Map();
  for (const entry of String(process.env.JVM_USERS || "").split(/[\s,]+/)) {
    const [email, salt, hash] = entry.split(":");
    if (email && salt && hash && allowedEmail(email)) map.set(email.toLowerCase(), { salt, hash });
  }
  return map;
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password), salt, 32, { N: 16384, r: 8, p: 1 }).toString("hex");
  return { salt, hash };
}

const DUMMY = hashPassword("not-a-real-password", "0".repeat(32));
export function checkPassword(email, password) {
  const u = users().get(String(email || "").toLowerCase().trim());
  // Always run the hash so a wrong email takes as long as a wrong password.
  const ref = u || DUMMY;
  const got = Buffer.from(hashPassword(password, ref.salt).hash, "hex");
  const want = Buffer.from(ref.hash, "hex");
  return !!u && got.length === want.length && crypto.timingSafeEqual(got, want);
}

const b64u = buf => Buffer.from(buf).toString("base64url");
function sign(payload) { return b64u(crypto.createHmac("sha256", secret()).update(payload).digest()); }

export function makeSessionCookie(email) {
  const payload = b64u(JSON.stringify({ u: email.toLowerCase(), exp: Date.now() + SESSION_HOURS * 3600e3 }));
  const value = payload + "." + sign(payload);
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_HOURS * 3600}`;
}
export function clearSessionCookie() { return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`; }

// Returns the signed-in email, or null.
export function readSession(cookieHeader) {
  if (!secret()) return null;
  const m = String(cookieHeader || "").match(new RegExp("(?:^|;\\s*)" + COOKIE + "=([^;]+)"));
  if (!m) return null;
  const [payload, sig] = m[1].split(".");
  if (!payload || !sig) return null;
  const want = Buffer.from(sign(payload)), got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  try {
    const { u, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!u || typeof exp !== "number" || exp < Date.now()) return null;
    if (!users().has(u)) return null; // removing someone from JVM_USERS signs them out
    return u;
  } catch { return null; }
}
