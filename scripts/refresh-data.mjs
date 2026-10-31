// Refreshes data/opdb.json from the Open Pinball Database (https://opdb.org).
// Runs daily from .github/workflows/refresh-data.yml. Needs Node 20+ (built-in fetch).
// Requires an OPDB API token in the OPDB_API_TOKEN environment variable.
import { readFile, writeFile } from "node:fs/promises";

const TOKEN = process.env.OPDB_API_TOKEN;
const ROOT = new URL("../", import.meta.url);
const MACHINES = new URL("data/machines.json", ROOT);
const OUT = new URL("data/opdb.json", ROOT);

if (!TOKEN) {
  console.log("OPDB_API_TOKEN is not set. Skipping refresh; existing data/opdb.json is kept.");
  process.exit(0);
}

const norm = s => String(s || "").toLowerCase()
  .replace(/\(.*?\)/g, " ")          // drop "(Remake)", "(Premium)" etc.
  .replace(/^the\s+/, "")
  .replace(/[^a-z0-9]+/g, " ").trim();

const makerName = m => typeof m.manufacturer === "object" && m.manufacturer
  ? (m.manufacturer.name || m.manufacturer.full_name || "")
  : (m.manufacturer || "");

// Prefer a Pro/base machine over Premium/LE when several trims share a name.
const trimRank = name => /\bpro\b/i.test(name) ? 0 : /premium/i.test(name) ? 1 : /limited|\ble\b|collector|ce\b/i.test(name) ? 2 : 0.5;

function pick(entry, all) {
  if (entry.opdb_id) return all.find(m => m.opdb_id === entry.opdb_id) || null;
  const want = norm(entry.name), maker = norm(entry.maker);
  const remake = /remake/i.test(entry.name);
  const candidates = all.filter(m => {
    if (m.is_machine === false) return false;
    const n = norm(m.name), cn = norm(m.common_name);
    const nameOk = n === want || cn === want || n.startsWith(want + " ");
    const mk = norm(makerName(m));
    const makerOk = !maker || mk.includes(maker) || maker.includes(mk);
    return nameOk && makerOk;
  });
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const ya = String(a.manufacture_date || "").slice(0, 4), yb = String(b.manufacture_date || "").slice(0, 4);
    const da = Math.abs((+ya || 0) - entry.year), db = Math.abs((+yb || 0) - entry.year);
    if (remake && da !== db) return da - db;
    return trimRank(a.name) - trimRank(b.name) || da - db;
  });
  return candidates[0];
}

const editorial = JSON.parse(await readFile(MACHINES, "utf8"));
const res = await fetch("https://opdb.org/api/export?api_token=" + encodeURIComponent(TOKEN), {
  headers: { "Accept": "application/json", "User-Agent": "PinballAdvisor data refresh (github.com/lincolnspaxton/pinballadvisor)" }
});
if (!res.ok) {
  console.error(`OPDB export failed: HTTP ${res.status}. Existing data/opdb.json is kept.`);
  process.exit(res.status === 429 ? 0 : 1);
}
const all = await res.json();
if (!Array.isArray(all)) { console.error("Unexpected OPDB export shape."); process.exit(1); }

const out = { source: "Open Pinball Database (opdb.org)", updated: new Date().toISOString(), machines: {} };
let matched = 0;
for (const entry of editorial.machines) {
  const m = pick(entry, all);
  if (!m) { console.warn(`No OPDB match for "${entry.name}" (${entry.maker}). Set "opdb_id" in data/machines.json to pin it.`); continue; }
  matched++;
  out.machines[entry.id] = {
    opdb_id: m.opdb_id,
    name: m.name,
    manufacturer: makerName(m),
    manufacture_date: m.manufacture_date || null,
    ipdb_id: m.ipdb_id || null,
    type: m.type || null,
    display: m.display || null,
    player_count: m.player_count || null,
    features: Array.isArray(m.features) ? m.features : [],
    keywords: Array.isArray(m.keywords) ? m.keywords : []
  };
}

let prev = null;
try { prev = JSON.parse(await readFile(OUT, "utf8")); } catch {}
if (prev && JSON.stringify(prev.machines) === JSON.stringify(out.machines)) {
  console.log(`No changes (${matched}/${editorial.machines.length} matched).`);
} else {
  await writeFile(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote data/opdb.json (${matched}/${editorial.machines.length} matched).`);
}
