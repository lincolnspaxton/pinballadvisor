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

// ---------------------------------------------------------------------------
// Catalog: every physical machine from CATALOG_FROM onward, one entry per
// title (trims grouped together). New releases appear here automatically.
// Reviewed machines are skipped because they already have full pages.
// ---------------------------------------------------------------------------
const CATALOG = new URL("data/catalog.json", ROOT);
const CATALOG_FROM = 1990;

const slug = s => String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
const baseTitle = name => String(name).replace(/\s*\((pro|premium|limited edition|le|ce|collector'?s edition|standard|anniversary edition|[^)]*edition)\)\s*$/i, "").trim();
const yearOf = e => +e.year || +String(e.manufactureDate || "").slice(0, 4) || 0;
const today = new Date().toISOString().slice(0, 10);

const reviewedGroups = new Set(Object.values(out.machines).map(m => String(m.opdb_id || "").split("-")[0]).filter(Boolean));
const reviewedIds = new Set(editorial.machines.map(m => m.id));

const groups = new Map();
for (const e of all) {
  if (e.entryType !== "machine" || e.physicalMachine === false) continue;
  const y = yearOf(e);
  if (y < CATALOG_FROM) continue;
  if (e.manufactureDate && e.manufactureDate > today) continue; // announced but not out yet
  const g = e.opdbGroup || String(e.opdbId).split("-")[0];
  if (!g || reviewedGroups.has(g)) continue;
  if (!groups.has(g)) groups.set(g, []);
  groups.get(g).push(e);
}

const items = [];
const usedIds = new Set(reviewedIds);
for (const [g, list] of groups) {
  list.sort((a, b) => trimRank(a) - trimRank(b) || yearOf(a) - yearOf(b));
  const base = list[0];
  const title = baseTitle(base.commonName || base.name);
  const maker = base.manufacturer ? base.manufacturer.name : "";
  const y = Math.min(...list.map(yearOf));
  let id = slug(title) || slug(g);
  if (usedIds.has(id)) id = slug(title + "-" + y);
  if (usedIds.has(id)) id = slug(title + "-" + maker + "-" + y);
  if (usedIds.has(id)) id = slug(g);
  usedIds.add(id);
  const people = (base.people || []).slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const trims = list.length > 1 ? [...new Set(list.map(e => {
    const m = String(e.name).match(/\(([^)]+)\)\s*$/); return m ? m[1] : "Standard";
  }))] : [];
  const firstDate = list.map(e => e.manufactureDate).filter(Boolean).sort()[0] || null;
  const item = { id, g, n: title, mk: maker, y, date: firstDate };
  if (base.type) item.type = base.type;
  if (base.display) item.display = base.display;
  if (base.playerCount) item.players = base.playerCount;
  const designers = people.filter(p => p.role === "design").map(p => p.name);
  if (designers.length) item.design = designers;
  if (trims.length) item.trims = trims;
  const rules = list.map(e => e.pinballRulesUrl).find(Boolean); if (rules) item.rules = rules;
  const primer = list.map(e => e.pinballPrimerUrl).find(Boolean); if (primer) item.primer = primer;
  items.push(item);
}
items.sort((a, b) => String(b.date || b.y).localeCompare(String(a.date || a.y)) || a.n.localeCompare(b.n));

const catalog = { source: "Open Pinball Database (opdb.org), via the Match Play data export", from: CATALOG_FROM, count: items.length, machines: items };
let prevCat = null;
try { prevCat = JSON.parse(await readFile(CATALOG, "utf8")); } catch {}
if (prevCat && JSON.stringify(prevCat.machines) === JSON.stringify(items)) {
  console.log(`Catalog unchanged (${items.length} titles).`);
} else {
  catalog.updated = new Date().toISOString();
  await writeFile(CATALOG, JSON.stringify(catalog) + "\n");
  const before = new Set((prevCat?.machines || []).map(m => m.g));
  const added = items.filter(m => !before.has(m.g));
  console.log(`Wrote data/catalog.json (${items.length} titles${prevCat ? `, ${added.length} new` : ""}).`);
  for (const m of added.slice(0, 20)) console.log(`  new: ${m.n} (${m.mk}, ${m.y})`);
}
