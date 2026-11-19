/**
 * Simulator Logic - Housing Selection Simulator helpers
 * Pure functions (no React, no network) that map a housing number to a selection time
 * and read availability from the scraped availability.json grid.
 * Also exports a runtime loader that fetches /data/availability.json (never bundled).
 */

export const PHASES = ["internal", "community"];
export const CLASSES = ["senior", "junior", "soph"];
export const PHASE_LABELS = { internal: "Internal", community: "Community" };
export const CLASS_LABELS = { senior: "Senior", junior: "Junior", soph: "Soph" };
const SIZE_ORDER = ["Single", "Double", "Triple", "Quad"];
export const TIME_ZONE = "America/New_York";

/** Vite's base path ("/" in dev and on the custom domain); "/" when running under Node (checks). */
function baseUrl() {
  return (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.BASE_URL) || "/";
}

/**
 * Fetch and sanity-check the availability data. Throws an Error with a user-facing message.
 */
export async function loadAvailability(url = `${baseUrl()}data/availability.json`) {
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error("Could not load availability data (network error).");
  }
  if (!res.ok) throw new Error(`Could not load availability data (HTTP ${res.status}).`);
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error("Availability data is missing or not valid JSON.");
  }
  if (!isValidData(data)) throw new Error("Availability data has an unexpected format.");
  return data;
}

/** Minimal schema check so a bad file shows an error instead of crashing the page. */
export function isValidData(data) {
  return Boolean(
    data &&
      data.meta &&
      Number.isFinite(data.meta.gridStart) &&
      Number.isFinite(data.meta.stepMinutes) &&
      Number.isFinite(data.meta.communityOpensAt) &&
      Number.isFinite(data.meta.internalStart) &&
      Array.isArray(data.meta.windows) &&
      data.meta.classRanges &&
      CLASSES.every((c) => Array.isArray(data.meta.classRanges[c])) &&
      data.anchors &&
      Array.isArray(data.categories) &&
      data.categories.every(
        (c) =>
          c &&
          Array.isArray(c.openRooms) &&
          Array.isArray(c.emptyRooms) &&
          Array.isArray(c.openSpaces) &&
          Number.isFinite(c.rooms) &&
          c.fillBuckets &&
          c.spacesTaken
      )
  );
}

/** Anchor lists for a phase, in day order (internal_d1, internal_d2, ...). */
function daysForPhase(anchors, phase) {
  return Object.keys(anchors)
    .filter((k) => k.startsWith(`${phase}_d`))
    .sort((a, b) => Number(a.split("_d")[1]) - Number(b.split("_d")[1]))
    .map((k) => {
      return [...anchors[k]].sort((a, b) => a.n - b.n);
    });
}

/** Monotone linear interpolation over points sorted by n; clamps outside the range. */
function interpolate(points, n) {
  if (!points.length) return NaN;
  if (n <= points[0].n) return points[0].t;
  const last = points[points.length - 1];
  if (n >= last.n) return last.t;
  for (let i = 1; i < points.length; i++) {
    const lo = points[i - 1];
    const hi = points[i];
    if (n <= hi.n && hi.n > lo.n) {
      return lo.t + ((n - lo.n) / (hi.n - lo.n)) * (hi.t - lo.t);
    }
  }
  return last.t;
}

/**
 * Map a housing number to an epoch-ms time for the given phase.
 * Each day is its own interpolation domain; a number belongs to the first day whose max
 * anchor is >= n (so a shared boundary like community 23350 stays on the earlier day).
 * Internal times are partly extrapolated (see EXTRA_ANCHORS) and low confidence.
 */
export function numberToTime(anchors, phase, n) {
  return makeNumberToTime(anchors, phase)(n);
}

/** Same mapping with the per-day anchor lists prepared once (for scanning many numbers). */
export function makeNumberToTime(anchors, phase) {
  const days = daysForPhase(anchors, phase);
  if (!days.length) return () => NaN;
  return (n) => interpolate(days.find((d) => n <= d[d.length - 1].n) || days[days.length - 1], n);
}

/** Fractional grid position (clamped to the grid) for an epoch-ms time. */
export function timeToPosition(meta, t, length) {
  const pos = (t - meta.gridStart) / (meta.stepMinutes * 60000);
  return Math.max(0, Math.min(length - 1, pos));
}

/** Nearest grid index (clamped) for an epoch-ms time. */
export function timeToIndex(meta, t, length) {
  const step = meta.stepMinutes * 60000;
  const i = Math.round((t - meta.gridStart) / step);
  return Math.max(0, Math.min(length - 1, i));
}

export function indexToTime(meta, i) {
  return meta.gridStart + i * meta.stepMinutes * 60000;
}

/** Number of grid points, taken from the first category's arrays. */
export function gridLength(data) {
  return data.categories.length ? data.categories[0].openRooms.length : 0;
}

const fmtFull = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const fmtDay = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  weekday: "short",
  month: "numeric",
  day: "numeric",
});
const fmtDayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE });

/** e.g. "Thu, Mar 26, 5:20 PM ET" - always America/New_York, never browser TZ. */
export function formatTime(t) {
  return `${fmtFull.format(new Date(t))} ET`;
}

const fmtSlotDay = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "short", month: "numeric", day: "numeric" });
const fmtSlotClock = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" });
const fmtMonthDay = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, month: "short", day: "numeric" });

/** e.g. "Thu 3/26 5:05 PM ET" (Eastern, never the browser's zone). */
export function formatSlot(t) {
  return `${fmtSlotDay.format(new Date(t)).replace(",", "")} ${fmtSlotClock.format(new Date(t))} ET`;
}

/** e.g. "Apr 2" for the last day of data. */
export const formatEndDay = (meta) => fmtMonthDay.format(new Date(meta.gridEnd));

/** First grid index of each Eastern calendar day, with a short label like "Thu 3/26". */
export function dayMarkers(meta, length) {
  const out = [];
  let prev = "";
  for (let i = 0; i < length; i++) {
    const d = new Date(indexToTime(meta, i));
    const key = fmtDayKey.format(d);
    if (key !== prev) {
      out.push({ index: i, label: fmtDay.format(d) });
      prev = key;
    }
  }
  return out;
}

/** Window record for a phase + class (e.g. community + senior). */
export function windowFor(meta, phase, cls) {
  return meta.windows.find((w) => w.phase === phase && w.cls === cls);
}

/** Error message if n is not a whole number inside the class's range, else "". */
export function validateNumber(meta, cls, str) {
  const [lo, hi] = meta.classRanges[cls];
  const msg = `${CLASS_LABELS[cls]} numbers run from ${lo} to ${hi}.`;
  if (!/^\d+$/.test(str)) return msg;
  const n = Number(str);
  return n >= lo && n <= hi ? "" : msg;
}

/** 1000-wide groups inside a class range, each with its midpoint, e.g. 5000-5999 -> 5500. */
export function numberGroups(meta, cls) {
  const [lo, hi] = meta.classRanges[cls];
  const out = [];
  for (let a = lo; a <= hi; a += 1000) {
    const b = Math.min(a + 999, hi);
    out.push({ lo: a, hi: b, mid: Math.round((a + b) / 2), label: `${a}-${b}` });
  }
  return out;
}

/** Which class range a number falls in (used to infer class for old deep links). */
export function classForNumber(meta, n) {
  return CLASSES.find((c) => n >= meta.classRanges[c][0] && n <= meta.classRanges[c][1]) || null;
}

/** neverFilled (leftover) count for a category (0 when absent). */
export const neverFilled = (cat) => (cat.fillBuckets && cat.fillBuckets.neverFilled) || 0;
/** Locked: full when selection began and never reopened (hidden from all lists and denominators). */
export const lockedRooms = (cat) => (cat.fillBuckets && cat.fillBuckets.preInternal) || 0;

/** Distinct sorted values of a category field, for filter dropdowns. */
export function uniqueValues(categories, field) {
  return [...new Set(categories.map((c) => c[field]))].sort((a, b) =>
    String(a).localeCompare(String(b), "en", { numeric: true })
  );
}

/**
 * Grid index of the baseline: the first snapshot at/after meta.internalStart (selection beginning).
 */
export function baselineIndex(meta) {
  return Math.max(0, Math.ceil((meta.internalStart - meta.gridStart) / (meta.stepMinutes * 60000) - 1e-9));
}

/** Baseline B for a category: openRooms at the baseline snapshot. */
export const baselineOf = (meta, cat) => cat.openRooms[baselineIndex(meta)];

/** Locked / baseline / leftover / picked for a set of categories (sums, then ratios elsewhere). */
export function groupStats(meta, cats) {
  const bi = baselineIndex(meta);
  const B = cats.reduce((a, c) => a + c.openRooms[bi], 0);
  const L = cats.reduce((a, c) => a + neverFilled(c), 0);
  return { rooms: cats.reduce((a, c) => a + c.rooms, 0), locked: cats.reduce((a, c) => a + lockedRooms(c), 0), B, L, C: Math.max(0, B - L) };
}

/**
 * Picked remaining over the whole grid for a set of categories: max(0, sum(open) - L) / C, capped at 1.
 * Returns null when nothing was picked (C <= 0). Also returns the raw open-sum array.
 */
export function pickedSeries(meta, cats) {
  const st = groupStats(meta, cats);
  if (st.C <= 0 || !cats.length) return null;
  const n = cats[0].openRooms.length;
  const open = new Array(n).fill(0);
  for (const c of cats) for (let i = 0; i < n; i++) open[i] += c.openRooms[i];
  return { ...st, open, share: open.map((v) => Math.min(1, Math.max(0, v - st.L) / st.C)) };
}

