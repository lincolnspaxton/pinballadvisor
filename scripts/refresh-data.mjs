// Refreshes data/opdb.json from the Open Pinball Database (https://opdb.org),
// using the free daily OPDB export hosted by Match Play (no token needed):
// https://docs.matchplay.events/data-exports
// Runs daily from .github/workflows/refresh-data.yml. Needs Node 20+ (built-in fetch).
import { readFile, writeFile } from "node:fs/promises";

const EXPORT_URL = "https://mp-data.sfo3.cdn.digitaloceanspaces.com/opdb-v2.json";
const ROOT = new URL("../", import.meta.url);
const MACHINES = new URL("data/machines.json", ROOT);
const OUT = new URL("data/opdb.json", ROOT);

const norm = s => String(s || "").toLowerCase()
  .replace(/\(.*?\)/g, " ")           // drop "(Remake)", "(Premium)" etc.
  .replace(/^the\s+/, "")
  .replace(/[^a-z0-9]+/g, " ").trim();

const featureNames = e => (e.features || []).map(f => (f && f.name) || "").join(" ");

// Prefer the Pro / base edition when several trims share a name.
function trimRank(e) {
  const t = (e.name + " " + featureNames(e)).toLowerCase();
  if (/\bpro\b/.test(t)) return 0;
  if (/premium/.test(t)) return 2;
  if (/limited|\ble\b|collector|\bce\b|anniversary/.test(t)) return 3;
  return 1;
}

function pick(entry, all) {
  if (entry.opdb_id) return all.find(e => e.opdbId === entry.opdb_id) || null;
  const want = norm(entry.name), maker = norm(entry.maker);
  const candidates = all.filter(e => {
    if (e.entryType !== "machine" || e.physicalMachine === false) return false;
    const n = norm(e.name), cn = norm(e.commonName);
    const nameOk = n === want || cn === want;
    const mk = norm(e.manufacturer && (e.manufacturer.name || e.manufacturer.fullName));
    const makerOk = !maker || (mk && (mk.includes(maker) || maker.includes(mk)));
    return nameOk && makerOk;
  });
  if (!candidates.length) return null;
  const yearGap = e => Math.abs((+e.year || +String(e.manufactureDate || "").slice(0, 4) || 0) - entry.year);
  candidates.sort((a, b) => yearGap(a) - yearGap(b) || trimRank(a) - trimRank(b));
  return candidates[0];
}

const editorial = JSON.parse(await readFile(MACHINES, "utf8"));
let res;
try {
  res = await fetch(EXPORT_URL, { headers: { "Accept": "application/json", "User-Agent": "PinballAdvisor data refresh (github.com/lincolnspaxton/pinballadvisor)" } });
} catch (err) {
  console.error(`Couldn't download the OPDB export: ${err.message}. Existing data/opdb.json is kept.`);
  process.exit(1);
}
if (!res.ok) { console.error(`OPDB export download failed: HTTP ${res.status}. Existing data/opdb.json is kept.`); process.exit(1); }
const body = await res.json();
const all = Array.isArray(body) ? body : body.entries;
if (!Array.isArray(all)) { console.error("Unexpected OPDB export shape."); process.exit(1); }

const out = { source: "Open Pinball Database (opdb.org), via the Match Play data export", machines: {} };
let matched = 0;
for (const entry of editorial.machines) {
  const e = pick(entry, all);
  if (!e) { console.warn(`No OPDB match for "${entry.name}" (${entry.maker}). Set "opdb_id" in data/machines.json to pin it.`); continue; }
  matched++;
  const people = (e.people || []).slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  out.machines[entry.id] = {
    opdb_id: e.opdbId,
    name: e.name,
    manufacturer: e.manufacturer ? e.manufacturer.name : null,
    manufacture_date: e.manufactureDate || null,
    ipdb_id: e.ipdbId || null,
    type: e.type || null,
    display: e.display || null,
    player_count: e.playerCount || null,
    designers: people.filter(p => p.role === "design").map(p => p.name),
    artists: people.filter(p => p.role === "art").map(p => p.name),
    features: (e.features || []).filter(f => f && f.group !== "edition").map(f => f.name),
    rules_url: e.pinballRulesUrl || null,
    primer_url: e.pinballPrimerUrl || null
  };
  console.log(`  ${entry.name} → ${e.name} (${e.opdbId})`);
}

let prev = null;
try { prev = JSON.parse(await readFile(OUT, "utf8")); } catch {}
if (prev && JSON.stringify(prev.machines) === JSON.stringify(out.machines)) {
  console.log(`No changes (${matched}/${editorial.machines.length} matched).`);
} else {
  out.updated = new Date().toISOString();
  await writeFile(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote data/opdb.json (${matched}/${editorial.machines.length} matched).`);
}
