// Who is signed in (the middleware has already checked the session).
import { readSession } from "./_auth.js";
export default function handler(req, res) {
  const email = readSession(req.headers.cookie);
  res.setHeader("Cache-Control", "no-store");
  if (!email) return res.status(401).json({ error: "Not signed in" });
  return res.status(200).json({ email });
}
