// Shared logic for the Vercel functions (files starting with _ are not deployed as routes).
const KEY = process.env.ANTHROPIC_API_KEY || "";
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";

function send(res, code, obj) { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); }
function readBody(req, limit = 30e6) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > limit) { reject(new Error("Request too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString() || "{}")); } catch (e) { reject(new Error("Bad JSON")); } });
    req.on("error", reject);
  });
}

// ---- geocoding ----
const cache = new Map();
async function census(address) {
  const url = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=" + encodeURIComponent(address);
  const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!r.ok) return null;
  const j = await r.json();
  const m = j && j.result && j.result.addressMatches && j.result.addressMatches[0];
  if (!m) return null;
  return { lat: m.coordinates.y, lng: m.coordinates.x, address: m.matchedAddress };
}
async function claudeJSON(prompt, images = []) {
  const content = [...images.map(im => ({ type: "image", source: { type: "base64", media_type: im.media_type, data: im.data } })), { type: "text", text: prompt + "\n\nReply with only the JSON, no other text." }];
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 4000, messages: [{ role: "user", content }] }),
    signal: AbortSignal.timeout(120000),
  });
  const j = await r.json();
  if (!r.ok) { const e = new Error((j.error && j.error.message) || "Claude request failed"); e.code = r.status === 429 ? "rate_limited" : "upstream_error"; throw e; }
  const text = (j.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/); const raw = m ? m[1] : text.slice(Math.min(...["[", "{"].map(c => text.indexOf(c)).filter(i => i >= 0)));
  try { return JSON.parse(raw); } catch { const e = new Error("Couldn't read Claude's answer"); e.code = "invalid_json"; throw e; }
}
async function geocodeOne(address) {
  const k = address.toLowerCase().trim();
  if (cache.has(k)) return cache.get(k);
  let hit = null;
  try { hit = await census(address); } catch { hit = null; }
  if (!hit && !/\bCA\b/i.test(address)) { try { hit = await census(address + ", CA"); } catch { hit = null; } }
  if (hit) { hit.src = "census"; cache.set(k, hit); }
  return hit;
}
async function geocodeMany(addresses) {
  const out = new Array(addresses.length).fill(null);
  let next = 0;
  async function worker() { while (next < addresses.length) { const i = next++; out[i] = await geocodeOne(String(addresses[i] || "")); } }
  await Promise.all(Array.from({ length: 4 }, worker));
  // Place names the Census can't match (e.g. "Pleasant Hill Senior Center") → ask Claude, if a key is set
  const missing = out.map((v, i) => (v ? null : i)).filter(i => i !== null);
  if (missing.length && KEY) {
    try {
      const res = await claudeJSON("Geocode these places in the San Francisco Bay Area, California. Give latitude and longitude to 4 decimal places and the full street address. Use null if you cannot place one within about 300 m.\nReturn a JSON array of {\"i\":number,\"lat\":number|null,\"lng\":number|null,\"address\":string|null}.\n\n" + missing.map(i => i + ". " + addresses[i]).join("\n"));
      for (const r of Array.isArray(res) ? res : []) { if (missing.includes(+r.i) && typeof r.lat === "number" && typeof r.lng === "number") out[+r.i] = { lat: r.lat, lng: r.lng, address: r.address || null, src: "claude" }; }
    } catch { /* keep nulls */ }
  }
  return out.map((v, i) => (v ? { i, lat: v.lat, lng: v.lng, address: v.address } : { i, lat: null, lng: null }));
}


export { KEY, geocodeMany, claudeJSON };
