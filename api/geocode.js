// POST { addresses: [...] } → street-level coordinates from the free US Census geocoder
import { geocodeMany } from "./_lib.js";
export default async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  const addresses = req.body && req.body.addresses;
  if (!Array.isArray(addresses) || !addresses.length) return res.status(400).json({ error: "Send { addresses: [...] }" });
  try { res.status(200).json({ results: await geocodeMany(addresses.slice(0, 80)) }); }
  catch (e) { res.status(502).json({ error: e.message }); }
};