/** Words for picked-remaining share. Color AND text: Plenty >=50%, Some 20-50%, Slim 5-20%, Gone <5%. */
export function availabilityWord(p) {
  if (p >= 0.5) return { word: "Plenty", key: "plenty" };
  if (p >= 0.2) return { word: "Some", key: "some" };
  if (p >= 0.05) return { word: "Slim", key: "slim" };
  return { word: "Gone", key: "gone" };
}

/** Three-level bucket used by "My number": likely >= 50%, hit-or-miss 20-50%, gone < 20%. */
export const levelOf = (p) => (p >= 0.5 ? "likely" : p >= 0.2 ? "hit" : "gone");

/** Linear sample of a grid-aligned values array at time t (clamped to the grid). */
export function valueAtTime(values, meta, t) {
  const pos = timeToPosition(meta, t, values.length);
  const lo = Math.floor(pos);
  const hi = Math.min(lo + 1, values.length - 1);
  return values[lo] + (values[hi] - values[lo]) * (pos - lo);
}

/** Small tags on My number cards (a card can carry both). */
export const CARD_TAGS = {
  end: { label: "Still open at the end", cls: "left" }, // green: L / X >= 0.8
  picked: { label: "Gets picked", cls: "fast" }, // amber: T > 0.2 * X
};

export const BUCKET_KEYS = ["plenty", "few", "toss", "gone"];
export const BUCKET_LABELS = { plenty: "Plenty", few: "A few left", toss: "Toss-up", gone: "Gone" };

/** Net spaces taken in the hour either side of t for one category (same series as the "picking" panel), >= 0. */
export function takenAroundCategory(cat, meta, t, phase, halfMin = 60) {
  const [d0, d1] = phase ? rangeDomain(meta, phase) : [meta.gridStart, indexToTime(meta, cat.openSpaces.length - 1)];
  const clamp = (x) => Math.min(d1, Math.max(d0, x));
  const t1 = clamp(t - halfMin * 60000);
  const t2 = clamp(t + halfMin * 60000);
  return Math.max(0, Math.round(valueAtTime(cat.openSpaces, meta, t1) - valueAtTime(cat.openSpaces, meta, t2)));
}

/**
 * One rule for every category. X = rooms open at the slot, L = rooms still open when selection ended (capped at X),
 * T = net spaces taken in the +/-1 hour window around the slot.
 *  - Plenty: X >= 10 and (L / X >= 0.5 or T <= 0.2 X)
 *  - A few left: 1 <= X <= 9 and (L / X >= 0.5 or T == 0)
 *  - Toss-up: X >= 1 and neither of the above (being drained)
 *  - Gone: X == 0
 */
export function classifyRoom(X, L, T) {
  if (X <= 0) return "gone";
  const ratio = Math.min(L, X) / X;
  if (X >= 10 && (ratio >= 0.5 || T <= 0.2 * X)) return "plenty";
  if (X <= 9 && (ratio >= 0.5 || T === 0)) return "few";
  return "toss";
}

/**
 * Sort every category into Plenty / A few left / Toss-up / Gone at slot time t (phase clamps the +/-1 hour window to
 * the phase's range). Each bucket is sorted by X descending, then T descending. `never` lists categories with leftover rooms.
 */
export function classifyCategories(data, t, phase) {
  const { meta } = data;
  const out = { plenty: [], few: [], toss: [], gone: [], never: [] };
  for (const cat of data.categories) {
    const full = neverFilled(cat);
    if (full > 0) out.never.push({ cat, L: full });
    const X0 = valueAtTime(cat.openRooms, meta, t);
    const X = Math.round(X0);
    const L = Math.min(full, X);
    const T = takenAroundCategory(cat, meta, t, phase);
    const ratio = X > 0 ? L / X : 0;
    out[classifyRoom(X, L, T)].push({ cat, X, X0, L, T, ratio, drained: X > 0 && T > 0.2 * X });
  }
  for (const k of BUCKET_KEYS) out[k].sort((a, b) => b.X0 - a.X0 || b.T - a.T || a.cat.name.localeCompare(b.cat.name));
  out.never.sort((a, b) => b.L - a.L || a.cat.name.localeCompare(b.cat.name));
  return out;
}

/** Text pieces for a My number card. */
export function cardInfo(item) {
  const tags = [];
  if (item.X > 0 && item.ratio >= 0.8) tags.push(CARD_TAGS.end);
  if (item.drained) tags.push(CARD_TAGS.picked);
  return {
    x: `${item.X} open at your slot`,
    taken: item.T > 0 ? `${item.T} taken in the hour around your slot` : "None taken around your slot",
    left: `${item.L} still open when selection ended`,
    tags,
  };
}

/** Apply the My number filters (size / kind / area) to classifyCategories' buckets, so tab contents and counts agree. */
export function filterBuckets(data, result, filters) {
  const allowed = new Set(filterCategories(data, filters).map((c) => c.name));
  const keep = (list) => list.filter((x) => allowed.has(x.cat.name));
  return { plenty: keep(result.plenty), few: keep(result.few), toss: keep(result.toss), gone: keep(result.gone) };
}

/** Default active tab: the first non-empty of Plenty, A few left, Toss-up, Gone. */
export const defaultBucketTab = (b) => BUCKET_KEYS.find((k) => b[k].length > 0) || "plenty";

/** "{A} room types have plenty left, {B} have just a few, {C} are a toss-up, {D} are gone." */
export function bucketSummary(b) {
  const [A, B, C, D] = BUCKET_KEYS.map((k) => b[k].length);
  return A + B + C + D > 0
    ? `${A} room types have plenty left, ${B} have just a few, ${C} are a toss-up, ${D} are gone.`
    : "No room types match these filters at this number.";
}

/**
 * Everything that was open at time t (interpolated between snapshots), regardless of "picked":
 * total rooms and spaces still open, and every category's open rooms/spaces.
 */
export function openAtSlot(data, t) {
  const { meta } = data;
  const items = data.categories.map((cat) => ({
    cat,
    open: valueAtTime(cat.openRooms, meta, t),
    spaces: valueAtTime(cat.openSpaces, meta, t),
    L: neverFilled(cat),
  }));
  const rooms = items.reduce((a, r) => a + r.open, 0);
  const spaces = items.reduce((a, r) => a + r.spaces, 0);
  const top = [...items].sort((a, b) => b.open - a.open || a.cat.name.localeCompare(b.cat.name)).slice(0, 5);
  return { items, rooms: Math.round(rooms), spaces: Math.round(spaces), top };
}

/**
 * Net spaces taken in the 24 hours after t: openSpaces(t) - openSpaces(t + 24h), with the second time clamped
 * to the end of the data. Includes late picks from earlier numbers, so it is an estimate.
 */
export function afterSlot(data, t, top = 10) {
  const { meta } = data;
  const end = indexToTime(meta, gridLength(data) - 1);
  const t2 = Math.min(end, t + 24 * 3600000);
  const all = data.categories.map((cat) => ({ cat, taken: valueAtTime(cat.openSpaces, meta, t) - valueAtTime(cat.openSpaces, meta, t2) }));
  const total = all.reduce((a, r) => a + r.taken, 0);
  const rows = all.filter((r) => r.taken >= 0.5).sort((a, b) => b.taken - a.taken || a.cat.name.localeCompare(b.cat.name)).slice(0, top);
  return { total: Math.round(total), rows: rows.map((r) => ({ cat: r.cat, taken: Math.round(r.taken) })), until: t2 };
}

/**
 * What people were picking around a slot: per category, net spaces that disappeared between t - halfMin and
 * t + halfMin (interpolated openSpaces), both times clamped to the phase's range. Top rows plus the all-category total.
 */
export function pickingAround(data, t, phase, { halfMin = 60, top = 10 } = {}) {
  const { meta } = data;
  const [d0, d1] = rangeDomain(meta, phase);
  const t1 = Math.min(d1, Math.max(d0, t - halfMin * 60000));
  const t2 = Math.min(d1, Math.max(d0, t + halfMin * 60000));
  const all = data.categories.map((cat) => ({ cat, taken: valueAtTime(cat.openSpaces, meta, t1) - valueAtTime(cat.openSpaces, meta, t2) }));
  const total = all.reduce((a, r) => a + r.taken, 0);
  const rows = all.filter((r) => r.taken >= 0.5).sort((a, b) => b.taken - a.taken || a.cat.name.localeCompare(b.cat.name)).slice(0, top);
  return { total: Math.round(total), rows: rows.map((r) => ({ cat: r.cat, taken: Math.round(r.taken) })), from: t1, to: t2 };
}

/** Whole-window version: spacesTaken[windowKey] per category (net spaces taken while that window was the latest). */
export function pickingWindow(data, windowKey, top = 10) {
  const all = data.categories.map((cat) => ({ cat, taken: (cat.spacesTaken && cat.spacesTaken[windowKey]) || 0 }));
  const total = all.reduce((a, r) => a + r.taken, 0);
  const rows = all.filter((r) => r.taken > 0).sort((a, b) => b.taken - a.taken || a.cat.name.localeCompare(b.cat.name)).slice(0, top);
  return { total, rows };
}

// ─────────────────────────────────────────────────────────────────────────────
// "Over time" chart: series are groups of categories
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_SERIES = 8;
export const METRICS = [
  { key: "pct", label: "% of rooms open", needsAll: false },
  { key: "count", label: "Room count", needsAll: false },
  { key: "empty", label: "Fully empty rooms", needsAll: true },
  { key: "spaces", label: "Open spaces", needsAll: true },
];
export const RANGES = [
  { key: "full", label: "Full" },
  { key: "internal", label: "Internal only" },
  { key: "community", label: "Community only" },
];
const CLAUSE_ORDER = ["building", "bldlike", "size", "kind", "cat"];
const CLAUSE_LABEL = { building: "Building", bldlike: "Building contains", size: "Size", kind: "Kind", cat: "Category" };

