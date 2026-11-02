// POST { prompt, images } → reads listing photos / messy text with Claude (needs ANTHROPIC_API_KEY)
import { KEY, claudeJSON } from "./_lib.js";
export default async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  if (!KEY) return res.status(403).json({ code: "not_granted", error: "Add ANTHROPIC_API_KEY in Vercel environment variables to read photos and messy text." });
  const { prompt, images } = req.body || {};
  if (!prompt) return res.status(400).json({ error: "Missing prompt" });
  try { res.status(200).json({ result: await claudeJSON(String(prompt).slice(0, 60000), Array.isArray(images) ? images.slice(0, 5) : []) }); }
  catch (e) { res.status(502).json({ code: e.code || "upstream_error", error: e.message }); }
};
