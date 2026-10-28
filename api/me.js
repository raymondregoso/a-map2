import { readSession, send } from "./_auth.js";

export default function handler(req, res) {
  const s = readSession(req);
  if (!s) return send(res, 401, { error: "Signed out." });
  return send(res, 200, { email: s.email, claude: !!process.env.ANTHROPIC_API_KEY });
}