/** One-click presets. bldlike = building name contains (case-insensitive). */
export const PRESETS = [
  { label: "All singles", clauses: { size: ["Single"] } },
  { label: "All doubles", clauses: { size: ["Double"] } },
  { label: "All triples", clauses: { size: ["Triple"] } },
  { label: "All quads", clauses: { size: ["Quad"] } },
  { label: "All apartments", clauses: { kind: ["Apt"] } },
  { label: "All studios", clauses: { kind: ["Studio"] } },
  { label: "All suites", clauses: { kind: ["Suite"] } },
  { label: "All dorms", clauses: { kind: ["Dorm"] } },
  { label: "All StuVi", clauses: { building: ["StuVi1", "StuVi2"] } },
  { label: "All brownstones", clauses: { bldlike: ["Brownstone"] } },
  { label: "All Bay State Rd", clauses: { bldlike: ["BSR", "Bay State"] } },
  { label: "All South Campus", clauses: { bldlike: ["South"] } },
].map((p) => ({ ...p, id: clausesId(p.clauses) }));
export const DEFAULT_SERIES_PARAM = "size:Single,size:Double,kind:Apt";

function clausesId(clauses) {
  return CLAUSE_ORDER.filter((k) => clauses[k] && clauses[k].length)
    .map((k) => `${k}:${[...clauses[k]].sort().join("+")}`)
    .join("|");
}

const cleanName = (n) => String(n).replace(/[~,]/g, " ").replace(/\s+/g, " ").trim();

/** Auto-name from filters, e.g. {building:[StuVi1,StuVi2], size:[Single]} -> "StuVi - Single". */
export function autoName(clauses) {
  if (clauses.cat && clauses.cat.length) return clauses.cat[0];
  const stem = (b) => b.replace(/\d+$/, "") || b; // "StuVi1" -> "StuVi", but "1019" stays "1019"
  const parts = [];
  if (clauses.building && clauses.building.length) parts.push([...new Set(clauses.building.map(stem))].join("/"));
  if (clauses.bldlike && clauses.bldlike.length) parts.push(clauses.bldlike.join("/"));
  if (clauses.size && clauses.size.length) parts.push(clauses.size.join("/"));
  if (clauses.kind && clauses.kind.length) parts.push(clauses.kind.join("/"));
  return parts.join(" - ") || "All rooms";
}

/** Build a series object. name is optional (preset label or auto-name by default). */
export function makeSeries(clauses, name) {
  const clean = {};
  for (const k of CLAUSE_ORDER) if (clauses[k] && clauses[k].length) clean[k] = [...clauses[k]];
  const id = clausesId(clean);
  const preset = PRESETS.find((p) => p.id === id);
  return { id, clauses: clean, name: cleanName(name || (preset ? preset.label : autoName(clean))) || autoName(clean) };
}

/** URL form: clauses joined by "|", values by "+", optional "~name"; series joined by ",". */
export function serializeSeries(list) {
  return list
    .map((s) => {
      const preset = PRESETS.find((p) => p.id === s.id);
      const defName = preset ? preset.label : autoName(s.clauses);
      return s.name && s.name !== defName ? `${s.id}~${s.name}` : s.id;
    })
    .join(",");
}

/** Parse the `series` URL param; unknown/garbled tokens are skipped. Capped at MAX_SERIES. */
export function parseSeriesParam(str, known = null) {
  if (!str) return [];
  const out = [];
  for (const token of str.split(",")) {
    const [idPart, ...nameParts] = token.split("~");
    const clauses = {};
    for (const clause of idPart.split("|")) {
      const i = clause.indexOf(":");
      if (i < 0) continue;
      const key = clause.slice(0, i);
      if (!CLAUSE_ORDER.includes(key)) continue;
      const raw = clause.slice(i + 1);
      let vals = raw.split("+").filter(Boolean);
      // A hand-typed "+" in a URL query decodes to a space; recover values like "StuVi1 StuVi2"
      // when every space-separated piece is a known value (e.g. "South Brownstone" stays whole).
      const list = known && known[key];
      if (list && vals.length === 1 && raw.includes(" ") && !list.includes(raw)) {
        const pieces = raw.split(" ").filter(Boolean);
        if (pieces.every((v) => list.includes(v))) vals = pieces;
      }
      if (vals.length) clauses[key] = vals;
    }
    if (!Object.keys(clauses).length) continue;
    const s = makeSeries(clauses, nameParts.join("~"));
    if (!out.some((o) => o.id === s.id)) out.push(s);
    if (out.length >= MAX_SERIES) break;
  }
  return out;
}

/** Known building / size / kind values, used to repair "+" that a URL decoded into a space. */
export function knownSeriesValues(data) {
  return {
    building: uniqueValues(data.categories, "building"),
    size: uniqueValues(data.categories, "size"),
    kind: uniqueValues(data.categories, "kind"),
  };
}

/** Categories matched by a series: clauses ANDed, values within a clause ORed. */
export function catMatches(cat, c) {
  return (
    (!c.cat || c.cat.includes(cat.name)) &&
    (!c.building || c.building.includes(cat.building)) &&
    (!c.bldlike || c.bldlike.some((v) => cat.building.toLowerCase().includes(v.toLowerCase()))) &&
    (!c.size || c.size.includes(cat.size)) &&
    (!c.kind || c.kind.includes(cat.kind))
  );
}

export function seriesCategories(data, s) {
  const c = s.clauses;
  if (!Object.keys(c).length) return [];
  return data.categories.filter((cat) => catMatches(cat, c));
}

/**
 * Totals for a series. rooms = all rooms, locked = full before selection began (never shown),
 * baseline = rooms open when selection began, never = leftover (open on 4/2), picked = baseline - never.
 * denom is the percentage denominator: baseline, or picked when never-filled rooms are hidden.
 */
export function groupTotals(data, s, excludeNever = false) {
  const cats = seriesCategories(data, s);
  const st = groupStats(data.meta, cats);
  return { cats, rooms: st.rooms, locked: st.locked, baseline: st.B, never: st.L, picked: st.C, denom: excludeNever ? st.C : st.B };
}

/** True when a metric can be shown under the current never-filled setting. */
export const metricAvailable = (metric, excludeNever) =>
  !(excludeNever && METRICS.find((m) => m.key === metric)?.needsAll);

/**
 * Values across the grid for a group: SUM over the set; percent = sum / baseline B (lines start at 100%),
 * never an average of percents. With excludeNever ("Show never-filled rooms" off) the set's leftover L leaves
 * numerator (clamped at 0) and denominator, so % = max(0, open - L) / (B - L).
 */
export function groupSeriesValues(data, s, metric, excludeNever) {
  const { cats, never, denom } = groupTotals(data, s, excludeNever);
  const n = gridLength(data);
  const field = metric === "empty" ? "emptyRooms" : metric === "spaces" ? "openSpaces" : "openRooms";
  const out = new Array(n).fill(0);
  for (const c of cats) {
    const arr = c[field];
    for (let i = 0; i < n; i++) out[i] += arr[i];
  }
  const sub = excludeNever && field === "openRooms" ? never : 0;
  return out.map((v) => {
    const adj = Math.max(0, v - sub);
    return metric === "pct" ? (denom > 0 ? Math.min(1, adj / denom) : 0) : adj;
  });
}

/** Add series to a list under the MAX_SERIES cap. Returns { list, message }. */
export function addSeries(list, incoming) {
  const next = [...list];
  let skippedForCap = 0;
  for (const s of incoming) {
    if (next.some((x) => x.id === s.id)) continue;
    if (next.length >= MAX_SERIES) skippedForCap++;
    else next.push(s);
  }
  return {
    list: next,
    message: skippedForCap
      ? `Limit of ${MAX_SERIES} series reached; ${skippedForCap} not added. Remove one to add another.`
      : "",
  };
}

/** True when every series in `incoming` is already in `list` (the "Add all" button then says "Already added"). */
export const allSeriesPresent = (list, incoming) => incoming.every((g) => list.some((x) => x.id === g.id));

/**
 * "Add all" for a group-by: add as many lines as fit under the cap.
 * Returns { list, added, message }; message is "Added N; chart is limited to 8 lines." only when the cap cut it short.
 */
export function addSeriesGroup(list, incoming) {
  const r = addSeries(list, incoming);
  const added = r.list.length - list.length;
  return { list: r.list, added, message: r.message ? `Added ${added}; chart is limited to ${MAX_SERIES} lines.` : "" };
}

