/**
 * Simulator Acceptance Checks
 * Node script asserting the simulator logic against public/data/availability.json.
 * Run with: node scripts/check-simulator.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as S from "../src/lib/simulator.js";

const {
  isValidData, numberToTime, formatTime, gridLength, validateNumber, numberGroups, timeToPosition,
  makeSeries, addSeriesGroup, allSeriesPresent, groupTotals, groupSeriesValues, addSeries, MAX_SERIES, PLAN_GROUPS, parseSeriesParam, serializeSeries,
  knownSeriesValues, niceTicks, formatTick, rangeDomain, domainIndices, windowBands, layoutWindowLabels,
  takenTotal, takenBySize, takenByStyle, takenByBuilding, crossTab, preInternalSpaces, scenarioNumbers, valueAtTime,
  windowKeysFor, buildingLabel, PRESETS, uniqueValues,
  areaChips, filterCategories, filtersFromParams, filtersToParams, filtersActive, slotTable, lookingSummary, buildingRollup, filterBuckets, defaultBucketTab, bucketSummary, emptyState, describeFilters, lastNumberWithRooms, formatClockDay,
  sortSlotRows, goneByText, hoursUntilAtMost, formatDuration, remainingKey, VERDICTS,
  baselineIndex, groupStats, pickedSeries, availabilityWord, levelOf, classifyCategories, classifyRoom, takenAroundCategory, BUCKET_KEYS, BUCKET_LABELS, cardInfo, CARD_TAGS,
  openAtSlot, afterSlot, pickingAround, pickingWindow, formatSlot, formatEndDay,
  planRowFor, goneLabel, goneRank, sortPlanRows, seriesCategories, makeNumberToTime, indexToTime,
} = S;

const data = JSON.parse(readFileSync(new URL("../public/data/availability.json", import.meta.url)));
assert(isValidData(data));
const { meta } = data;
const len = gridLength(data);
const last = len - 1;
const cat = (n) => data.categories.find((c) => c.name === n);
const bi = baselineIndex(meta);

// ── Basics ──
const west = cat("West Double");
assert.equal(west.rooms, 728);
assert.equal(west.openRooms[last], 406);
assert.equal(cat("StuVi1 Single Apartment").openRooms[last], 0);
assert.equal(bi, 10, "first grid point at/after internalStart");
assert(indexToTime(meta, bi) >= meta.internalStart && indexToTime(meta, bi - 1) < meta.internalStart);

// ── Definitions: locked, baseline, leftover, picked ──
const all = groupStats(meta, data.categories);
assert.equal(all.locked, 1461);
assert.equal(all.L, 1018);
assert.equal(all.rooms, 5300);
const wd = groupStats(meta, [west]);
assert.deepEqual([wd.locked, wd.B, wd.L, wd.C], [60, 668, 406, 262]);
const sv = groupStats(meta, [cat("StuVi1 Single Apartment")]);
assert.deepEqual([sv.locked, sv.B, sv.L], [280, 392, 0]);
for (const c of data.categories) {
  const cs = pickedSeries(meta, [c]);
  const st = groupStats(meta, [c]);
  assert.equal(st.C, Math.max(0, st.B - st.L));
  if (!cs) { assert(st.C <= 0); continue; }
  assert.equal(cs.share[bi], 1, `${c.name} starts at 100%`); // baseline point is exactly B, so (B - L) / C = 1
  assert(cs.share.every((v) => v >= 0 && v <= 1));
  assert.equal(cs.share[last], 0, `${c.name} picked is gone by the last snapshot`);
}

// ── Number -> time ──
const et = (n, phase = "community") => formatTime(numberToTime(data.anchors, phase, n));
assert.match(et(5018), /Thu, Mar 26, 5:20 PM/);
assert.match(et(22510), /Mon, Mar 30, 6:05 PM/);
assert.match(et(26164), /Tue, Mar 31, 4:50 PM/);
assert.match(et(23350), /Mar 30/);
assert.match(et(23351), /Mar 31/);
assert.equal(numberToTime(data.anchors, "community", 1), numberToTime(data.anchors, "community", 1000));
assert.match(et(9999, "internal"), /Mon, Mar 23, 8:25 PM/);
assert.match(et(10000, "internal"), /Tue, Mar 24, 3:35 PM/);
assert.match(et(29999, "internal"), /Tue, Mar 24, 8:10 PM/);
const it = (n) => numberToTime(data.anchors, "internal", n);
const hourFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false });
for (let n = 1000; n <= 29999; n++) {
  const h = Number(hourFmt.format(it(n)));
  assert(h >= 15 && h <= 20, `internal ${n} resolves overnight (hour ${h})`);
  if (n > 1000 && n !== 10000) assert(it(n) >= it(n - 1), `internal not monotone at ${n}`);
}
assert.deepEqual(scenarioNumbers(meta, "senior").map((x) => x.n), [1900, 3250, 5500, 7750, 9100]);

// ── Number validation, groups, bad JSON ──
for (const [cls, ok, bad] of [["senior", "5018", "10000"], ["junior", "10000", "9999"], ["soph", "29999", "30000"]]) {
  assert.equal(validateNumber(meta, cls, ok), "");
  assert.notEqual(validateNumber(meta, cls, bad), "");
}
assert.notEqual(validateNumber(meta, "senior", "abc"), "");
const g = numberGroups(meta, "senior");
assert.equal(g.length, 9);
assert.equal(g[4].label, "5000-5999");
assert.equal(g[4].mid, 5500);
assert.equal(isValidData(null), false);
assert.equal(isValidData({}), false);
assert.equal(isValidData({ ...data, categories: "x" }), false);
assert.equal(isValidData({ ...data, meta: { ...meta, windows: undefined } }), false);
assert.equal(isValidData({ ...data, meta: { ...meta, internalStart: undefined } }), false);
assert.equal(isValidData({ ...data, categories: data.categories.map((c) => ({ ...c, spacesTaken: undefined })) }), false);

// ── Plan ahead: rows ──
const rowsFor = (cls, phase) =>
  PLAN_GROUPS.map((gr) => planRowFor(data, gr, seriesCategories(data, gr.series), { cls, phase })).filter(Boolean);
for (const cls of ["senior", "junior", "soph"]) {
  for (const phase of ["internal", "community"]) {
    const rows = rowsFor(cls, phase);
    assert(rows.length >= 10);
    for (const r of rows) {
      // every group starts at 100% of picked rooms at the baseline snapshot
      const cs = pickedSeries(meta, r.cats);
      assert.equal(cs.share[bi], 1, `${r.group.label} baseline`);
      assert.equal((cs.share[bi] * 100).toFixed(1), "100.0");
      assert.equal(r.cells.length, 5);
      assert(r.cells.every((c) => c.share >= 0 && c.share <= 1 && ["Plenty", "Some", "Slim", "Gone"].includes(c.word)));
      // half gone is never later than mostly gone
      assert(goneRank(r.half) <= goneRank(r.mostly), `${r.group.label} ${cls} ${phase}`);
      if (r.half.kind === "none") assert.equal(r.mostly.kind, "none");
      const labels = [goneLabel(r.half, meta, phase), goneLabel(r.mostly, meta, phase)];
      for (const l of labels) assert.match(l, /^(~#[\d,]+ \((Senior|Junior|Soph)\)|before #1,000|not during Internal|after #29,999)$/);
      if (r.half.kind === "none") assert.equal(labels[0], phase === "internal" ? "not during Internal" : "after #29,999");
      assert.equal(r.spark[0].n, 1000);
      assert.equal(r.spark[r.spark.length - 1].n, 29999);
    }
  }
}
// A group that never drops in Internal says so; the same group does drop in Community
{
  const dorms = PLAN_GROUPS.find((x) => x.label === "All dorms");
  const row = planRowFor(data, dorms, seriesCategories(data, dorms.series), { cls: "senior", phase: "internal" });
  assert.equal(row.half.kind, "none");
  assert.equal(goneLabel(row.half, meta, "internal"), "not during Internal");
  assert.equal(goneLabel({ kind: "none" }, meta, "community"), "after #29,999");
  assert.equal(goneLabel({ kind: "before", n: 1000 }, meta, "community"), "before #1,000");
  assert.equal(goneLabel({ kind: "at", n: 2937 }, meta, "community"), "~#2,900 (Senior)");
  assert.equal(goneLabel({ kind: "at", n: 12345 }, meta, "community"), "~#12,300 (Junior)");
  assert.equal(goneLabel({ kind: "at", n: 24001 }, meta, "community"), "~#24,000 (Soph)");
}
// West Double alone: 406 leftover, 262 picked, zero picked rooms left by the last snapshot (but not yet at #29999)
{
  const group = { label: "West Double", series: makeSeries({ cat: ["West Double"] }) };
  const r = planRowFor(data, group, [west], { cls: "soph", phase: "community" });
  assert.deepEqual([r.B, r.L, r.C], [668, 406, 262]);
  const cs = pickedSeries(meta, [west]);
  assert.equal(cs.share[last], 0);
  assert.equal(r.L, 406);
  assert(r.spark[r.spark.length - 1].share < 0.1, "nearly gone at #29999");
  assert.equal(availabilityWord(0).word, "Gone");
}
// Words and levels
assert.deepEqual([0.5, 0.2, 0.05, 0.049].map((p) => availabilityWord(p).word), ["Plenty", "Some", "Slim", "Gone"]);
assert.deepEqual([0.5, 0.49, 0.2, 0.19].map(levelOf), ["likely", "hit", "hit", "gone"]);

// Sorting: Gone earliest puts StuVi / apartments before dorms
for (const cls of ["senior", "junior"]) {
  const sorted = sortPlanRows(rowsFor(cls, "community"), "gone").map((r) => r.group.label);
  const idx = (n) => sorted.indexOf(n);
  assert(idx("StuVi") < idx("All dorms") && idx("All apartments") < idx("All dorms"), sorted.join(" > "));
}
{
  const rows = rowsFor("senior", "community");
  const by = (k) => sortPlanRows(rows, k);
  assert.equal(by("never")[0].L, Math.max(...rows.map((r) => r.L)));
  assert.equal(by("picked")[0].C, Math.max(...rows.map((r) => r.C)));
  assert.deepEqual(by("name").map((r) => r.group.label), [...rows.map((r) => r.group.label)].sort((a, b) => a.localeCompare(b, "en", { numeric: true })));
  // groups that never drop sort last under Gone earliest
  const g = by("gone");
  const firstNone = g.findIndex((r) => r.half.kind === "none");
  assert(firstNone === -1 || g.slice(firstNone).every((r) => r.half.kind === "none"));
}
// Group sums: a group's baseline is the sum of its categories' baselines (sum, then divide)
{
  const doubles = PLAN_GROUPS.find((x) => x.label === "All doubles");
  const cats = seriesCategories(data, doubles.series);
  const st = groupStats(meta, cats);
  assert.equal(st.B, cats.reduce((a, c) => a + c.openRooms[bi], 0));
  const sh = pickedSeries(meta, cats).share;
  const i = 60;
  const open = cats.reduce((a, c) => a + c.openRooms[i], 0);
  assert(Math.abs(sh[i] - Math.max(0, open - st.L) / st.C) < 1e-12);
}

// ── My number buckets: Plenty / A few left / Toss-up / Gone ──
{
  const KEYS = ["plenty", "few", "toss", "gone"];
  // the rule itself
  assert.equal(classifyRoom(0, 0, 5), "gone");
  assert.equal(classifyRoom(10, 0, 2), "plenty"); // T <= 0.2 X
  assert.equal(classifyRoom(10, 0, 3), "toss"); // being drained, nothing left over
  assert.equal(classifyRoom(10, 5, 9), "plenty"); // L / X >= 0.5 beats a high T
  assert.equal(classifyRoom(10, 4, 9), "toss");
  assert.equal(classifyRoom(9, 0, 0), "few"); // 1-9 open and nothing taken
  assert.equal(classifyRoom(9, 5, 4), "few");
  assert.equal(classifyRoom(9, 4, 1), "toss");
  assert.equal(classifyRoom(1, 1, 3), "few");
  assert.equal(classifyRoom(13, 13, 99), "plenty");
  assert.equal(classifyRoom(5, 9, 0), "few"); // L is capped at X
  assert.deepEqual(BUCKET_KEYS, KEYS);
  assert.deepEqual(KEYS.map((k) => BUCKET_LABELS[k]), ["Plenty", "A few left", "Toss-up", "Gone"]);

  // every category lands in exactly one bucket, and obeys the rule
  const t = numberToTime(data.anchors, "community", 5018);
  const r = classifyCategories(data, t, "community");
  assert.equal(KEYS.reduce((a, k) => a + r[k].length, 0), data.categories.length);
  assert.equal(r.never.reduce((a, x) => a + x.L, 0), 1018);
  const everyItem = KEYS.flatMap((k) => r[k].map((it) => ({ ...it, k })));
  for (const it of everyItem) {
    assert.equal(it.X, Math.round(valueAtTime(it.cat.openRooms, meta, t)));
    assert.equal(it.L, Math.min(it.cat.fillBuckets.neverFilled, it.X));
    assert.equal(it.T, takenAroundCategory(it.cat, meta, t, "community"));
    assert.equal(it.k, classifyRoom(it.X, it.L, it.T), `${it.cat.name}`);
    if (it.k === "gone") assert.equal(it.X, 0);
    if (it.k === "plenty") assert(it.X >= 10);
    if (it.k === "few") assert(it.X >= 1 && it.X <= 9);
    if (it.k === "toss") assert(it.X >= 1);
  }
  for (const k of KEYS) for (let i = 1; i < r[k].length; i++) assert(r[k][i - 1].X0 >= r[k][i].X0, `${k} sorted by X`);

  // card text: three lines, tags only when they apply, and none of the removed wording
  for (const it of everyItem) {
    const info = cardInfo(it);
    assert.equal(info.x, `${it.X} open at your slot`);
    assert.equal(info.taken, it.T > 0 ? `${it.T} taken in the hour around your slot` : "None taken around your slot");
    assert.equal(info.left, `${it.L} still open when selection ended`);
    const labels = info.tags.map((tg) => tg.label);
    assert.equal(labels.includes("Still open at the end"), it.X > 0 && it.L / it.X >= 0.8);
    assert.equal(labels.includes("Gets picked"), it.X > 0 && it.T > 0.2 * it.X);
    assert(labels.every((l) => Object.values(CARD_TAGS).some((tg) => tg.label === l)));
    assert.equal(/got picked last year|small sample|all season|Safe/.test(JSON.stringify(info)), false);
  }
  assert.equal(CARD_TAGS.end.cls, "left");
  assert.equal(CARD_TAGS.picked.cls, "fast");

  // Community / Soph / #29500
  const late = numberToTime(data.anchors, "community", 29500);
  const lc = classifyCategories(data, late, "community");
  const find = (name) => KEYS.map((k) => ({ k, it: lc[k].find((x) => x.cat.name === name) })).find((x) => x.it);
  const near = (v, n) => Math.abs(v - n) <= 8;
  const wd = find("West Double");
  assert.equal(wd.k, "plenty");
  assert(near(wd.it.X, 422) && wd.it.L === 406);
  assert.equal(find("Warren Double").k, "plenty");
  assert(near(find("Warren Double").it.X, 192));
  assert.equal(find("South Brownstone Single").k, "few");
  assert.equal(find("South Brownstone Single").it.X, 1);
  assert.equal(find("West Single").k, "few");
  assert.equal(find("West Single").it.X, 1);
  const wq = find("Warren Quad");
  assert.equal(wq.k, "plenty");
  assert.equal(wq.it.X, 13);
  assert.equal(JSON.stringify(cardInfo(wq.it)).includes("picked"), false, "no '0 rooms picked' text on Warren Quad");
  assert.equal(cardInfo(wq.it).tags.map((x) => x.label).join(), "Still open at the end");
  assert.equal(lc.plenty[0].cat.name, "West Double");
  // a category with nothing open is Gone
  assert(lc.gone.every((x) => x.X === 0) && lc.gone.length > 0);

  // Community / Senior / #5500: Core House Single (small, mostly untouched) is not Gone
  const r55 = classifyCategories(data, numberToTime(data.anchors, "community", 5500), "community");
  const core = KEYS.map((k) => ({ k, it: r55[k].find((x) => x.cat.name === "Core House Single") })).find((x) => x.it);
  assert(core.k === "few" || core.k === "plenty", `Core House Single is ${core.k}`);
  // the +/-1 hour window follows the phase range (clamped), so a slot at the very start never reads before it
  const startT = classifyCategories(data, meta.communityOpensAt, "community");
  assert(KEYS.every((k) => startT[k].every((x) => x.T >= 0)));
  // synthetic categories: drained vs not, leftover vs not
  const flat = (v) => new Array(len).fill(v);
  const mk = (rooms, openFn, spacesFn, never, name) => ({ ...west, name, rooms, fillBuckets: { ...west.fillBuckets, neverFilled: never, preInternal: 0 },
    openRooms: Array.from({ length: len }, (_, i) => openFn(i)), emptyRooms: flat(0), openSpaces: Array.from({ length: len }, (_, i) => spacesFn(i)) });
  const at = (cat, i) => classifyCategories({ ...data, categories: [cat] }, indexToTime(meta, i), "community");
  const calm = mk(100, () => 50, () => 50, 0, "Calm"); // 50 open, nothing taken around the slot, none left over at the end?
  assert.equal(at({ ...calm, openRooms: calm.openRooms, fillBuckets: { ...calm.fillBuckets, neverFilled: 50 } }, 300).plenty.length, 1);
  const draining = mk(100, (i) => (i < 300 ? 50 : 0), (i) => (i < 300 ? 50 : 0), 0, "Draining"); // all gone after the slot
  assert.equal(at(draining, 299).toss.length, 1, "open now but drained, nothing left over: toss-up");
  assert.equal(at(draining, 299).toss[0].drained, true);
}
// ── Explore: groups, % from baseline, URL state ──
const tot = (clauses, ex = false) => groupTotals(data, makeSeries(clauses), ex);
assert.equal(tot({ size: ["Single"] }).rooms, 2248);
assert.equal(tot({ size: ["Double"] }).rooms, 2646);
assert.equal(tot({ size: ["Triple"] }).rooms, 369);
assert.equal(tot({ size: ["Quad"] }).rooms, 37);
assert.equal(tot({ kind: ["Apt"] }).rooms, 1569);
assert.equal(tot({ building: ["StuVi1", "StuVi2"] }).rooms, 1362);
assert.equal(tot({ building: ["StuVi1"], size: ["Single"] }).cats.length > 0, true); // AND
for (const clauses of [{ size: ["Single"] }, { kind: ["Apt"] }, { building: ["StuVi1", "StuVi2"], size: ["Single"] }]) {
  const s = makeSeries(clauses);
  const t = groupTotals(data, s);
  const pct = groupSeriesValues(data, s, "pct", false);
  assert.equal(pct[bi], 1, "Explore lines start at 100%");
  assert.equal(t.baseline, t.cats.reduce((a, c) => a + c.openRooms[bi], 0));
  assert.equal(t.rooms - t.locked >= t.baseline - 2, true);
  const i = 100;
  assert(Math.abs(pct[i] - Math.min(1, t.cats.reduce((a, c) => a + c.openRooms[i], 0) / t.baseline)) < 1e-12);
  assert.equal(groupSeriesValues(data, s, "count", false)[i], t.cats.reduce((a, c) => a + c.openRooms[i], 0));
}
for (const clauses of [{ size: ["Double"] }, { building: ["West"] }]) {
  const s = makeSeries(clauses);
  const t = groupTotals(data, s, true);
  assert.equal(t.denom, t.baseline - t.never);
  const ex = groupSeriesValues(data, s, "pct", true);
  assert.equal(ex[bi], 1);
  assert.equal(ex[last], 0);
  assert(ex.every((v) => v >= 0 && v <= 1));
  assert.equal(groupSeriesValues(data, s, "count", true)[bi], t.baseline - t.never);
}
{
  const [d0, d1] = rangeDomain(meta, "full");
  assert.equal(d0, indexToTime(meta, bi));
  assert.equal(d1, indexToTime(meta, last));
}
let list = [];
for (let k = 0; k < MAX_SERIES; k++) list = addSeries(list, [makeSeries({ cat: [data.categories[k].name] })]).list;
assert.equal(list.length, 8);
const blocked = addSeries(list, [makeSeries({ cat: [data.categories[8].name] })]);
assert.equal(blocked.list.length, 8);
assert.match(blocked.message, /Limit of 8/);
assert.equal(addSeries(list, [list[0]]).message, "");
const param = "size:Single,size:Double,kind:Apt,building:StuVi1+StuVi2";
const parsed = parseSeriesParam(param);
assert.equal(parsed.length, 4);
assert.equal(serializeSeries(parsed), param);
assert.equal(parsed[3].name, "All StuVi");
assert.equal(serializeSeries(parseSeriesParam("building:StuVi1+StuVi2|size:Single~My Name")), "building:StuVi1+StuVi2|size:Single~My Name");
assert.equal(makeSeries({ building: ["StuVi1", "StuVi2"], size: ["Single"] }).name, "StuVi - Single");
assert.deepEqual(parseSeriesParam("junk,nope:x"), []);
const known = knownSeriesValues(data);
assert.equal(groupTotals(data, parseSeriesParam("building:StuVi1 StuVi2", known)[0]).rooms, 1362);
assert.deepEqual(parseSeriesParam("building:South Brownstone", known)[0].clauses.building, ["South Brownstone"]);
assert.equal(parseSeriesParam("cat:West Double", known)[0].clauses.cat[0], "West Double");
assert.equal(PRESETS.length, 12);

// Axis ticks
assert.deepEqual([0, 0.25, 0.5, 0.75, 1].map((v) => formatTick("pct", v)), ["0%", "25%", "50%", "75%", "100%"]);
for (const max of [1, 7, 37, 252, 728, 2646, 5300]) {
  const { ticks, max: top } = niceTicks(max);
  assert(ticks.every(Number.isInteger) && top >= max && ticks.length >= 2 && ticks.length <= 8);
}
// Ranges, bands, label layout at phone and desktop widths
for (const range of ["full", "internal", "community"]) {
  const dom = rangeDomain(meta, range);
  const [a, b] = domainIndices(meta, dom, len);
  assert(a >= 0 && b <= last && b > a, `${range} indices`);
  const bands = windowBands(meta, dom);
  assert(bands.length > 0);
  for (const width of [375, 768, 1200]) {
    const left = 40, right = width >= 760 ? 128 : 14;
    const xOf = (t) => left + ((t - dom[0]) / (dom[1] - dom[0])) * (width - left - right);
    const labels = layoutWindowLabels(bands, xOf, { left, right: width - right, compact: width < 560 });
    for (const l of labels) assert(l.x >= left - 1e-9 && l.x + l.w <= width - right + 1e-9, `${range}@${width}: ${l.text} clipped`);
    for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
      if (labels[i].row === labels[j].row) {
        const [p, q] = labels[i].x < labels[j].x ? [labels[i], labels[j]] : [labels[j], labels[i]];
        assert(p.x + p.w <= q.x, `${range}@${width}: ${p.text} overlaps ${q.text}`);
      }
    }
  }
}
assert(windowBands(meta, rangeDomain(meta, "internal")).every((b) => b.phase === "internal"));
assert(windowBands(meta, rangeDomain(meta, "community")).every((b) => b.phase === "community"));

// ── My number: "What are you looking for?" ──
{
  const t = numberToTime(data.anchors, "community", 5500);
  const table = (flt, tt = t) => slotTable(data, tt, filterCategories(data, flt));
  const shown = (rows) => rows.filter((r) => r.open > 0);
  // Size = Single: only singles, key categories open, summary equals the rows
  const singles = shown(table({ sizes: ["Single"] }));
  assert(singles.length > 0 && singles.every((r) => r.cat.size === "Single"));
  for (const n of ["StuVi1 Single Apartment", "South Apartment Single", "BSR Brownstone Single", "South Studio Single"]) {
    const r = singles.find((x) => x.cat.name === n);
    assert(r && r.open > 0, `${n} should be open at #5500`);
  }
  const sum = lookingSummary(singles);
  assert.equal(sum.R, singles.reduce((a, r) => a + r.open, 0));
  assert.equal(sum.S, singles.reduce((a, r) => a + r.spaces, 0));
  assert.equal(sum.B, new Set(singles.map((r) => r.cat.building)).size);
  assert.equal(buildingRollup(singles).reduce((a, b) => a + b.open, 0), sum.R);
  assert(buildingRollup(singles).every((b, i, a) => i === 0 || a[i - 1].open >= b.open));
  // Apartment + Double: only apartment doubles
  const apd = shown(table({ kinds: ["Apt"], sizes: ["Double"] }));
  assert(apd.length > 0 && apd.every((r) => r.cat.kind === "Apt" && r.cat.size === "Double"));
  for (const n of ["South Apartment Double", "Comm Ave Apartment Double", "BSR Apartment Double"]) assert(apd.some((r) => r.cat.name === n), n);
  // OR within a row, AND across rows
  assert(filterCategories(data, { sizes: ["Single", "Double"] }).every((c) => ["Single", "Double"].includes(c.size)));
  assert.equal(filterCategories(data, {}).length, data.categories.length);
  assert(filterCategories(data, { areas: ["stuvi"] }).every((c) => c.building.startsWith("StuVi")));
  assert(filterCategories(data, { areas: ["brown", "b:West"] }).every((c) => /Brownstone|^West$/.test(c.building)));
  assert(areaChips(data).map((c) => c.key).slice(0, 4).join() === "stuvi,brown,bsr,south");
  assert(areaChips(data).some((c) => c.key === "b:West") && areaChips(data).some((c) => c.key === "b:HoJo"));
  // columns: t + delta is clamped to the end of the data; the end column is the final snapshot
  const lateEnd = table({ sizes: ["Double"] }, indexToTime(meta, last) - 3600000);
  for (const r of lateEnd) assert.equal(r.h24, Math.round(r.cat.openRooms[last]), "t+24h past the end shows the end value");
  for (const r of singles) {
    assert.equal(r.end, r.cat.openRooms[last]);
    assert(r.h1 <= r.open + 1 && r.h24 <= r.h6 + 1);
    assert(r.verdict && VERDICTS[r.verdict] && r.verdict === classifyRoom(r.open, Math.min(r.cat.fillBuckets.neverFilled, r.open), r.taken));
    assert(goneByText(r).length > 0);
  }
  // Late slot (Community / Soph / #29500) with Size = Single: small numbers, never blank
  const late = numberToTime(data.anchors, "community", 29500);
  const lateRows = shown(table({ sizes: ["Single"] }, late));
  const lateSum = lookingSummary(lateRows);
  assert(lateSum.R >= 0 && lateRows.every((r) => r.cat.size === "Single"));
  assert(lateRows.length === 0 || lateSum.R < sum.R / 5, "a late slot has few singles left");
  // empty-state card: Community / Soph / #29500, Size = Single + Kind = Apartment
  const F = (o) => ({ sizes: [], kinds: [], areas: [], ...o });
  const es = emptyState(data, late, "community", "soph", 29500, F({ sizes: ["Single"], kinds: ["Apt"] }));
  assert.equal(es.level, "none");
  assert.equal(es.R, 0);
  assert.equal(es.desc.adjArea, "single apartment rooms");
  assert.equal(es.wasOpen.length, 5);
  assert.equal(es.wasOpen[0].cat.name, "West Double");
  assert(Math.abs(es.wasOpen[0].open - 422) <= 8);
  assert(es.wasOpen.every((r, i) => i === 0 || es.wasOpen[i - 1].open >= r.open));
  // these apartment singles were all gone before the Soph window opened, so the window never had them
  assert.equal(es.lastSlot, null);
  // closest match: drop Kind (apartments) keeps singles; the line and button name the relaxed pool plainly
  assert.equal(es.closest.row, "kinds");
  assert.equal(es.closest.n, 21);
  assert.equal(es.closest.line, "Drop the apartment filter: 21 singles open");
  assert.equal(es.closest.button, "Show 21 single rooms");
  assert.deepEqual(es.closest.filters, F({ sizes: ["Single"] }));
  // a filter that had rooms earlier in the window reports where it ran out
  let ranOut = null;
  for (const sz of ["Single", "Double", "Triple", "Quad"]) for (const k of ["Apt", "Studio", "Suite", "Semi-Suite", "Dorm"]) {
    const e = emptyState(data, late, "community", "soph", 29500, F({ sizes: [sz], kinds: [k] }));
    if (e.level === "none" && e.lastSlot) { ranOut = e; break; }
  }
  assert(ranOut, "some empty pool should have existed earlier in the Soph window");
  assert(ranOut.lastSlot.n >= 20000 && ranOut.lastSlot.n < 29500 && ranOut.lastSlot.t < late);
  assert.match(formatClockDay(ranOut.lastSlot.t), /^\d{1,2}:\d\d [AP]M ET on (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d+\/\d+$/);
  // a handful left (1-5 rooms) is "few": the rooms stay listed beneath instead of being replaced
  let few = null;
  for (const sz of ["Single", "Double", "Triple", "Quad"]) for (const k of ["Apt", "Studio", "Suite", "Semi-Suite", "Dorm"]) for (const a of [[], ["stuvi"], ["brown"], ["south"], ["bsr"]]) {
    const fl = F({ sizes: [sz], kinds: [k], areas: a });
    const e = emptyState(data, late, "community", "soph", 29500, fl);
    if (e.level === "few") { few = { e, fl }; break; }
  }
  assert(few, "expected a filter with 1-5 rooms left at #29500");
  assert(few.e.R >= 1 && few.e.R <= 5);
  const fewRows = slotTable(data, late, filterCategories(data, few.fl)).filter((r) => r.open > 0);
  assert(fewRows.length > 0 && lookingSummary(fewRows).R === few.e.R, "the few rooms are listed");
  assert.equal(few.e.lastSlot, null, "no 'gone by' line while some are still open");
  // none-level for a pool that never existed anywhere in the window vs. an unfiltered pool that is plentiful
  assert.equal(emptyState(data, late, "community", "soph", 29500, F({})).level, "ok");
  assert.equal(describeFilters(data, F({})).adj, "");
  assert.equal(emptyState(data, late, "community", "soph", 29500, F({ sizes: ["Single"], kinds: ["Studio"], areas: ["south"] })).closest.line, "Drop the studio filter: 1 single room in South Campus open");
  // same card for any phase / class / number: copy changes by variables only
  for (const [phase, cls, n] of [["internal", "senior", 9999], ["community", "senior", 1000], ["community", "junior", 15000], ["internal", "soph", 25000]]) {
    const tt = numberToTime(data.anchors, phase, n);
    for (const fl of [F({ sizes: ["Quad"], kinds: ["Studio"] }), F({ sizes: ["Single"] }), F({})]) {
      const e = emptyState(data, tt, phase, cls, n, fl);
      assert(["none", "few", "ok"].includes(e.level) && Array.isArray(e.wasOpen));
      if (e.level === "none" && e.lastSlot) assert(e.lastSlot.n < n);
    }
  }
  assert.equal(lastNumberWithRooms(data, filterCategories(data, F({ sizes: ["Single"] })), "community", "soph", 29500).n < 29500, true);
  // sorting
  const byName = sortSlotRows(singles, "name", "asc").map((r) => r.cat.name);
  assert.deepEqual(byName, [...byName].sort((a, b) => a.localeCompare(b, "en", { numeric: true })));
  const byOpen = sortSlotRows(singles, "open", "desc");
  assert(byOpen.every((r, i) => i === 0 || byOpen[i - 1].open >= r.open));
  assert(sortSlotRows(singles, "end", "asc").every((r, i, a) => i === 0 || a[i - 1].end <= r.end));
  // URL round trip
  const f = { sizes: ["Single", "Double"], kinds: ["Apt"], areas: ["stuvi", "b:West"], hideZero: false };
  const q = new URLSearchParams();
  filtersToParams(f, (k, v) => q.set(k, v));
  assert.deepEqual(filtersFromParams((k) => q.get(k)), f);
  assert.deepEqual(filtersFromParams(() => null), { sizes: [], kinds: [], areas: [], hideZero: true });
  assert.equal(filtersActive(f), true);
  assert.equal(filtersActive({ sizes: [], kinds: [], areas: [], hideZero: true }), false);
  const q2 = new URLSearchParams();
  filtersToParams({ sizes: [], kinds: [], areas: [], hideZero: true }, (k, v) => q2.set(k, v));
  assert.equal(String(q2), "", "default filters add nothing to the URL");
  // gone-by, verdicts and colors on a synthetic category
  const mk = (fn, open0 = 100) => ({ ...west, name: "Syn", small: false, rooms: 200, fillBuckets: { ...west.fillBuckets, neverFilled: 0, preInternal: 0 },
    openRooms: Array.from({ length: len }, (_, i) => fn(i)), emptyRooms: new Array(len).fill(0), openSpaces: Array.from({ length: len }, (_, i) => fn(i)), open0 });
  const t0 = indexToTime(meta, 100);
  const half = mk((i) => (i <= 100 ? 100 : Math.max(0, 100 - (i - 100) * 25))); // 25 rooms per 30 min: half gone in 1 h, zero in 2 h
  const rHalf = slotTable({ ...data, categories: [half] }, t0, [half])[0];
  assert.deepEqual([rHalf.gone.kind, Math.round(rHalf.gone.hours * 10) / 10], ["zero", 2]);
  assert.equal(rHalf.verdict, "toss", "50 of 100 taken around the slot, nothing left over: toss-up");
  assert.equal(goneByText(rHalf), "Gone in ~2 h");
  const never = mk(() => 100);
  const rNever = slotTable({ ...data, categories: [never] }, t0, [never])[0];
  assert.equal(goneByText(rNever), "Still open at the end");
  assert.equal(rNever.verdict, "plenty");
  const slow = mk((i) => (i <= 100 ? 100 : Math.max(60, 100 - (i - 100) * 2))); // never reaches half (floor at 60), 76% left after 6 h
  const rSlow = slotTable({ ...data, categories: [slow] }, t0, [slow])[0];
  assert.equal(rSlow.gone.kind, "never");
  assert.equal(rSlow.verdict, "plenty", "drained slowly: T is small compared with 100 open");
  const tight = mk((i) => (i <= 100 ? 100 : i <= 108 ? 100 - (i - 100) * 6.5 : 48)); // half gone after ~3.9 h (not within 1 h), 48% left after 6 h
  const rTight = slotTable({ ...data, categories: [tight] }, t0, [tight])[0];
  assert.equal(rTight.gone.kind, "half");
  assert.equal(rTight.verdict, "plenty", "13 taken around the slot is under 20% of 100 open, even though half is gone within 4 h");
  assert.match(goneByText(rTight), /^Half gone ~[\d.]+ h after your slot$/);
  const zero0 = mk(() => 0);
  const rZero = slotTable({ ...data, categories: [zero0] }, t0, [zero0])[0];
  assert.equal(goneByText(rZero), "None open at your slot");
  assert.equal(rZero.verdict, "gone");
  assert.equal(hoursUntilAtMost([5, 5, 5], meta, meta.gridStart, 1), null);
  assert.deepEqual([formatDuration(0.67), formatDuration(2), formatDuration(2.4), formatDuration(60)], ["40 min", "2 h", "2.5 h", "2.5 days"]);
  assert.deepEqual(Object.values(VERDICTS).map((v) => v.label), ["Plenty", "A few left", "Toss-up", "Gone"]);
  assert.deepEqual([0.9, 0.7, 0.69, 0.3, 0.29].map(remainingKey), ["plenty", "plenty", "some", "some", "gone"]);
  // page: filters are written to / read from the URL and the buckets collapse while a filter is active
  const lf = readFileSync(new URL("../src/components/SimulatorLookingFor.jsx", import.meta.url), "utf8");
  assert(/What are you looking for\?/.test(lf) && /Hide rows with 0 open at my slot/.test(lf) && /Based on last year&apos;s selection\. Numbers and room supply will differ\./.test(lf));
  assert(/filtersFromParams/.test(pageSrc2()) && /filtersToParams/.test(pageSrc2()));
  assert(/None left\. Sorry\./.test(lf) && /Basically none left\./.test(lf) && /What WAS still open at your number/.test(lf) && /Closest match/.test(lf) && /Clear filters/.test(lf));
  assert(/None were open at any point in this window\./.test(readFileSync(new URL("../src/components/SimulatorLookingFor.jsx", import.meta.url), "utf8")));
  assert(!/Try removing a filter|No matching categories to list/.test(lf), "old plain-text empty states are gone");
  const mn = readFileSync(new URL("../src/components/SimulatorMyNumber.jsx", import.meta.url), "utf8");
  assert(!/sim-buckets|all categories\)/.test(mn), "the collapsed bucket disclosure is gone");
  assert(/role="tablist"/.test(mn) && /role="tab"/.test(mn) && /bucketSummary/.test(mn));
  function pageSrc2() { return readFileSync(new URL("../src/pages/SimulatorPage.jsx", import.meta.url), "utf8"); }
}

// ── My number: bucket tabs ──
{
  const K = ["plenty", "few", "toss", "gone"];
  const none = { sizes: [], kinds: [], areas: [] };
  const t = numberToTime(data.anchors, "community", 5500);
  const res = classifyCategories(data, t, "community");
  const all = filterBuckets(data, res, none);
  const counts = K.map((k) => all[k].length);
  assert.equal(counts.reduce((a, b) => a + b, 0), data.categories.length);
  assert.equal(defaultBucketTab(all), K.find((k) => all[k].length > 0));
  assert.equal(bucketSummary(all), `${counts[0]} room types have plenty left, ${counts[1]} have just a few, ${counts[2]} are a toss-up, ${counts[3]} are gone.`);
  // filters narrow contents and counts together
  const sg = filterBuckets(data, res, { sizes: ["Single"], kinds: [], areas: [] });
  for (const k of K) assert(sg[k].every((x) => x.cat.size === "Single"));
  assert.equal(K.reduce((a, k) => a + sg[k].length, 0), data.categories.filter((c) => c.size === "Single").length);
  const apt = filterBuckets(data, res, { sizes: [], kinds: ["Apt"], areas: ["stuvi"] });
  assert(K.every((k) => apt[k].every((x) => x.cat.kind === "Apt" && x.cat.building.startsWith("StuVi"))));
  // default tab: first non-empty of Plenty, A few left, Toss-up, Gone; the summary is never blank
  assert.equal(defaultBucketTab({ plenty: [], few: [1], toss: [1], gone: [1] }), "few");
  assert.equal(defaultBucketTab({ plenty: [], few: [], toss: [1], gone: [1] }), "toss");
  assert.equal(defaultBucketTab({ plenty: [], few: [], toss: [], gone: [1] }), "gone");
  assert.equal(bucketSummary({ plenty: [], few: [], toss: [], gone: [] }), "No room types match these filters at this number.");
  assert.equal(defaultBucketTab(filterBuckets(data, classifyCategories(data, numberToTime(data.anchors, "community", 29500), "community"), none)), "plenty");
  // markup: four tabs with badges, tag chips, the info line, picking caption spacing
  const mn2 = readFileSync(new URL("../src/components/SimulatorMyNumber.jsx", import.meta.url), "utf8");
  assert(/None at this number\./.test(mn2) && /sim-card2-likely/.test(mn2));
  for (const label of ["Plenty", "A few left", "Toss-up", "Gone"]) assert(mn2.includes(`title: "${label}"`), label);
  assert(/Rooms nobody took, especially singles, may be reserved or limited to certain groups\. This data can&apos;t confirm eligibility\./.test(mn2));
  const css = readFileSync(new URL("../src/react-overrides.css", import.meta.url), "utf8");
  assert(/\.sim-picking \.sim-note \{ margin: 12px 0 0; \}/.test(css) && /padding: \.6rem 1rem 12px/.test(css));
  assert(/\.sim-card2-likely \{ border-left: 3px solid/.test(css));
  assert(/\.sim-segtabs \{ display: grid; grid-template-columns: repeat\(4, 1fr\)/.test(css));
}

// ── Explore: "Add a line for every..." ──
{
  const grp = (field) => uniqueValues(data.categories, field).map((v) => makeSeries({ [field]: [v] }));
  const base = parseSeriesParam("size:Single,size:Double,kind:Apt", knownSeriesValues(data));
  assert.equal(base.length, 3);
  // building (17 values) on top of 3 lines fills the chart to the cap and says how many fit
  const b = addSeriesGroup(base, grp("building"));
  assert.equal(b.list.length, 8);
  assert.equal(b.added, 5);
  assert.equal(b.message, "Added 5; chart is limited to 8 lines.");
  assert.equal(b.list.filter((x) => x.clauses.building).length, 5);
  assert.equal(allSeriesPresent(b.list, grp("building")), false);
  // from an empty chart, size adds exactly its 4 lines, no message, and then reads "Already added"
  const sz = addSeriesGroup([], grp("size"));
  assert.deepEqual([sz.list.length, sz.added, sz.message], [4, 4, ""]);
  assert.equal(allSeriesPresent(sz.list, grp("size")), true);
  assert.equal(allSeriesPresent(base, grp("size")), false);
  // adding the same group again changes nothing
  const again = addSeriesGroup(sz.list, grp("size"));
  assert.equal(again.list.length, 4);
  assert.equal(again.added, 0);
  // a building named only with digits keeps its name (not "All rooms")
  assert.equal(makeSeries({ building: ["1019"] }).name, "1019");
  assert(b.list.every((x) => x.name !== "All rooms"), "no mislabeled series");
  assert.equal(b.list.filter((x) => x.clauses.building).map((x) => x.name).includes("1019"), true);
  // kind: 5 lines
  assert.equal(addSeriesGroup([], grp("kind")).list.length, 5);
  const src = readFileSync(new URL("../src/components/SimulatorOverTime.jsx", import.meta.url), "utf8");
  for (const t of ["Add a line for every...", "size (single, double, triple, quad)", "room type (apt, dorm, suite...)", ">Add all<", "Already added", "Adds a separate line for each option, e.g. one line per building."]) {
    assert(src.includes(t), `missing label: ${t}`);
  }
  assert(!/Group by|Add one per value/.test(src));
}

// ── Where a class ended up (spaces taken) ──
const tk = (keys) => takenTotal(data, keys);
const expectTaken = { internal_senior: 544, internal_junior: 239, internal_soph: 432, community_senior: 982, community_junior: 882, community_soph: 1580 };
for (const [k, v] of Object.entries(expectTaken)) assert.equal(tk([k]), v, `spacesTaken ${k}`);
const sen = windowKeysFor("senior", "both");
assert.equal(tk(sen), 544 + 982);
const toMap = (rows) => Object.fromEntries(rows.map((r) => [r.key, r.count]));
assert.deepEqual(toMap(takenBySize(data, sen)), { Single: 872, Double: 617, Triple: 37, Quad: 0 });
assert.deepEqual(toMap(takenByStyle(data, sen)), { Apt: 1025, Suite: 167, "Semi-Suite": 139, Dorm: 119, Studio: 76 });
const byB = takenByBuilding(data, sen);
assert.equal(byB.find((r) => r.key === "StuVi").count, 570);
assert(byB.some((r) => r.label === "South Campus (apartments, studios, brownstones)"));
assert.equal(byB.filter((r) => !r.subtotal).reduce((a, r) => a + r.count, 0), tk(sen));
assert.equal(crossTab(data, sen).total, tk(sen));
assert(Math.abs(preInternalSpaces(data) - 2300) < 100);
assert.equal(buildingLabel("BSR Brownstone"), "Bay State Rd brownstones");
assert.equal(valueAtTime([0, 10], meta, meta.gridStart + 0.5 * meta.stepMinutes * 60000), 5);
assert.equal(timeToPosition(meta, meta.gridStart - 1e9, len), 0);

// ── My number: nothing is hidden when rooms were open (Community, Soph, #29500) ──
{
  const t = numberToTime(data.anchors, "community", 29500);
  const o = openAtSlot(data, t);
  assert(Math.abs(o.rooms - 1056) <= 12, `headline rooms ${o.rooms}`);
  assert(Math.abs(o.spaces - 1988) <= 15, `headline spaces ${o.spaces}`);
  assert.deepEqual(o.top.map((r) => r.cat.name), ["West Double", "Warren Double", "The Towers Double", "HoJo Triple", "West Triple"]);
  const near = (r, v) => Math.abs(r.open - v) <= 8;
  assert(near(o.top[0], 422) && near(o.top[1], 192) && near(o.top[2], 130) && near(o.top[3], 73) && near(o.top[4], 56));
  // the late slot still has something easy to get: nothing reads as empty
  const cl = classifyCategories(data, t, "community");
  assert(cl.plenty.length > 0 && o.rooms > 0);
  // after-slot: the next 24 hours, bracketed by the snapshots around the slot (the drop is steep inside one interval)
  const af = afterSlot(data, t);
  assert(af.total >= 50 && af.total <= 110, `after total ${af.total}`);
  assert.deepEqual(af.rows.slice(0, 3).map((r) => r.cat.name), ["West Double", "The Towers Double", "HoJo Triple"]);
  assert(af.rows.length <= 10);
  assert(af.rows[0].taken >= 25 && af.rows[0].taken <= 55);
  // clamped at the end of the data: a slot at the last snapshot has nothing after it
  const endT = indexToTime(meta, last);
  assert.equal(afterSlot(data, endT).total, 0);
  const lateT = endT - 6 * 3600000;
  const afLate = afterSlot(data, lateT);
  assert(afLate.until === endT && afLate.total >= 0);
  // every slot in range has either picked or still-open content to show (never an empty view)
  for (const phase of ["internal", "community"]) {
    const tOf = makeNumberToTime(data.anchors, phase);
    for (let n = 1000; n <= 29999; n += 1999) {
      const tt = tOf(n);
      const c = classifyCategories(data, tt, phase);
      const shown = c.plenty.length + c.few.length + c.toss.length + c.gone.length;
      assert(shown === data.categories.length && openAtSlot(data, tt).rooms > 0, `${phase} #${n}`);
    }
  }
}
// ── My number: slot line, picking panel ──
{
  const t45 = numberToTime(data.anchors, "community", 4500);
  assert.notEqual(t45, meta.communityOpensAt);
  assert.match(formatSlot(t45), /^Thu 3\/26 5:\d\d PM ET$/);
  assert.doesNotMatch(formatSlot(t45), /3:35 PM/);
  assert.equal(formatSlot(numberToTime(data.anchors, "internal", 1000)), "Mon 3/23 3:35 PM ET"); // a number that does map there
  assert.equal(formatEndDay(meta), "Apr 2");
  // picking panel: around the slot and the whole window, both non-empty with nonzero numbers, and they differ
  for (const [phase, cls, n] of [["community", "senior", 4500], ["community", "soph", 29500], ["internal", "senior", 4500]]) {
    const t = numberToTime(data.anchors, phase, n);
    const around = pickingAround(data, t, phase);
    const whole = pickingWindow(data, `${phase}_${cls}`);
    assert(around.rows.length >= 1 && around.rows[0].taken > 0, `${phase} ${n} around`);
    assert(whole.rows.length >= 1 && whole.rows[0].taken > 0 && whole.rows.length <= 10);
    assert(around.rows.length <= 10);
    assert(around.rows.every((r, i) => i === 0 || around.rows[i - 1].taken >= r.taken));
    assert.notEqual(around.rows[0].taken, whole.rows[0].taken, "toggle changes the numbers");
    assert.notEqual(around.total, whole.total);
  }
  assert.equal(pickingWindow(data, "community_senior").total, 982);
  // clamped to the phase range: a slot at the very start of Community looks back no further than the phase start
  const start = pickingAround(data, meta.communityOpensAt, "community");
  assert(start.from >= meta.communityOpensAt);
  // never blank: every slot has rows or the "very little" message path (total < 20)
  for (const phase of ["internal", "community"]) {
    const tOf = makeNumberToTime(data.anchors, phase);
    for (let n = 1000; n <= 29999; n += 999) {
      const a = pickingAround(data, tOf(n), phase);
      assert(a.rows.length > 0 || a.total < 20, `${phase} #${n} picking panel would be blank`);
    }
  }
}
const myNumSrc = readFileSync(new URL("../src/components/SimulatorMyNumber.jsx", import.meta.url), "utf8");
const pageSrc = readFileSync(new URL("../src/pages/SimulatorPage.jsx", import.meta.url), "utf8");
assert(/sim-card2-x/.test(myNumSrc) && /sim-tag/.test(myNumSrc) && /cardInfo/.test(myNumSrc));
assert(!/sim-card2-why|info\.sub|info\.tag\b/.test(myNumSrc), "old card lines are gone");
assert(!/StillOpen|Still open at your slot|usually not taken/.test(myNumSrc), "the standalone section is gone");
assert(/Over the next 24 hours/.test(myNumSrc) && /<details/.test(myNumSrc));
assert(/Very little was taken around this slot\./.test(myNumSrc));
assert(/Some rooms may have eligibility limits not visible in this data\./.test(myNumSrc));
for (const [name, src] of [["MyNumber", myNumSrc], ["Page", pageSrc]]) {
  assert(!/When Community opens|Back to my number|first opened around/.test(src), `${name} still has the phase-start / Community-snapshot text`);
}
// no leftover "never taken all season" wording or "check BU's rules" anywhere in the simulator's files
{
  const { execSync } = await import("node:child_process");
  const hits = execSync("grep -rniE 'never taken all season|check BU' src/components/Simulator*.jsx src/pages/SimulatorPage.jsx src/lib/simulator.js || true", { cwd: new URL("..", import.meta.url).pathname }).toString();
  assert.equal(hits.trim(), "", `leftover wording: ${hits}`);
}
{
  const { execSync } = await import("node:child_process");
  const old = execSync("grep -rniE 'usually not taken|Still open at your slot' src/ || true", { cwd: new URL("..", import.meta.url).pathname }).toString();
  assert.equal(old.trim(), "", `leftover wording: ${old}`);
  const hits = execSync("grep -rni 'contested' src/ || true", { cwd: new URL("..", import.meta.url).pathname }).toString();
  assert.equal(hits.trim(), "", `leftover wording: ${hits}`);
  const my = readFileSync(new URL("../src/components/SimulatorMyNumber.jsx", import.meta.url), "utf8");
  const bad = execSync("grep -rniE 'got picked last year|all season' src/ || true", { cwd: new URL("..", import.meta.url).pathname }).toString();
  assert.equal(bad.trim(), "", `removed wording is back: ${bad}`);
  assert(/Gone/.test(my) && /A few left/.test(my));
}
// ── Simulator page chrome: own banner, no swap hero, quiet link to Browse ──
{
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const pg = readFileSync(new URL("../src/pages/SimulatorPage.jsx", import.meta.url), "utf8");
  assert(/const isSimulator = location\.pathname === "\/simulator"/.test(app));
  assert(/\{!isHome && !isSimulator && \(\s*<div className="hero">/.test(app), "hero is hidden on /simulator only (still on every other non-home route)");
  assert(!/\{isHome && \(\s*<div className="hero">/.test(app) && /!isHome/.test(app));
  assert(/BU HOUSING/.test(pg) && /<h1 className="sim-banner-title">Selection Simulator<\/h1>/.test(pg));
  assert(/See how long each kind of room lasted last year, and what was still open when your housing number came up\./.test(pg));
  assert(!/<h2[^>]*>\s*Housing Selection Simulator/.test(pg) && !/form-title/.test(pg), "old duplicate title is gone");
  assert(!/Submit a Listing|Browse Listings|BU students only|hero-pill|hero-cta/.test(pg), "no swap CTAs or login pill in the simulator");
  assert(/Looking to swap rooms\? <Link to="\/browse">Browse listings<\/Link>/.test(pg));
  assert(/path="\/browse"/.test(app));
  assert(!/ProtectedRoute|requireAuth|currentUser/.test(pg), "the simulator has no login gating");
  assert(pg.indexOf("sim-banner") < pg.indexOf("sim-disclaimer"), "disclaimer sits right under the banner");
}
// copy: no view says "Nothing here"
for (const f of ["../src/components/SimulatorMyNumber.jsx", "../src/components/SimulatorPlan.jsx", "../src/pages/SimulatorPage.jsx"]) {
  const src = readFileSync(new URL(f, import.meta.url), "utf8");
  assert(!/Nothing here/.test(src), `${f} says "Nothing here"`);
}
assert(/None at this number\./.test(readFileSync(new URL("../src/components/SimulatorMyNumber.jsx", import.meta.url), "utf8")));
assert(/Late numbers mostly end up/.test(readFileSync(new URL("../src/components/SimulatorPlan.jsx", import.meta.url), "utf8")));

console.log("All simulator checks passed");
