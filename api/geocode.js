// Street-level pins from the free US Census geocoder (no key needed).
import { readSession, send } from "./_auth.js";

const CENSUS = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";

async function one(address) {
  const url = CENSUS + "?benchmark=Public_AR_Current&format=json&address=" + encodeURIComponent(address);
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const m = (await r.json())?.result?.addressMatches?.[0];
    if (!m) return null;
    return { lat: +m.coordinates.y, lng: +m.coordinates.x, address: m.matchedAddress || null };
  } catch { return null; }
}

export default async function handler(req, res) {
  if (!readSession(req)) return send(res, 401, { error: "Signed out." });
  if (req.method !== "POST") return send(res, 405, { error: "Use POST." });
  const list = Array.isArray(req.body?.addresses) ? req.body.addresses.slice(0, 80).map(String) : [];
  if (!list.length) return send(res, 400, { error: "Send { addresses: [...] }" });
  const out = new Array(list.length).fill(null);
  let next = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (next < list.length) { const i = next++; out[i] = await one(list[i]); }
  }));
  return send(res, 200, { results: out });
}