/** Integer-friendly "nice" axis ticks up to at least max. */
export function niceTicks(max, target = 5) {
  const m = Math.max(1, Math.ceil(max));
  const raw = m / target;
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  const step = Math.max(1, Math.round((f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p));
  const top = Math.ceil(m / step) * step;
  const ticks = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return { ticks, max: top };
}

/** Axis/tooltip number formatting: whole percents on the axis, integers for counts. */
export function formatTick(metric, v) {
  return metric === "pct" ? `${Math.round(v * 100)}%` : String(Math.round(v));
}
export function formatValue(metric, v) {
  return metric === "pct" ? `${(Math.round(v * 1000) / 10).toFixed(1)}%` : Math.round(v).toLocaleString("en-US");
}

/** x-domain [t0, t1] for a range button. Internal ends when Community opens. */
export function rangeDomain(meta, range) {
  const pad = 3 * 3600000;
  const lastT = indexToTime(meta, meta.windows.length ? gridLengthFromMeta(meta) - 1 : 0);
  if (range === "internal") {
    const first = Math.min(...meta.windows.filter((w) => w.phase === "internal").map((w) => w.opensAt));
    return [Math.max(indexToTime(meta, baselineIndex(meta)), first - pad), meta.communityOpensAt];
  }
  if (range === "community") return [meta.communityOpensAt, lastT];
  return [indexToTime(meta, baselineIndex(meta)), lastT];
}
function gridLengthFromMeta(meta) {
  return Math.round((meta.gridEnd - meta.gridStart) / (meta.stepMinutes * 60000)) + 1;
}

/** Inclusive grid index range inside a time domain. */
export function domainIndices(meta, domain, length) {
  const step = meta.stepMinutes * 60000;
  return [
    Math.max(0, Math.ceil((domain[0] - meta.gridStart) / step - 1e-9)),
    Math.min(length - 1, Math.floor((domain[1] - meta.gridStart) / step + 1e-9)),
  ];
}

/** Class-window bands (each runs from its opensAt to the next window's), clipped to a domain. */
export function windowBands(meta, domain) {
  const ws = [...meta.windows].sort((a, b) => a.opensAt - b.opensAt);
  const endAll = indexToTime(meta, gridLengthFromMeta(meta) - 1);
  const out = [];
  ws.forEach((w, i) => {
    const start = w.opensAt;
    const end = i + 1 < ws.length ? ws[i + 1].opensAt : endAll;
    const a = Math.max(start, domain[0]);
    const b = Math.min(end, domain[1]);
    if (b > a) out.push({ key: w.key, phase: w.phase, label: w.label, estimated: w.estimated, opensAt: w.opensAt, start: a, end: b, idx: i });
  });
  return out;
}

export const WINDOW_SHORT = {
  internal_senior: ["Internal Senior", "Int Sr"],
  internal_junior: ["Internal Junior", "Int Jr"],
  internal_soph: ["Internal Soph", "Int Soph"],
  community_senior: ["Community Senior", "Com Sr"],
  community_junior: ["Community Junior", "Com Jr"],
  community_soph: ["Community Soph", "Com Soph"],
};

const fmtMD = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, month: "numeric", day: "numeric" });
export const formatMD = (t) => fmtMD.format(new Date(t));

/**
 * Lay out window labels under the plot: each label starts at its band's left edge, is pushed left if it
 * would run past the right edge, and drops to the first row where it does not touch the previous label.
 * charW is the estimated glyph width in px. Returns [{key, x, row, text, date}].
 */
export function layoutWindowLabels(bands, xOf, { left, right, charW = 5.8, rows = 5, compact = false }) {
  const ends = new Array(rows).fill(-Infinity);
  return bands.map((b) => {
    const names = WINDOW_SHORT[b.key] || [b.label, b.label];
    const text = compact ? names[1] : names[0];
    const w = text.length * charW + 4;
    let x = Math.max(left, xOf(b.start));
    if (x + w > right) x = Math.max(left, right - w);
    let row = ends.findIndex((e) => x >= e + 4);
    if (row < 0) row = ends.indexOf(Math.min(...ends));
    ends[row] = x + w;
    return { key: b.key, x, row, w, text, date: formatMD(b.opensAt) };
  });
}

/** Window whose band contains time t (label for the tooltip). */
export function windowAt(meta, t) {
  const ws = [...meta.windows].sort((a, b) => a.opensAt - b.opensAt);
  let cur = null;
  for (const w of ws) if (w.opensAt <= t) cur = w;
  return cur ? cur.label.replace("·", "-") : "Before any window opens";
}

export { CLAUSE_LABEL, CLAUSE_ORDER };

// ─────────────────────────────────────────────────────────────────────────────
// "Plan ahead": what number it takes
// ─────────────────────────────────────────────────────────────────────────────

export const PLAN_PHASES = ["internal", "community", "both"];
export const STYLE_LABEL = { Apt: "Apartment", Studio: "Studio", Suite: "Suite", "Semi-Suite": "Semi-Suite", Dorm: "Dorm" };
export const SIZE_LIST = SIZE_ORDER;
const BUILDING_DISPLAY = {
  "South Brownstone": "South Campus (apartments, studios, brownstones)",
  "BSR Brownstone": "Bay State Rd brownstones",
  "Comm Ave Brownstone": "Comm Ave brownstones",
};
export const buildingLabel = (b) => BUILDING_DISPLAY[b] || b;
export const styleLabel = (k) => STYLE_LABEL[k] || k;
export const SCENARIOS = [0.1, 0.25, 0.5, 0.75, 0.9];

/** Spaces already taken when the scrape began (before Internal), not attributed to any class. */
export function preInternalSpaces(data) {
  return data.categories.reduce((a, c) => a + (c.spaces - c.openSpaces[0]), 0);
}

/** Housing numbers 10/25/50/75/90% through a class range, rounded to the nearest 50. */
export function scenarioNumbers(meta, cls) {
  const [lo, hi] = meta.classRanges[cls];
  return SCENARIOS.map((p) => ({
    p,
    n: Math.min(hi, Math.max(lo, Math.round((lo + p * (hi - lo)) / 50) * 50)),
  }));
}

/** Matrix groups (rows). series ids match the Over time presets so a click can pre-load the chart. */
export const PLAN_GROUPS = [
  { label: "All singles", series: makeSeries({ size: ["Single"] }) },
  { label: "All doubles", series: makeSeries({ size: ["Double"] }) },
  { label: "All triples", series: makeSeries({ size: ["Triple"] }) },
  { label: "All apartments", series: makeSeries({ kind: ["Apt"] }) },
  { label: "All studios", series: makeSeries({ kind: ["Studio"] }) },
  { label: "All suites", series: makeSeries({ kind: ["Suite"] }) },
  { label: "All dorms", series: makeSeries({ kind: ["Dorm"] }) },
  { label: "StuVi", series: makeSeries({ building: ["StuVi1", "StuVi2"] }) },
  { label: "South Campus", series: makeSeries({ bldlike: ["South"] }) },
  { label: "Bay State Rd brownstones", series: makeSeries({ building: ["BSR Brownstone"] }, "Bay State Rd brownstones") },
  { label: "Comm Ave brownstones", series: makeSeries({ building: ["Comm Ave Brownstone"] }, "Comm Ave brownstones") },
  { label: "Myles", series: makeSeries({ building: ["Myles"] }) },
];

/** Row for a user-picked building. */
export function buildingGroup(building) {
  const label = buildingLabel(building);
  return { label, series: makeSeries({ building: [building] }, label), extra: true };
}


const GONE_FIRST = 1000;
const GONE_LAST = 29999;

/** Phase label used in "not during Internal". */
export const phaseName = (phase) => PHASE_LABELS[phase];

/**
 * One row of the Plan ahead table for a group of categories (sums before dividing).
 * Reads picked-remaining on the phase's number axis (1000-29999): five scenario cells across the class
 * range, a sparkline, and the first number where it falls to <= 50% / <= 10% of picked C.
 * half / mostly are {kind:"at", n} | {kind:"before"} (already below at #1000) | {kind:"none"}.
 */
export function planRowFor(data, group, cats, { cls, phase }) {
  const { meta, anchors } = data;
  const cs = pickedSeries(meta, cats);
  if (!cs) return null;
  const tOf = makeNumberToTime(anchors, phase);
  const at = (n) => valueAtTime(cs.share, meta, tOf(n));
  const cells = scenarioNumbers(meta, cls).map(({ p, n }) => {
    const share = at(n);
    const open = valueAtTime(cs.open, meta, tOf(n));
    return { p, n, share, count: Math.round(share * cs.C), openRooms: Math.round(open), ...availabilityWord(share) };
  });
  const spark = [];
  let half = { kind: "none" };
  let mostly = { kind: "none" };
  for (let n = GONE_FIRST; n <= GONE_LAST; n++) {
    const v = at(n);
    if (half.kind === "none" && v <= 0.5) half = n === GONE_FIRST ? { kind: "before", n } : { kind: "at", n };
    if (mostly.kind === "none" && v <= 0.1) mostly = n === GONE_FIRST ? { kind: "before", n } : { kind: "at", n };
    if ((n - GONE_FIRST) % 100 === 0 || n === GONE_LAST) spark.push({ n, share: v });
  }
  return { group, cats, B: cs.B, L: cs.L, C: cs.C, locked: cs.locked, cells, half, mostly, spark };
}

const fmtN = (n) => n.toLocaleString("en-US");

/** Cell text for "Half gone by" / "Mostly gone by", e.g. "~#2,900 (Senior)". */
export function goneLabel(g, meta, phase) {
  if (g.kind === "before") return `before #${fmtN(GONE_FIRST)}`;
  if (g.kind === "none") return phase === "internal" ? "not during Internal" : `after #${fmtN(GONE_LAST)}`;
  const n = Math.round(g.n / 100) * 100;
  const cls = classForNumber(meta, g.n);
  return `~#${fmtN(Math.max(GONE_FIRST, n))}${cls ? ` (${CLASS_LABELS[cls]})` : ""}`;
}

/** Sort rank of a gone-by result: before < numbers < never. */
export const goneRank = (g) => (g.kind === "before" ? -1 : g.kind === "at" ? g.n : Infinity);

export const PLAN_SORTS = [
  { key: "gone", label: "Gone earliest" },
  { key: "name", label: "Name" },
  { key: "picked", label: "Most rooms picked" },
  { key: "never", label: "Most never-filled" },
];

