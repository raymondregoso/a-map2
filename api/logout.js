import { sessionCookie, send } from "./_auth.js";

export default function handler(req, res) {
  res.setHeader("Set-Cookie", sessionCookie("", 0));
  return send(res, 200, { ok: true });
}
