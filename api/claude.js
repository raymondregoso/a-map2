// Optional: reads listing photos and messy pasted text, and pins places the Census can't match.
// Only works when ANTHROPIC_API_KEY is set in Vercel.
import { readSession, send } from "./_auth.js";

export const config = { maxDuration: 60 };

const MODELS = {
  default: process.env.CLAUDE_MODEL || "claude-sonnet-5-5",
  quick: process.env.CLAUDE_QUICK_MODEL || "claude-haiku-5-5",
};

export default async function handler(req, res) {
  if (!readSession(req)) return send(res, 401, { error: "Signed out." });
  if (req.method !== "POST") return send(res, 405, { error: "Use POST." });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return send(res, 403, { code: "not_granted", error: "Add ANTHROPIC_API_KEY in Vercel to turn this on." });

  const { prompt, images, tier } = req.body || {};
  if (!prompt) return send(res, 400, { error: "Missing prompt." });
  const content = [];
  for (const im of (Array.isArray(images) ? images.slice(0, 5) : [])) {
    if (im && /^image\/(jpeg|png|webp|gif)$/.test(im.media_type) && typeof im.data === "string")
      content.push({ type: "image", source: { type: "base64", media_type: im.media_type, data: im.data } });
  }
  content.push({ type: "text", text: String(prompt).slice(0, 60000) + "\n\nReply with JSON only, no other text." });

  let r;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODELS[tier] || MODELS.default, max_tokens: 8000, messages: [{ role: "user", content }] }),
      signal: AbortSignal.timeout(55000),
    });
  } catch { return send(res, 502, { code: "upstream_error", error: "Couldn't reach Claude." }); }
  if (r.status === 429 || r.status === 529) return send(res, 429, { code: "rate_limited", error: "Claude is busy. Try again shortly." });
  if (!r.ok) return send(res, 502, { code: "upstream_error", error: "Claude returned an error (" + r.status + ")." });

  const j = await r.json();
  const text = (j.content || []).filter(c => c.type === "text").map(c => c.text).join("").replace(/```(?:json)?/g, "").trim();
  const start = text.search(/[\[{]/);
  try { return send(res, 200, { result: JSON.parse(text.slice(start)) }); }
  catch {
    const end = Math.max(text.lastIndexOf("]"), text.lastIndexOf("}"));
    try { return send(res, 200, { result: JSON.parse(text.slice(start, end + 1)) }); }
    catch { return send(res, 502, { code: "invalid_json", error: "Claude's answer couldn't be read." }); }
  }
}