/** Sort plan rows. Gone earliest = by half-gone number, groups that never drop last. */
export function sortPlanRows(rows, sortBy) {
  const name = (a, b) => a.group.label.localeCompare(b.group.label, "en", { numeric: true });
  const out = [...rows];
  out.sort((a, b) => {
    if (sortBy === "name") return name(a, b);
    if (sortBy === "picked") return b.C - a.C || name(a, b);
    if (sortBy === "never") return b.L - a.L || name(a, b);
    return goneRank(a.half) - goneRank(b.half) || goneRank(a.mostly) - goneRank(b.mostly) || name(a, b);
  });
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// "What are you looking for?" (My number): filters + a per-category table at the slot
// ─────────────────────────────────────────────────────────────────────────────

export const SIZE_CHIPS = SIZE_ORDER;
export const KIND_CHIPS = [
  { key: "Apt", label: "Apartment" },
  { key: "Dorm", label: "Dorm" },
  { key: "Suite", label: "Suite" },
  { key: "Semi-Suite", label: "Semi-suite" },
  { key: "Studio", label: "Studio" },
];

// Area chips reuse the Explore presets (StuVi, brownstones, Bay State Rd, South Campus), then single buildings.
const AREA_PRESETS = [
  ["All StuVi", "StuVi", "stuvi"],
  ["All brownstones", "Brownstones", "brown"],
  ["All Bay State Rd", "Bay State Rd", "bsr"],
  ["All South Campus", "South Campus", "south"],
];

/** Area chips: [{ key, label, clauses }]. Buildings already covered by a preset get no chip of their own. */
export function areaChips(data) {
  const chips = AREA_PRESETS.map(([presetLabel, label, key]) => ({ key, label, clauses: PRESETS.find((p) => p.label === presetLabel).clauses }));
  const covered = (b) => chips.some((c) => catMatches({ building: b, name: "", size: "", kind: "" }, c.clauses));
  for (const b of uniqueValues(data.categories, "building")) {
    if (!covered(b)) chips.push({ key: `b:${b}`, label: buildingLabel(b), clauses: { building: [b] } });
  }
  return chips;
}

/** Filters AND across rows (size, kind, area), OR within a row; an empty row means "Any". */
export function filterCategories(data, { sizes = [], kinds = [], areas = [] } = {}) {
  const chips = areaChips(data).filter((c) => areas.includes(c.key));
  return data.categories.filter(
    (c) =>
      (!sizes.length || sizes.includes(c.size)) &&
      (!kinds.length || kinds.includes(c.kind)) &&
      (!chips.length || chips.some((a) => catMatches(c, a.clauses)))
  );
}

const csvList = (v) => (v ? v.split(",").filter(Boolean) : []);

/** URL query <-> filter state, so a filtered view is linkable. */
export function filtersFromParams(get) {
  return { sizes: csvList(get("size")), kinds: csvList(get("kind")), areas: csvList(get("area")), hideZero: get("hide0") !== "0" };
}
export function filtersToParams(f, set) {
  if (f.sizes.length) set("size", f.sizes.join(","));
  if (f.kinds.length) set("kind", f.kinds.join(","));
  if (f.areas.length) set("area", f.areas.join(","));
  if (!f.hideZero) set("hide0", "0");
}
export const filtersActive = (f) => f.sizes.length + f.kinds.length + f.areas.length > 0;

const HOUR = 3600000;

/**
 * First time after t when a grid series falls to <= level (linear interpolation inside the snapshot interval).
 * Returns hours after t, or null if it never does (within the data). Starts from the interpolated value at t.
 */
export function hoursUntilAtMost(series, meta, t, level) {
  const step = meta.stepMinutes * 60000;
  const end = meta.gridStart + (series.length - 1) * step;
  let pt = t;
  let pv = valueAtTime(series, meta, t);
  if (pv <= level) return 0;
  for (let g = Math.floor((t - meta.gridStart) / step) + 1; g < series.length; g++) {
    const gt = meta.gridStart + g * step;
    if (gt <= t) continue;
    const gv = series[g];
    if (gv <= level) return (pt + ((pv - level) / (pv - gv)) * (gt - pt) - t) / HOUR;
    pt = gt;
    pv = gv;
  }
  return pt >= end && pv <= level ? (pt - t) / HOUR : null;
}

/** "40 min", "2 h", "2.5 h", "3 days". */
export function formatDuration(h) {
  if (h < 1) return `${Math.max(5, Math.round((h * 60) / 5) * 5)} min`;
  if (h < 48) return `${Math.round(h * 2) / 2} h`;
  return `${Math.round(h / 2.4) / 10} days`;
}

/**
 * One table row per category at slot time t. All numbers come from the interpolated openRooms series, with t + delta
 * clamped to the end of the data. gone: {kind: "zero"|"half"|"never"|"none", hours}. verdict = the same Plenty / A few
 * left / Toss-up / Gone bucket the tabs use (phase clamps the +/-1 hour window).
 */
export function slotTable(data, t, cats, phase) {
  const { meta } = data;
  return cats.map((cat) => {
    const at = (d) => valueAtTime(cat.openRooms, meta, t + d * HOUR);
    const open0 = at(0);
    const end = cat.openRooms[cat.openRooms.length - 1];
    const X = Math.round(open0);
    const T = takenAroundCategory(cat, meta, t, phase);
    const row = {
      cat,
      open: X,
      spaces: Math.round(valueAtTime(cat.openSpaces, meta, t)),
      h1: Math.round(at(1)),
      h6: Math.round(at(6)),
      h24: Math.round(at(24)),
      end,
      taken: T,
      verdict: classifyRoom(X, Math.min(neverFilled(cat), X), T),
      raw: { open0, h1: at(1), h6: at(6), h24: at(24), end },
    };
    if (open0 < 0.5) return { ...row, gone: { kind: "none" } };
    const zero = hoursUntilAtMost(cat.openRooms, meta, t, 0.5);
    const half = hoursUntilAtMost(cat.openRooms, meta, t, open0 * 0.5);
    const gone = zero !== null ? { kind: "zero", hours: zero } : half !== null ? { kind: "half", hours: half } : { kind: "never" };
    return { ...row, gone, halfHours: half === null ? Infinity : half };
  });
}

export const VERDICTS = {
  plenty: { label: "Plenty", hint: "10+ open and not being drained fast, or mostly left over" },
  few: { label: "A few left", hint: "1-9 open: too few to count on" },
  toss: { label: "Toss-up", hint: "Being drained around your slot, or mostly taken before the end" },
  gone: { label: "Gone", hint: "None open at your slot" },
};

/** Plain-English "Gone by" text. */
export function goneByText(row) {
  if (row.gone.kind === "none") return "None open at your slot";
  if (row.gone.kind === "zero") return `Gone in ~${formatDuration(row.gone.hours)}`;
  if (row.gone.kind === "half") return `Half gone ~${formatDuration(row.gone.hours)} after your slot`;
  return "Still open at the end";
}

/** Color key for a share of open(t) remaining: green >= 70%, amber 30-70%, red < 30% (Plan ahead's classes). */
export const remainingKey = (share) => (share >= 0.7 ? "plenty" : share >= 0.3 ? "some" : "gone");

/** Totals for the summary line, from the rows as displayed (rounded per category so the sum matches the table). */
export function lookingSummary(rows) {
  const open = rows.filter((r) => r.open > 0);
  return {
    R: open.reduce((a, r) => a + r.open, 0),
    S: open.reduce((a, r) => a + r.spaces, 0),
    B: new Set(open.map((r) => r.cat.building)).size,
  };
}

/** Rooms open per building, largest first. */
export function buildingRollup(rows) {
  const m = new Map();
  for (const r of rows) if (r.open > 0) m.set(r.cat.building, (m.get(r.cat.building) || 0) + r.open);
  return [...m.entries()].map(([building, open]) => ({ building, open })).sort((a, b) => b.open - a.open || a.building.localeCompare(b.building));
}

const fmtClockOnly = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" });
const fmtDayOnly = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "short", month: "numeric", day: "numeric" });
/** e.g. "6:05 PM ET on Mon 3/30". */
export const formatClockDay = (t) => `${fmtClockOnly.format(new Date(t))} ET on ${fmtDayOnly.format(new Date(t)).replace(",", "")}`;

const KIND_WORD = Object.fromEntries(KIND_CHIPS.map((k) => [k.key, k.label.toLowerCase()]));
const orJoin = (xs) => xs.join(" or ");

/**
 * Plain-English description of a filter set, built from the active chips only:
 * { adj: "single apartment" | "" , area: "StuVi" | "", plural: "doubles" | "double apartment rooms" | "rooms" }.
 */
export function describeFilters(data, f) {
  const sizes = orJoin(f.sizes.map((x) => x.toLowerCase()));
  const kinds = orJoin(f.kinds.map((k) => KIND_WORD[k] || k.toLowerCase()));
  const chips = areaChips(data);
  const area = orJoin(f.areas.map((k) => (chips.find((c) => c.key === k) || { label: k }).label));
  const adj = [sizes, kinds].filter(Boolean).join(" ");
  const plural = kinds ? `${adj} rooms` : sizes ? f.sizes.map((x) => `${x.toLowerCase()}s`).join(" or ") : "rooms";
  return { adj, area, plural };
}

const withArea = (text, area) => (area ? `${text} in ${area}` : text);

/** Last housing number below `num` (inside the class range) where the cats still had open rooms; null if never. */
export function lastNumberWithRooms(data, cats, phase, cls, num) {
  const { meta } = data;
  const sum = new Array(gridLength(data)).fill(0);
  for (const c of cats) for (let i = 0; i < sum.length; i++) sum[i] += c.openRooms[i];
  const tOf = makeNumberToTime(data.anchors, phase);
  const [lo] = meta.classRanges[cls];
  for (let n = Math.min(num - 1, meta.classRanges[cls][1]); n >= lo; n--) {
    if (valueAtTime(sum, meta, tOf(n)) >= 0.5) return { n, t: tOf(n) };
  }
  return null;
}

