// POST { email, password } → sets the session cookie for JVM Lending employees.
import { authConfigured, allowedEmail, checkPassword, makeSessionCookie } from "./_auth.js";

// Slow down password guessing: 5 misses per email/IP per 15 minutes (per server instance).
const misses = new Map();
const WINDOW = 15 * 60e3, LIMIT = 5;
function tooMany(key) {
  const now = Date.now(), list = (misses.get(key) || []).filter(t => now - t < WINDOW);
  misses.set(key, list);
  return list.length >= LIMIT;
}
function miss(key) { (misses.get(key) || misses.set(key, []).get(key)).push(Date.now()); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  if (!authConfigured()) return res.status(503).json({ error: "Sign-in isn't set up yet. An admin needs to add SESSION_SECRET and JVM_USERS in Vercel." });
  const email = String((req.body && req.body.email) || "").trim().toLowerCase();
  const password = String((req.body && req.body.password) || "");
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const keys = ["e:" + email, "ip:" + ip];
  if (keys.some(tooMany)) return res.status(429).json({ error: "Too many attempts. Wait 15 minutes and try again." });
  if (!allowedEmail(email)) { await sleep(400); return res.status(401).json({ error: "Use your JVM Lending email address." }); }
  if (!password || !checkPassword(email, password)) {
    keys.forEach(miss); await sleep(400);
    return res.status(401).json({ error: "That email and password don't match. Check them and try again." });
  }
  keys.forEach(k => misses.delete(k));
  res.setHeader("Set-Cookie", makeSessionCookie(email));
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ ok: true });
}
