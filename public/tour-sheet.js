// Tour sheet tools: clean the MLS "Tour/Open House" export into the team's Monday Broker Tour layout,
// split it by team, and write .xlsx files that match the reference file's formatting.
// Works in the browser (window.TourSheet) and in Node for testing (module.exports).
(function (root) {
  "use strict";
  const T = root.JVM_TEMPLATE || (typeof require !== "undefined" ? require("./tour-template.js") : null);

  // ---------- output layout (from Monday_Broker_Tour_11.02.26.xlsx) ----------
  const HEAD = ["Visited", "Call", "Start", "End", "LS", "BS", "Listing Agent ", "Address", "City", "Price", "Brokerage", "Phone", "Color", "Status", "Days On Market", "Building Type", "Cross Street", "MLS #", "Date"];
  const C = { visited: 0, call: 1, start: 2, end: 3, ls: 4, bs: 5, agent: 6, address: 7, city: 8, price: 9, brokerage: 10, phone: 11, color: 12, status: 13, dom: 14, type: 15, cross: 16, mls: 17, date: 18 };
  // Optional 20th column some tour sheets carry; kept on export when the imported sheet has it.
  const ELIG_HEAD = "HomeRun Eligible", ELIG = 19;
  // A yellow row whose HomeRun Eligible says this becomes white on Split by team.
  const isIncomeLimited = v => String(v == null ? "" : v).toLowerCase().replace(/\s+/g, " ").trim() === "yes, income limit of $127,840";
  const HEAD_STYLE = [1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 2, 2, 2, 4];
  const BODY_STYLE = [9, 9, 5, 5, 6, 6, 6, 6, 6, 7, 6, 6, 6, 6, 6, 6, 6, 6, 8];

  // ---------- rules ----------
  const RULES = {
    yellowMax: 840000,      // $0 – $840,000 → yellow
    greenMax: 1300000,      // above yellow up to this → green; above → white
    dropStartFrom: 8 * 60, dropStartTo: 8 * 60 + 30,   // starts 8:00–8:30 AM
    dropEndFrom: 16 * 60, dropEndTo: 23 * 60 + 59,     // ends 4:00–11:59 PM
    dropZips: ["94595"],
  };

  const TEAMS = [
    { key: "heejin", name: "Heejin", cities: ["Walnut Creek", "Alamo", "Lafayette", "Orinda", "San Ramon"] },
    { key: "aaron", name: "Aaron", cities: ["Albany", "Berkeley", "El Cerrito", "Kensington", "Emeryville", "Oakland", "Piedmont", "Richmond"] },
    { key: "andrei", name: "Andrei", cities: ["Concord", "Pleasant Hill", "Clayton", "Martinez", "Antioch", "Bay Point"] },
  ];
  const SHARED_CITIES = ["Castro Valley", "Hayward", "San Lorenzo", "Pleasanton", "Livermore"]; // go on every sheet

  // ---------- helpers ----------
  const normCity = s => String(s == null ? "" : s).toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  const normAddr = s => String(s == null ? "" : s).toLowerCase().replace(/[.,#]/g, " ").replace(/\s+/g, " ").trim();
  function money(v) {
    if (v == null || v === "") return null;
    if (typeof v === "number") return v;
    const m = String(v).replace(/[$,\s]/g, "").match(/^-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : null;
  }
  // minutes after midnight from "11:00 AM PST", "8:00", or an Excel time fraction
  function minutes(v) {
    if (v == null || v === "") return null;
    if (typeof v === "number") return v >= 0 && v < 1 ? Math.round(v * 1440) : null;
    const m = String(v).trim().match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*([ap])?\.?m?\.?/i);
    if (!m) return null;
    let h = +m[1]; const mi = +(m[2] || 0); const ap = (m[3] || "").toLowerCase();
    if (h > 23 || mi > 59) return null;
    if (ap === "p" && h < 12) h += 12; else if (ap === "a" && h === 12) h = 0;
    return h * 60 + mi;
  }
  function excelDate(v) {
    if (v == null || v === "") return null;
    if (typeof v === "number") return v > 20000 ? Math.floor(v) : null;
    if (v instanceof Date) return Math.round((Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()) - Date.UTC(1899, 11, 30)) / 864e5);
    const m = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/) || null;
    if (m) { let y = +m[3]; if (y < 100) y += 2000; return Math.round((Date.UTC(y, +m[1] - 1, +m[2]) - Date.UTC(1899, 11, 30)) / 864e5); }
    const iso = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return Math.round((Date.UTC(+iso[1], +iso[2] - 1, +iso[3]) - Date.UTC(1899, 11, 30)) / 864e5);
    return null;
  }
  function serialToDate(n) { const d = new Date(Date.UTC(1899, 11, 30) + n * 864e5); return d; }
  function numOrText(v) {
    if (v == null) return null;
    if (typeof v === "number") return v;
    const s = String(v).trim();
    if (s === "") return null;
    return /^\d+$/.test(s) && s.length < 16 ? Number(s) : s;
  }
  // "Garrett Frakes - Agt: 415-505-1077" → ["Garrett Frakes ", "415-505-1077"]
  function splitAgent(v) {
    const s = String(v == null ? "" : v);
    const i = s.indexOf(" - ");
    if (i < 0) return [s.trim(), ""];
    return [s.slice(0, i).trim() + " ", s.slice(i + 3).replace(/^[A-Za-z .]+:\s*/, "").trim()];
  }
  function colorFor(price, rules) {
    rules = rules || RULES;
    if (price == null) return "white";
    if (price <= rules.yellowMax) return "yellow";
    if (price <= rules.greenMax) return "green";
    return "white";
  }

  // ---------- raw MLS export → team layout ----------
  const RAW = {
    mls: /^mls\s*#?$|^mls\s*(number|no)/i,
    type: /building\s*type|property\s*type|prop\s*type/i,
    address: /^address$|^street\s*address$|^full\s*address$/i,
    city: /^city$/i,
    zip: /^zip|postal/i,
    status: /^status$/i,
    date: /start\s*date|^date$|open\s*house\s*date/i,
    start: /start\s*time|^start$|from\s*time/i,
    end: /end\s*time|^end$|to\s*time/i,
    agent: /listing\s*agent|agent\s*name/i,
    price: /list\s*price|^price$|^lp$/i,
    cross: /cross\s*street/i,
    dom: /days\s*on\s*market|^dom$|^cdom$/i,
    office: /office\s*name|listing\s*office|brokerage/i,
  };
  function findRawHeader(aoa) {
    for (let i = 0; i < Math.min(15, aoa.length); i++) {
      const r = (aoa[i] || []).map(x => String(x == null ? "" : x).trim());
      if (r.some(c => RAW.address.test(c)) && r.some(c => RAW.city.test(c))) return i;
    }
    return -1;
  }
  function mapRaw(hdr) {
    const m = {};
    hdr.forEach((h, i) => {
      const s = String(h == null ? "" : h).trim();
      for (const k in RAW) if (m[k] == null && RAW[k].test(s)) { m[k] = i; break; }
    });
    return m;
  }

  // aoa = array of rows (first sheet), returns { rows (19-col arrays), stats, date, missing }
  function processRaw(aoa, rules) {
    rules = Object.assign({}, RULES, rules || {});
    const hi = findRawHeader(aoa);
    if (hi < 0) return { error: "Couldn't find the header row. The file needs Address and City columns, like the MLS Tour/Open House export." };
    const cm = mapRaw(aoa[hi]);
    const need = ["address", "city", "start", "end", "price"];
    const missing = need.filter(k => cm[k] == null);
    if (missing.includes("address") || missing.includes("city")) return { error: "Couldn't find the Address and City columns." };
    const stats = { read: 0, duplicates: [], earlyStart: [], lateEnd: [], zip: [], blank: 0 };
    const seen = new Set(), rows = [];
    let firstDate = null;
    for (let r = hi + 1; r < aoa.length; r++) {
      const row = aoa[r] || [];
      const g = k => (cm[k] != null ? row[cm[k]] : null);
      const address = String(g("address") == null ? "" : g("address")).trim();
      if (!address) { if (row.some(v => v != null && String(v).trim() !== "")) stats.blank++; continue; }
      stats.read++;
      const label = address + (g("city") ? ", " + String(g("city")).trim() : "");
      const zip = String(g("zip") == null ? "" : g("zip")).trim().slice(0, 5);
      if (rules.dropZips.includes(zip)) { stats.zip.push(label); continue; }
      const st = minutes(g("start")), en = minutes(g("end"));
      if (st != null && st >= rules.dropStartFrom && st <= rules.dropStartTo) { stats.earlyStart.push(label + " (starts " + String(g("start")).trim() + ")"); continue; }
      if (en != null && en >= rules.dropEndFrom && en <= rules.dropEndTo) { stats.lateEnd.push(label + " (ends " + String(g("end")).trim() + ")"); continue; }
      const key = normAddr(address) + "|" + normCity(g("city"));
      if (seen.has(key)) { stats.duplicates.push(label); continue; }
      seen.add(key);
      const [agent, phone] = splitAgent(g("agent"));
      const price = money(g("price"));
      const date = excelDate(g("date"));
      if (firstDate == null && date != null) firstDate = date;
      const out = new Array(19).fill(null);
      out[C.visited] = false; out[C.call] = false;
      out[C.start] = g("start") == null ? null : (typeof g("start") === "number" ? g("start") : String(g("start")).trim());
      out[C.end] = g("end") == null ? null : (typeof g("end") === "number" ? g("end") : String(g("end")).trim());
      out[C.agent] = agent || null;
      out[C.address] = address;
      out[C.city] = g("city") == null ? null : String(g("city")).trim();
      out[C.price] = price;
      out[C.brokerage] = g("office") == null || g("office") === "" ? null : String(g("office")).trim();
      out[C.phone] = phone || null;
      out[C.color] = colorFor(price, rules);
      out[C.status] = g("status") == null || g("status") === "" ? null : String(g("status")).trim();
      out[C.dom] = numOrText(g("dom"));
      out[C.type] = g("type") == null || g("type") === "" ? null : String(g("type")).trim();
      out[C.cross] = g("cross") == null || g("cross") === "" ? null : String(g("cross")).trim();
      out[C.mls] = numOrText(g("mls"));
      out[C.date] = date;
      rows.push(out);
    }
    return { rows, stats, date: firstDate, missing };
  }

  // ---------- read a sheet already in the team layout ----------
  function fromTeamLayout(aoa) {
    let hi = -1;
    for (let i = 0; i < Math.min(15, aoa.length); i++) {
      const r = (aoa[i] || []).map(x => String(x == null ? "" : x).trim().toLowerCase());
      if (r.includes("address") && r.includes("city")) { hi = i; break; }
    }
    if (hi < 0) return null;
    const hdr = aoa[hi].map(x => String(x == null ? "" : x).trim().toLowerCase());
    const idx = HEAD.map(h => hdr.indexOf(h.trim().toLowerCase()));
    const matched = idx.filter(i => i >= 0).length;
    if (matched < 10) return null; // not the team layout
    const eligIdx = hdr.indexOf(ELIG_HEAD.toLowerCase());
    const rows = [];
    let firstDate = null, recolored = 0;
    for (let r = hi + 1; r < aoa.length; r++) {
      const src = aoa[r] || [];
      const out = idx.map(i => (i >= 0 ? (src[i] === undefined || src[i] === "" ? null : src[i]) : null));
      if (eligIdx >= 0) out[ELIG] = src[eligIdx] === undefined || src[eligIdx] === "" ? null : src[eligIdx];
      if (!out[C.address]) continue;
      if (typeof out[C.visited] !== "boolean") out[C.visited] = /^(true|yes|x|1)$/i.test(String(out[C.visited] || ""));
      if (typeof out[C.call] !== "boolean") out[C.call] = /^(true|yes|x|1)$/i.test(String(out[C.call] || ""));
      out[C.price] = money(out[C.price]);
      if (!out[C.color]) out[C.color] = colorFor(out[C.price]);
      out[C.color] = String(out[C.color]).trim().toLowerCase();
      if (eligIdx >= 0 && out[C.color] === "yellow" && isIncomeLimited(out[ELIG])) { out[C.color] = "white"; recolored++; }
      const d = excelDate(out[C.date]);
      out[C.date] = d;
      if (firstDate == null && d != null) firstDate = d;
      rows.push(out);
    }
    return { rows, date: firstDate, recolored, hasEligibility: eligIdx >= 0 };
  }

  // ---------- team split ----------
  function teamFor(city) {
    const c = normCity(city);
    if (!c) return null;
    if (SHARED_CITIES.some(x => normCity(x) === c)) return "shared";
    const t = TEAMS.find(t => t.cities.some(x => normCity(x) === c));
    return t ? t.key : null;
  }
  function splitByTeam(rows) {
    const out = { sheets: {}, unassigned: [], shared: 0 };
    TEAMS.forEach(t => (out.sheets[t.key] = []));
    rows.forEach(r => {
      const k = teamFor(r[C.city]);
      if (k === "shared") { out.shared++; TEAMS.forEach(t => out.sheets[t.key].push(r)); }
      else if (k) out.sheets[k].push(r);
      else out.unassigned.push(r);
    });
    return out;
  }

  // ---------- .xlsx writer ----------
  const xmlEsc = s => String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const colL = i => { let s = ""; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

  function sheetXml(rows, sst, selected) {
    const n = rows.length + 1;
    const W = rows.some(r => r.length > ELIG) ? 20 : 19, last = colL(W - 1);
    const head = W === 20 ? HEAD.concat([ELIG_HEAD]) : HEAD;
    const cols = W === 20 ? T.cols.replace("</cols>", '<col min="20" max="20" width="44" customWidth="1"/></cols>') : T.cols;
    let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
    x += '<dimension ref="A1:' + last + n + '"/><sheetViews><sheetView' + (selected ? ' tabSelected="1"' : "") + ' workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="13.8"/>' + cols + "<sheetData>";
    x += '<row r="1" spans="1:' + W + '" ht="14.4">' + head.map((h, i) => '<c r="' + colL(i) + '1" s="' + (HEAD_STYLE[i] || 2) + '" t="s"><v>' + sst(h) + "</v></c>").join("") + "</row>";
    rows.forEach((row, ri) => {
      const r = ri + 2;
      x += '<row r="' + r + '" spans="1:' + W + '">';
      for (let i = 0; i < W; i++) {
        const ref = colL(i) + r, s = BODY_STYLE[i] || 6;
        let v = row[i];
        if (i === C.visited || i === C.call) { x += '<c r="' + ref + '" s="' + s + '" t="b"><v>' + (v === true ? 1 : 0) + "</v></c>"; continue; }
        if (v == null || v === "") { x += '<c r="' + ref + '" s="' + s + '"/>'; continue; }
        if (v instanceof Date) v = excelDate(v);
        if (typeof v === "boolean") x += '<c r="' + ref + '" s="' + s + '" t="b"><v>' + (v ? 1 : 0) + "</v></c>";
        else if (typeof v === "number" && isFinite(v)) x += '<c r="' + ref + '" s="' + s + '"><v>' + v + "</v></c>";
        else x += '<c r="' + ref + '" s="' + s + '" t="s"><v>' + sst(String(v)) + "</v></c>";
      }
      x += "</row>";
    });
    x += "</sheetData>";
    // yellow fill + hair borders for rows whose Color is "yellow" (same rule as the reference file)
    x += '<conditionalFormatting sqref="A1:F' + n + " H1:S" + n + '"><cfRule type="expression" dxfId="1" priority="2"><formula>$M1="yellow"</formula></cfRule></conditionalFormatting>';
    x += '<conditionalFormatting sqref="G1:G' + n + '"><cfRule type="expression" dxfId="0" priority="1"><formula>$M1="yellow"</formula></cfRule></conditionalFormatting>';
    x += '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>';
    return x;
  }

  // sheets: [{name, rows}] → Uint8Array (.xlsx)
  function buildXlsx(sheets) {
    const strings = [], sIndex = new Map();
    const sst = s => { if (!sIndex.has(s)) { sIndex.set(s, strings.length); strings.push(s); } return sIndex.get(s); };
    let count = 0;
    const sheetFiles = sheets.map((sh, i) => { count += sh.rows.length + 1; return sheetXml(sh.rows, sst, i === 0); });
    const N = sheets.length;
    const files = [];
    const add = (name, text) => files.push({ name, data: utf8(text) });
    add("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      sheets.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join("") +
      '<Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/featurePropertyBag/featurePropertyBag.xml" ContentType="application/vnd.ms-excel.featurepropertybag+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>');
    add("_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
    add("docProps/core.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>JVM Lending Broker Tour Router</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + now + "</dcterms:modified></cp:coreProperties>");
    add("docProps/app.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Microsoft Excel</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>' + N + '</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="' + N + '" baseType="lpstr">' + sheets.map(s => "<vt:lpstr>" + xmlEsc(s.name) + "</vt:lpstr>").join("") + "</vt:vector></TitlesOfParts><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>16.0300</AppVersion></Properties>");
    add("xl/workbook.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr defaultThemeVersion="202300"/><bookViews><workbookView xWindow="-108" yWindow="-108" windowWidth="23256" windowHeight="12576" activeTab="0"/></bookViews><sheets>' +
      sheets.map((s, i) => '<sheet name="' + xmlEsc(s.name.slice(0, 31)) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join("") + '</sheets><calcPr calcId="191029"/></workbook>');
    add("xl/_rels/workbook.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join("") +
      '<Relationship Id="rId' + (N + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/><Relationship Id="rId' + (N + 2) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId' + (N + 3) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId' + (N + 4) + '" Type="http://schemas.microsoft.com/office/2022/11/relationships/FeaturePropertyBag" Target="featurePropertyBag/featurePropertyBag.xml"/></Relationships>');
    sheetFiles.forEach((x, i) => add("xl/worksheets/sheet" + (i + 1) + ".xml", x));
    add("xl/theme/theme1.xml", T.theme);
    add("xl/styles.xml", T.styles);
    add("xl/featurePropertyBag/featurePropertyBag.xml", T.fpb);
    add("xl/sharedStrings.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="' + count + '" uniqueCount="' + strings.length + '">' +
      strings.map(s => "<si><t" + (/^\s|\s$/.test(s) ? ' xml:space="preserve"' : "") + ">" + xmlEsc(s) + "</t></si>").join("") + "</sst>");
    return zipStore(files);
  }

  // ---------- minimal ZIP (stored) ----------
  function utf8(s) { return typeof TextEncoder !== "undefined" ? new TextEncoder().encode(s) : Buffer.from(s, "utf8"); }
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function zipStore(files) {
    const parts = [], central = [];
    let offset = 0;
    const DOS_TIME = 0, DOS_DATE = (2026 - 1980) << 9 | 1 << 5 | 1;
    for (const f of files) {
      const name = utf8(f.name), data = f.data, crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, DOS_TIME, true); h.setUint16(12, DOS_DATE, true); h.setUint32(14, crc, true);
      h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, DOS_TIME, true); c.setUint16(14, DOS_DATE, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, name.length, true); c.setUint16(30, 0, true); c.setUint16(32, 0, true); c.setUint16(34, 0, true); c.setUint16(36, 0, true); c.setUint32(38, 0, true); c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const cdSize = central.reduce((a, b) => a + b.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
    const all = parts.concat(central, [new Uint8Array(e.buffer)]);
    const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
    let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
    return out;
  }

  // "Monday_Broker_Tour_11.02.26"
  function baseName(serial) {
    const d = serial != null ? serialToDate(serial) : new Date();
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const utc = serial != null;
    const day = utc ? d.getUTCDay() : d.getDay(), mm = (utc ? d.getUTCMonth() : d.getMonth()) + 1, dd = utc ? d.getUTCDate() : d.getDate(), yy = (utc ? d.getUTCFullYear() : d.getFullYear()) % 100;
    const p = n => String(n).padStart(2, "0");
    return days[day] + "_Broker_Tour_" + p(mm) + "." + p(dd) + "." + p(yy);
  }

  const api = { HEAD, C, RULES, TEAMS, SHARED_CITIES, processRaw, fromTeamLayout, splitByTeam, teamFor, buildXlsx, baseName, colorFor, minutes, splitAgent, excelDate };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.TourSheet = api;
})(typeof globalThis !== "undefined" ? globalThis : self);