/**
 * Everything the empty-state card needs for a filter set at the slot:
 * level none (0 rooms) / few (1-5 rooms) / ok, descriptions, where it ran out, what WAS open, and the single filter
 * relaxation (drop Area, then Kind, then Size, one at a time) that returns the most rooms.
 */
export function emptyState(data, t, phase, cls, num, f) {
  const countFor = (flt) => lookingSummary(slotTable(data, t, filterCategories(data, flt), phase).filter((r) => r.open > 0)).R;
  const R = countFor(f);
  const level = R === 0 ? "none" : R <= 5 ? "few" : "ok";
  const d = describeFilters(data, f);
  const out = { R, level, num, desc: { ...d, adjArea: withArea(d.adj ? `${d.adj} rooms` : "rooms", d.area) }, lastSlot: null, wasOpen: openAtSlot(data, t).top.filter((r) => Math.round(r.open) > 0), closest: null };
  if (level === "none") out.lastSlot = lastNumberWithRooms(data, filterCategories(data, f), phase, cls, num);
  let best = null;
  for (const row of ["areas", "kinds", "sizes"]) {
    if (!f[row].length) continue;
    const relaxed = { ...f, [row]: [] };
    const n = countFor(relaxed);
    if (n > 0 && (!best || n > best.n)) best = { row, n, filters: relaxed };
  }
  if (best) {
    const dropped = describeFilters(data, { sizes: [], kinds: [], areas: [], [best.row]: f[best.row] });
    const rest = describeFilters(data, best.filters);
    const droppedWord = best.row === "areas" ? dropped.area : best.row === "kinds" ? dropped.adj : dropped.adj;
    const noun = best.n === 1 ? (rest.adj ? `${rest.adj} room` : "room") : rest.plural;
    const restPlural = withArea(noun, rest.area);
    out.closest = {
      ...best,
      line: `Drop the ${droppedWord} filter: ${best.n} ${restPlural} open`,
      button: `Show ${best.n} ${withArea(rest.adj ? `${rest.adj} rooms` : "rooms", rest.area)}`,
    };
  }
  return out;
}

/** Sort rows by a column key; ties by name. dir = "asc" | "desc". */
export function sortSlotRows(rows, key, dir = "desc") {
  const val = (r) =>
    key === "name" ? r.cat.name : key === "gone" ? (r.gone.kind === "none" ? Infinity : r.gone.kind === "never" ? Infinity : r.gone.hours) : r[key];
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = val(a), y = val(b);
    const c = typeof x === "string" ? x.localeCompare(y, "en", { numeric: true }) : x === y ? 0 : x < y ? -1 : 1;
    return c * sign || a.cat.name.localeCompare(b.cat.name, "en", { numeric: true });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// "What people got": which rooms disappeared as each range of housing numbers came up (from availability.json only)
// ─────────────────────────────────────────────────────────────────────────────

export const PICK_MIN = 20; // a bin with fewer spaces than this says "very few picked" (noise, not privacy)
export const PICK_DIM_KEYS = ["size", "type", "area", "building"];
export const KIND_NAME = { Apt: "Apartment", Studio: "Studio", Dorm: "Dorm", Suite: "Suite", "Semi-Suite": "Semi-suite" };

export const PICK_DIMS = {
  size: {
    label: "Room size",
    order: ["Single", "Double", "Triple", "Quad", "Other"],
    colors: { Single: "#1aa39b", Double: "#f2c94c", Triple: "#8e5bd1", Quad: "#e07b39", Other: "#9aa0a6" },
  },
  type: {
    label: "Room type",
    order: ["Apartment", "Studio", "Dorm", "Suite", "Semi-suite"],
    colors: { Apartment: "#8ecae6", Studio: "#1d4e89", Dorm: "#f48fb1", Suite: "#c62828", "Semi-suite": "#e07b39" },
  },
  area: {
    label: "Area",
    order: ["Large dorms", "Brownstones", "Apartments", "StuVi", "Fenway", "Other"],
    colors: { "Large dorms": "#e0566e", Brownstones: "#f2c94c", Apartments: "#4caf50", StuVi: "#3f7fd9", Fenway: "#8e5bd1", Other: "#9aa0a6" },
  },
  building: { label: "Building", order: [], colors: {} },
  bldg: { label: "Building", order: [], colors: {} }, // mapped building labels; filled from BUILDINGS below
};

/** Readable text color (dark or white) for a background color. */
export function textOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? "#1b1b1b" : "#ffffff";
}

/** Building name -> area (name based). */
export function areaOfBuilding(name) {
  const s = String(name || "").toLowerCase();
  if (/stuvi|student village/.test(s)) return "StuVi";
  if (/fenway/.test(s)) return "Fenway";
  if (/apartment|\bapts?\b/.test(s)) return "Apartments";
  if (/brownstone|bay state|\beast\b|\bcentral\b/.test(s)) return "Brownstones";
  if (/\bwest\b|warren|towers?\b|kilachand|danielsen|1019|hojo|howard johnson|\b575\b|610 beacon/.test(s)) return "Large dorms";
  return "Other";
}

/**
 * Area of a category: StuVi stays StuVi, apartment-kind rooms are Apartments (the data files South Campus apartments
 * under a brownstone building), everything else follows its building.
 */
export function areaOfCategory(cat) {
  const byBuilding = areaOfBuilding(cat.building);
  if (byBuilding === "StuVi" || byBuilding === "Fenway") return byBuilding;
  if (cat.kind === "Apt") return "Apartments";
  return byBuilding;
}

/** When a class's window ends for this purpose: the next window's opening (late picks land there), or the end of the data. */
export function windowEndTime(meta, phase, cls) {
  const ws = [...meta.windows].sort((a, b) => a.opensAt - b.opensAt);
  const i = ws.findIndex((w) => w.phase === phase && w.cls === cls);
  return i >= 0 && i + 1 < ws.length ? ws[i + 1].opensAt : indexToTime(meta, gridLengthFromMeta(meta) - 1);
}

/**
 * Spaces that disappeared as each 1000-number range of a class came up. For bin [a, a+1000) taken_c = max(0,
 * openSpaces_c(t(a)) - openSpaces_c(t(a+1000))) from the interpolated grid, per category. The class's last bin runs until the next
 * window opens (late picks by earlier numbers land there; this also makes the bins add up to the class's window).
 * Returns [{ from, to, n, cats: [{ cat, taken }] }].
 */
export function pickBins(data, phase, cls) {
  const { meta, anchors } = data;
  const [lo, hi] = meta.classRanges[cls];
  const tOf = makeNumberToTime(anchors, phase);
  const bins = [];
  for (let a = lo; a <= hi; a += 1000) {
    const last = a + 1000 > hi;
    const t0 = tOf(a);
    const t1 = Math.max(t0, last ? windowEndTime(meta, phase, cls) : tOf(a + 1000));
    const cats = data.categories
      .map((cat) => ({ cat, taken: Math.max(0, valueAtTime(cat.openSpaces, meta, t0) - valueAtTime(cat.openSpaces, meta, t1)) }))
      .filter((x) => x.taken > 0);
    bins.push({ from: a, to: Math.min(a + 999, hi), n: cats.reduce((s, x) => s + x.taken, 0), cats });
  }
  return bins;
}

/** "All {class}": the bins added together. */
export function pickTotal(bins) {
  const m = new Map();
  for (const b of bins) for (const x of b.cats) m.set(x.cat, (m.get(x.cat) || 0) + x.taken);
  const cats = [...m.entries()].map(([cat, taken]) => ({ cat, taken }));
  return { from: bins.length ? bins[0].from : 0, to: bins.length ? bins[bins.length - 1].to : 0, n: cats.reduce((s, x) => s + x.taken, 0), cats };
}

// ── Building map: the single source of truth for building labels, their area and color ──

/** Building labels in display order (grouped by area), each with its area and color. */
export const BUILDINGS = [
  { label: "Warren Towers", area: "Large dorms", color: "#ffb3c1" },
  { label: "West Campus", area: "Large dorms", color: "#ff5c44" },
  { label: "The Towers", area: "Large dorms", color: "#ff9672" },
  { label: "610 Beacon (Myles)", area: "Large dorms", color: "#ff2db4" },
  { label: "Kilachand Hall", area: "Large dorms", color: "#ff2200" },
  { label: "Danielsen Hall", area: "Large dorms", color: "#ff8000" },
  { label: "1019 Comm Ave", area: "Large dorms", color: "#ff88b8" },
  { label: "HoJo", area: "Large dorms", color: "#ffac4d" },
  { label: "Bay State Brownstone", area: "Brownstones", color: "#ffd000" },
  { label: "East and Central Campus Brownstone", area: "Brownstones", color: "#f9f7c9" },
  { label: "South Campus Brownstone", area: "Brownstones", color: "#efe480" },
  { label: "South Campus Apartment", area: "Apartments", color: "#35a865" },
  { label: "East/Bay State Apartment", area: "Apartments", color: "#88ee88" },
  { label: "StuVi 1", area: "StuVi", color: "#82c4f8" },
  { label: "StuVi 2", area: "StuVi", color: "#3f77ad" },
  { label: "Fenway", area: "Fenway", color: "#8e5bd1" },
  { label: "Other", area: "Other", color: "#757575" },
];
/** Short names for labels inside charts (the full label stays in tooltips and legends). */
export const BUILDING_SHORT = {
  "Warren Towers": "Warren",
  "West Campus": "West",
  "The Towers": "Towers",
  "610 Beacon (Myles)": "610 Beacon",
  "Kilachand Hall": "Kilachand",
  "Danielsen Hall": "Danielsen",
  "1019 Comm Ave": "1019",
  "Bay State Brownstone": "Bay State",
  "East and Central Campus Brownstone": "East & Central",
  "South Campus Brownstone": "South Brown.",
  "South Campus Apartment": "South Apts",
  "East/Bay State Apartment": "East/BSR Apts",
};
export const shortName = (label) => BUILDING_SHORT[label] || label;
/** Area of a building label (for tooltips). */
export const areaOfLabel = (label) => (BUILDINGS.find((b) => b.label === label) || {}).area;
const BUILDING_BY_LABEL = Object.fromEntries(BUILDINGS.map((b) => [b.label, b]));
PICK_DIMS.bldg.order = BUILDINGS.map((b) => b.label);
PICK_DIMS.bldg.colors = Object.fromEntries(BUILDINGS.map((b) => [b.label, b.color]));

