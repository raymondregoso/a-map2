import { allowedDomain, users, checkPassword, makeSession, sessionCookie, send, SESSION_HOURS } from "./_auth.js";

// Best-effort lockout: 5 wrong tries pauses that email for 15 minutes (per server instance).
const fails = new Map();
const MAX_TRIES = 5, LOCK_MS = 15 * 60e3;

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Use POST." });
  if ((process.env.SESSION_SECRET || "").length < 32) return send(res, 500, { error: "Sign-in isn't set up yet: add SESSION_SECRET in Vercel and redeploy." });
  if (!users().size) return send(res, 500, { error: "No employees are set up yet: add JVM_USERS in Vercel and redeploy." });

  const body = typeof req.body === "string" ? safeJSON(req.body) : (req.body || {});
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email || !password) return send(res, 400, { error: "Enter your email and password." });
  if (!email.endsWith("@" + allowedDomain())) return send(res, 403, { error: `Use your @${allowedDomain()} email.` });

  const now = Date.now();
  let f = fails.get(email);
  if (f && f.until && f.until <= now) { fails.delete(email); f = null; }   // lockout over: start fresh
  if (f && f.until > now) return send(res, 429, { error: "Too many tries. Wait 15 minutes, then try again." });

  const ok = checkPassword(password, users().get(email));
  if (!ok) {
    const n = (f ? f.n : 0) + 1;
    fails.set(email, { n, until: n >= MAX_TRIES ? now + LOCK_MS : 0 });
    return send(res, 401, { error: "That email and password don't match." });
  }
  fails.delete(email);
  res.setHeader("Set-Cookie", sessionCookie(makeSession(email), SESSION_HOURS * 3600));
  return send(res, 200, { ok: true });
}

function safeJSON(s) { try { return JSON.parse(s); } catch { return {}; } }
