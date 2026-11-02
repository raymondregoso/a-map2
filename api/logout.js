// Clears the session cookie.
import { clearSessionCookie } from "./_auth.js";
export default function handler(req, res) {
  res.setHeader("Set-Cookie", clearSessionCookie());
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") { res.statusCode = 302; res.setHeader("Location", "/login"); return res.end(); }
  return res.status(200).json({ ok: true });
}