/**
 * Raw building name (+ room kind; apartment-style rooms in brownstones are counted as apartments) -> a BUILDINGS entry.
 * Anything not recognised is "Other" (see unmappedBuildings).
 */
export function buildingOfCategory(cat) {
  const n = String(cat.building || "").toLowerCase();
  const apt = cat.kind === "Apt";
  let label = null;
  if (/stuvi|student village/.test(n)) label = /2/.test(n) ? "StuVi 2" : "StuVi 1";
  else if (/fenway/.test(n)) label = "Fenway";
  else if (apt) label = /south/.test(n) ? "South Campus Apartment" : /bsr|bay state|comm ave|danielsen|kenmore|east|central/.test(n) ? "East/Bay State Apartment" : null;
  else if (/bsr|bay state/.test(n)) label = "Bay State Brownstone";
  else if (/comm ave brownstone|danielsen brownstone|kenmore|east|central/.test(n)) label = "East and Central Campus Brownstone";
  else if (/south brownstone|exiled/.test(n)) label = "South Campus Brownstone";
  else if (/warren/.test(n)) label = "Warren Towers";
  else if (/^west\b|west campus/.test(n)) label = "West Campus";
  else if (/the towers/.test(n)) label = "The Towers";
  else if (/myles|610/.test(n)) label = "610 Beacon (Myles)";
  else if (/kilachand/.test(n)) label = "Kilachand Hall";
  else if (/danielsen/.test(n)) label = "Danielsen Hall";
  else if (/1019/.test(n)) label = "1019 Comm Ave";
  else if (/hojo|howard johnson|\b575\b/.test(n)) label = "HoJo";
  return BUILDING_BY_LABEL[label || "Other"];
}

/** Raw building names that fall into "Other" (for a one-time dev console note). */
export function unmappedBuildings(data) {
  return [...new Set(data.categories.filter((c) => buildingOfCategory(c).label === "Other").map((c) => c.building))].sort();
}

const dimName = (cat, dim) =>
  dim === "size" ? (PICK_DIMS.size.order.includes(cat.size) ? cat.size : "Other") : dim === "type" ? KIND_NAME[cat.kind] || cat.kind : dim === "area" ? areaOfCategory(cat) : dim === "bldg" ? buildingOfCategory(cat).label : cat.building;

/** Spaces taken per size / type / area / building name for a bin: { name: spaces }. */
export function pickCounts(bin, dim) {
  const out = {};
  for (const { cat, taken } of bin.cats) out[dimName(cat, dim)] = (out[dimName(cat, dim)] || 0) + taken;
  return out;
}

/** Shares in the dimension's own order: [{ name, count, share, color }]. */
export function pickShares(counts, dim) {
  const cfg = PICK_DIMS[dim];
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const rank = (n) => {
    const i = cfg.order.indexOf(n);
    return i < 0 ? cfg.order.length : i;
  };
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count, share: total ? count / total : 0, color: cfg.colors[name] || "#9aa0a6" }))
    .sort((a, b) => rank(a.name) - rank(b.name) || b.count - a.count || a.name.localeCompare(b.name));
}

/** Buildings ranked by spaces taken; each carries its area color for a thin left border. */
export function pickBuildingRanking(counts) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return Object.entries(counts)
    .map(([name, count]) => {
      const area = areaOfBuilding(name);
      return { name, count, share: total ? count / total : 0, area, color: PICK_DIMS.area.colors[area] || "#9aa0a6" };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// ── Heatmap view of the same derivation ──

/** Heatmap column groups: one hue each (teal size, blue type, orange area), darker than the bar colors so white text reads. */
export const HEAT_GROUPS = [
  { key: "size", label: "Room size", names: ["Single", "Double", "Triple", "Quad"], hue: [14, 124, 118] },
  { key: "type", label: "Room type", names: ["Apartment", "Studio", "Dorm", "Suite", "Semi-suite"], hue: [44, 95, 179] },
  { key: "area", label: "Area", names: ["Large dorms", "Brownstones", "Apartments", "StuVi", "Fenway", "Other"], hue: [194, 90, 20] },
];

/**
 * Table model for one class: columns grouped by size / type / area and rows "All {class}" then one per 1000-bin.
 * Columns come from opts.groups (the fixed list from heatGroups) or, by default, those with picks in this class / opts.union.
 * A cell is { group, name, share, count, pct, dash, bold }: pct is the rounded share, dash is true under 1%, bold marks the
 * largest cell of its group in the row. Bins under PICK_MIN spaces are { few: true } with no cells.
 */
export function heatmapTable(bins, clsName, opts = {}) {
  const total = pickTotal(bins);
  const colTotals = (opts.union || [bins]).map(pickTotal);
  const groups =
    opts.groups ||
    HEAT_GROUPS.map((g) => {
      const cs = colTotals.map((t) => pickCounts(t, g.key));
      return { ...g, names: g.names.filter((n) => cs.some((c) => (c[n] || 0) > 0)) };
    }).filter((g) => g.names.length > 0);
  const makeRow = (key, label, bin, all) => {
    const few = !all && bin.n < PICK_MIN;
    const row = { key, label, n: bin.n, all, few, cells: [] };
    if (few) return row;
    for (const g of groups) {
      const counts = pickCounts(bin, g.key);
      const sum = Object.values(counts).reduce((a, b) => a + b, 0);
      const cells = g.names.map((name) => {
        const count = counts[name] || 0;
        const share = sum ? count / sum : 0;
        return { group: g.key, name, count, share, pct: Math.round(share * 100), dash: share < 0.01, bold: false };
      });
      const top = cells.reduce((best, c) => (c.share > (best ? best.share : 0) ? c : best), null);
      if (top) top.bold = true;
      row.cells.push(...cells);
    }
    return row;
  };
  return {
    groups: groups.map((g) => ({ ...g, span: g.names.length })),
    columns: groups.flatMap((g) => g.names.map((name) => ({ group: g.key, name, kind: "plain" }))),
    rows: [...(opts.noAll ? [] : [makeRow("all", `All ${clsName}`, total, true)]), ...bins.map((b) => makeRow(`${b.from}-${b.to}`, `${b.from}-${b.to}`, b, false))],
  };
}

/** "By class": one "All {class}" row per class (names = { senior: "Seniors", ... }), same columns for all three so values compare. */
export function heatmapSummary(binsByClass, names, groups) {
  const union = CLASSES.map((c) => binsByClass[c]);
  const tabs = CLASSES.map((c) => heatmapTable(binsByClass[c], names[c], { union, groups }));
  return { groups: tabs[0].groups, columns: tabs[0].columns, rows: tabs.map((t, i) => ({ ...t.rows[0], key: CLASSES[i] })) };
}

/** Cell colors: one hue per group, alpha proportional to the share; white text above 55%. */
export function heatCellStyle(share, group) {
  const rgb = HEAT_GROUPS.find((x) => x.key === group).hue;
  return { background: `rgba(${rgb.join(",")},${(0.06 + 0.94 * share).toFixed(2)})`, color: share > 0.55 ? "#ffffff" : "#1b1b1b" };
}

// ── Trend view: share of spaces taken per 1000-bin across all classes, as stacked areas ──

/**
 * Model for one dimension: bins of every class in number order. points[i] = { from, to, mid, n, few, shares: { name: share },
 * counts: { name: spaces } } (few = fewer than PICK_MIN spaces, so no shares are drawn); names = the bands bottom to top.
 */
export function trendModel(allBins, dim) {
  const bins = [...allBins].sort((a, b) => a.from - b.from);
  const cfg = PICK_DIMS[dim];
  const seen = new Set();
  const points = bins.map((b) => {
    const counts = pickCounts(b, dim);
    const few = b.n < PICK_MIN;
    const shares = {};
    for (const s of pickShares(counts, dim)) {
      shares[s.name] = s.share;
      if (!few) seen.add(s.name);
    }
    return { from: b.from, to: b.to, mid: (b.from + b.to) / 2, n: b.n, few, shares, counts };
  });
  const rank = (n) => (cfg.order.includes(n) ? cfg.order.indexOf(n) : cfg.order.length);
  const names = [...seen].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  return { dim, names, colors: cfg.colors, points, x0: bins.length ? bins[0].from : 0, x1: bins.length ? bins[bins.length - 1].to + 1 : 1 };
}

/** Runs of consecutive bins with enough spaces: [[pointIndex, ...], ...]. Bins in between are the gaps. */
export function trendRuns(points) {
  const runs = [];
  let cur = null;
  points.forEach((p, i) => {
    if (p.few) cur = null;
    else {
      if (!cur) runs.push((cur = []));
      cur.push(i);
    }
  });
  return runs;
}

/** Monotone cubic (Fritsch-Carlson) through [x, y] pixel points: [{ c1, c2, p }] per segment; never overshoots the points. */
export function monotoneSegments(pts) {
  const n = pts.length;
  if (n < 2) return [];
  const h = [];
  const d = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(pts[i + 1][0] - pts[i][0]);
    d.push((pts[i + 1][1] - pts[i][1]) / h[i]);
  }
  const m = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return pts.slice(0, -1).map((p, i) => ({
    c1: [p[0] + h[i] / 3, p[1] + (m[i] * h[i]) / 3],
    c2: [pts[i + 1][0] - h[i] / 3, pts[i + 1][1] - (m[i + 1] * h[i]) / 3],
    p: pts[i + 1],
  }));
}

/**
 * The one fixed column list every heatmap table uses: HEAT_GROUPS order, computed from every class and both phases.
 * A column is left out only when it is zero everywhere (every class, every bin, both phases).
 */
export function heatGroups(data) {
  const seen = { size: new Set(), type: new Set(), area: new Set() };
  for (const phase of ["community", "internal"])
    for (const c of CLASSES) {
      const total = pickTotal(pickBins(data, phase, c));
      for (const g of HEAT_GROUPS) for (const [n, v] of Object.entries(pickCounts(total, g.key))) if (v > 0) seen[g.key].add(n);
    }
  return HEAT_GROUPS.map((g) => ({ ...g, names: g.names.filter((n) => seen[g.key].has(n)) })).filter((g) => g.names.length > 0);
}

// ── Pies view ──

/** Slices in legend order, clockwise from 12 o'clock: [{ name, share, count, color, a0, a1 }] (angles in radians, 0 = 12 o'clock). */
export function pieSlices(shares) {
  let a = 0;
  const out = [];
  for (const s of shares) {
    if (!(s.share > 0)) continue;
    const a1 = a + s.share * 2 * Math.PI;
    out.push({ name: s.name, share: s.share, count: s.count, color: s.color, a0: a, a1 });
    a = a1;
  }
  return out;
}

/**
 * Outside labels for slices of at least minShare: each side of the pie is laid out top to bottom with at least `gap` px between
 * labels (nudged down, then up); if they still do not fit, the smallest slice on that side loses its label.
 * Returns [{ name, share, side (-1 left, 1 right), px, py (pie edge), ex, ey (elbow), tx, ty (text anchor) }].
 */
export function pieLabelLayout(slices, { cx, cy, r, minShare = 0.08, gap = 13, lead = 12 }) {
  const cands = slices
    .filter((s) => s.share >= minShare)
    .map((s) => {
      const mid = (s.a0 + s.a1) / 2;
      return { s, mid, side: Math.sin(mid) >= 0 ? 1 : -1, y: cy - (r + lead) * Math.cos(mid) };
    });
  const top = cy - r - lead - 4;
  const bottom = cy + r + lead + 4;
  const out = [];
  for (const side of [-1, 1]) {
    let list = cands.filter((c) => c.side === side).sort((a, b) => a.y - b.y);
    for (;;) {
      const ys = list.map((c) => c.y);
      for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + gap);
      if (ys.length && ys[ys.length - 1] > bottom) {
        ys[ys.length - 1] = bottom;
        for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - gap);
      }
      if (!ys.length || ys[0] >= top) {
        list.forEach((c, i) => {
          const sn = Math.sin(c.mid);
          const cs = Math.cos(c.mid);
          out.push({
            name: c.s.name,
            share: c.s.share,
            side,
            px: cx + r * sn,
            py: cy - r * cs,
            ex: cx + (r + 8) * sn,
            ey: cy - (r + 8) * cs,
            tx: cx + (r + 8) * sn + side * 6,
            ty: ys[i],
          });
        });
        break;
      }
      const smallest = list.reduce((m, c) => (c.s.share < m.s.share ? c : m), list[0]);
      list = list.filter((c) => c !== smallest);
    }
  }
  return out;
}


