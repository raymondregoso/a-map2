// Shared sign-in helpers for the /api functions (Node runtime).
import crypto from "node:crypto";

export const COOKIE = "btr_session";
export const SESSION_HOURS = 12;

export function allowedDomain() {
  return (process.env.ALLOWED_DOMAIN || "jvmlending.com").trim().toLowerCase();
}

// Passwords are stored only as scrypt hashes: "email:salt:hash".
export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password).normalize("NFKC"), salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
  return { salt, hash };
}

export function users() {
  const map = new Map();
  for (const raw of String(process.env.JVM_USERS || "").split(/[,\n]+/)) {
    const [email, salt, hash] = raw.trim().replace(/^"|"$/g, "").split(":");
    if (email && salt && /^[0-9a-f]{128}$/i.test(hash || "")) map.set(email.toLowerCase(), { salt, hash: hash.toLowerCase() });
  }
  return map;
}

export function checkPassword(password, user) {
  // Hash even when the user doesn't exist, so a wrong email takes as long as a wrong password.
  const salt = user ? user.salt : "0".repeat(32);
  const { hash } = hashPassword(password, salt);
  if (!user) return false;
  const a = Buffer.from(hash, "hex"), b = Buffer.from(user.hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function secret() {
  const s = process.env.SESSION_SECRET || "";
  if (s.length < 32) throw Object.assign(new Error("SESSION_SECRET is missing or shorter than 32 characters."), { code: "not_configured" });
  return s;
}

export function makeSession(email) {
  const payload = Buffer.from(JSON.stringify({ e: email, x: Date.now() + SESSION_HOURS * 3600e3 })).toString("base64url");
  const sig = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  return payload + "." + sig;
}

export function readSession(req) {
  const m = String(req.headers.cookie || "").match(new RegExp("(?:^|;\\s*)" + COOKIE + "=([^;]+)"));
  if (!m) return null;
  const [payload, sig] = m[1].split(".");
  if (!payload || !sig) return null;
  let want;
  try { want = crypto.createHmac("sha256", secret()).update(payload).digest("base64url"); } catch { return null; }
  const a = Buffer.from(sig), b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const { e, x } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!e || Date.now() > x || !users().has(e)) return null;
    return { email: e };
  } catch { return null; }
}

export function sessionCookie(value, maxAge) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}