// ── By building: share of spaces taken per coarse number range, per building ──

/** Coarse number ranges per class for the By building table. */
export const BUILDING_RANGES = {
  senior: [[1000, 3999], [4000, 6999], [7000, 9999]],
  junior: [[10000, 12999], [13000, 15999], [16000, 19999]],
  soph: [[20000, 22999], [23000, 25999], [26000, 29999]],
};
const AREA_ORDER = ["Large dorms", "Brownstones", "Apartments", "StuVi", "Fenway", "Other"];

/**
 * Model for the By building table. cols = one per coarse range of the shown classes: { cls, label, n, few, bin }.
 * areas = [{ area, color, rows: [{ label, color, total, cells: [{ count, share, pct, dash }] }] }] in area order; buildings inside an
 * area are ordered by their overall share across every class, and buildings with nothing in the shown columns are skipped.
 * A cell is the building's share of all spaces taken in that column's range.
 */
export function buildingTable(binsByClass, classes) {
  const mk = (cls) =>
    BUILDING_RANGES[cls].map(([from, to]) => {
      const bin = pickTotal(binsByClass[cls].filter((b) => b.from >= from && b.to <= to));
      return { cls, from, to, label: `${from}-${to}`, n: bin.n, few: bin.n < PICK_MIN, bin, counts: pickCounts(bin, "bldg") };
    });
  const cols = classes.flatMap(mk);
  const overall = {};
  for (const c of CLASSES.flatMap(mk)) for (const [k, v] of Object.entries(c.counts)) overall[k] = (overall[k] || 0) + v;
  const areas = [];
  for (const area of AREA_ORDER) {
    const rows = BUILDINGS.filter((b) => b.area === area)
      .map((b) => ({
        label: b.label,
        color: b.color,
        total: overall[b.label] || 0,
        cells: cols.map((c) => {
          const count = c.few ? 0 : c.counts[b.label] || 0;
          const share = c.few || !c.n ? 0 : count / c.n;
          return { count, share, pct: Math.round(share * 100), dash: share < 0.005 };
        }),
      }))
      .filter((r) => r.cells.some((c) => c.count > 0))
      .sort((a, b) => b.total - a.total);
    if (rows.length) areas.push({ area, color: PICK_DIMS.area.colors[area], rows });
  }
  return { cols, areas };
}

/** Cell style for the By building table: the building's own color, alpha scaled by the share (full at 40%+), white text above 55%. */
export function buildingCellStyle(share, hex) {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return { background: `rgba(${rgb.join(",")},${(0.08 + 0.92 * Math.min(1, share / 0.4)).toFixed(2)})`, color: share > 0.55 ? "#ffffff" : "#1b1b1b" };
}

// ── Plan ahead: separate, non-overlapping sections ──

const PLAN_AREAS = ["Large dorms", "Brownstones", "Apartments", "StuVi", "Fenway", "Other"];

/**
 * Sections of the Plan ahead table. Inside a section every category is in exactly one group, so rows never overlap.
 * Groups carry { label, cats, series, area? }; the building section's groups use the building map (short names in `short`).
 */
export function planSections(data) {
  const cats = data.categories;
  const mk = (label, list, extra = {}) => ({ label, cats: list, series: makeSeries({ cat: list.map((c) => c.name) }, label), ...extra });
  const bySize = SIZE_ORDER.map((sz) => ({ label: sz, cats: cats.filter((c) => c.size === sz), series: makeSeries({ size: [sz] }) })).filter((g) => g.cats.length);
  const byType = ["Apt", "Studio", "Dorm", "Suite", "Semi-Suite"]
    .map((k) => ({ label: KIND_NAME[k], cats: cats.filter((c) => c.kind === k), series: makeSeries({ kind: [k] }) }))
    .filter((g) => g.cats.length);
  const byArea = PLAN_AREAS.map((a) => mk(a, cats.filter((c) => buildingOfCategory(c).area === a))).filter((g) => g.cats.length);
  const byBuilding = BUILDINGS.map((b) => mk(b.label, cats.filter((c) => buildingOfCategory(c).label === b.label), { area: b.area, short: shortName(b.label), color: b.color })).filter((g) => g.cats.length);
  return [
    { key: "size", title: "By room size", caption: "Every room is in exactly one row.", groups: bySize },
    { key: "type", title: "By room type", caption: "Every room is in exactly one row.", groups: byType },
    { key: "area", title: "By area", caption: "StuVi is counted separately from other apartments.", groups: byArea },
    { key: "bldg", title: "By building", caption: "Every room is in exactly one row.", groups: byBuilding },
  ];
}

/** The reference group "All rooms" over the given categories (same numbers in every section). */
export function allRoomsGroup(list) {
  return { label: "All rooms", cats: list, series: makeSeries({ size: [...SIZE_ORDER] }, "All rooms"), all: true };
}


// ── Room type x size crosstab for What people got ──

/** Row order and display names of the crosstab. */
export const CROSS_KINDS = [["Apt", "Apartment"], ["Suite", "Suite"], ["Semi-Suite", "Semi-Suite"], ["Dorm", "Dorm"], ["Studio", "Studio"]];

/**
 * Room type x size crosstab of net spaces taken (same derivation as pickBins), summed over the given classes.
 * Returns { sizes, rows: [{ key, label, cells: [n], total }], colTotals, total, max }.
 */
export function pickCrossTab(binsByClass, classes) {
  const sizes = SIZE_ORDER;
  const grid = Object.fromEntries(CROSS_KINDS.map(([k]) => [k, sizes.map(() => 0)]));
  for (const c of classes)
    for (const b of binsByClass[c])
      for (const { cat, taken } of b.cats) {
        const i = sizes.indexOf(cat.size);
        if (grid[cat.kind] && i >= 0) grid[cat.kind][i] += taken;
      }
  const rows = CROSS_KINDS.map(([k, label]) => ({ key: k, label, cells: grid[k], total: grid[k].reduce((a, b) => a + b, 0) }));
  const colTotals = sizes.map((_, i) => rows.reduce((a, r) => a + r.cells[i], 0));
  return { sizes, rows, colTotals, total: rows.reduce((a, r) => a + r.total, 0), max: Math.max(1, ...rows.flatMap((r) => r.cells)) };
}
