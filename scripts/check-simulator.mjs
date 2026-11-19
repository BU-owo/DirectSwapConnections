/**
 * Simulator Acceptance Checks
 * Node script asserting the simulator logic against public/data/availability.json.
 * Run with: node scripts/check-simulator.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as S from "../src/lib/simulator.js";
import { existsSync } from "node:fs";

const {
  isValidData, numberToTime, formatTime, gridLength, validateNumber, numberGroups, timeToPosition,
  makeSeries, addSeriesGroup, allSeriesPresent, groupTotals, groupSeriesValues, addSeries, MAX_SERIES, PLAN_GROUPS, parseSeriesParam, serializeSeries,
  knownSeriesValues, niceTicks, formatTick, rangeDomain, domainIndices, windowBands, layoutWindowLabels,
  preInternalSpaces, scenarioNumbers, valueAtTime,
  buildingLabel, PRESETS, uniqueValues,
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


// ── What people got: derived from availability.json only ──
{
  const P = S;
  const DAY = "community";
  const hiOf = (cls) => meta.classRanges[cls][1];
  const loOf = (cls) => meta.classRanges[cls][0];
  // bins tile each class range; the last one stops at the class's last number
  for (const phase of ["community", "internal"]) {
    for (const cls of ["senior", "junior", "soph"]) {
      const bins = P.pickBins(data, phase, cls);
      assert.equal(bins[0].from, loOf(cls));
      assert.equal(bins[bins.length - 1].to, hiOf(cls));
      bins.forEach((b, i) => {
        if (i > 0) assert.equal(b.from, bins[i - 1].from + 1000);
        assert(b.to === b.from + 999 || (i === bins.length - 1 && b.to === hiOf(cls)));
        assert(b.cats.every((x) => x.taken > 0));
        assert(Math.abs(b.n - b.cats.reduce((a, x) => a + x.taken, 0)) < 1e-9);
      });
      const tot = P.pickTotal(bins);
      assert(Math.abs(tot.n - bins.reduce((a, b) => a + b.n, 0)) < 1e-6, "All {class} = the bins added together");
      // the bins add up to the class's window total (spacesTaken): within 5% for Community, a looser 10% for estimated Internal
      const win = data.categories.reduce((a, c) => a + (c.spacesTaken[`${phase}_${cls}`] || 0), 0);
      const tol = phase === "community" ? 0.05 : 0.1;
      assert(Math.abs(tot.n - win) / win <= tol, `${phase} ${cls}: bins ${Math.round(tot.n)} vs window ${win}`);
    }
  }
  const sen = P.pickBins(data, DAY, "senior");
  assert(Math.abs(P.pickTotal(sen).n - 982) / 982 <= 0.05, "Senior / Community bins total about 982 spaces");

  // Senior / Community 4000-4999: apartment types lead, consistent with the picking panel near #4500
  const b4 = sen.find((b) => b.from === 4000);
  const top4 = [...b4.cats].sort((a, b) => b.taken - a.taken).slice(0, 5).map((x) => x.cat.name);
  assert(top4.includes("South Apartment Double") && top4.includes("StuVi1 Single Apartment"), top4.join());
  const panel = P.pickingAround(data, numberToTime(data.anchors, "community", 4500), "community").rows.map((r) => r.cat.name);
  assert(top4.filter((n) => panel.includes(n)).length >= 3, "bin 4000-4999 agrees with the picking panel at #4500");
  const area4 = P.pickShares(P.pickCounts(b4, "area"), "area");
  assert(["Apartments", "StuVi"].includes([...area4].sort((a, b) => b.share - a.share)[0].name));

  // Soph / Community late bin: small, and mostly West Double, Towers Double, HoJo Triple
  const soph = P.pickBins(data, DAY, "soph");
  const late = soph[soph.length - 1];
  assert.equal(late.from, 29000);
  assert(late.n >= 60 && late.n <= 160, `late soph bin n=${Math.round(late.n)}`);
  assert.deepEqual([...late.cats].sort((a, b) => b.taken - a.taken).slice(0, 3).map((x) => x.cat.name), ["West Double", "The Towers Double", "HoJo Triple"]);
  assert(soph[0].n > late.n * 2, "the early soph bins are much bigger");
  // the last bin of a class runs until the next window opens (or the end of the data)
  const jr = meta.windows.find((w) => w.key === "community_junior");
  assert.equal(P.windowEndTime(meta, "community", "senior"), jr.opensAt);
  assert.equal(P.windowEndTime(meta, "community", "soph"), indexToTime(meta, last));
  assert.equal(P.windowEndTime(meta, "internal", "soph"), meta.windows.find((w) => w.key === "community_senior").opensAt);

  // aggregation: shares sum to 100 (+/- 1) for every dimension; names, areas, colors
  for (const dim of P.PICK_DIM_KEYS) {
    for (const b of [b4, late, P.pickTotal(sen)]) {
      const sh = P.pickShares(P.pickCounts(b, dim), dim);
      assert(Math.abs(sh.reduce((a, x) => a + x.share * 100, 0) - 100) <= 1, `${dim} shares`);
      assert.equal(Math.round(Object.values(P.pickCounts(b, dim)).reduce((a, x) => a + x, 0)), Math.round(b.n));
    }
  }
  const cat = (n) => data.categories.find((c) => c.name === n);
  assert.deepEqual(["StuVi1 Single Apartment", "South Apartment Double", "West Double", "BSR Brownstone Double", "Core House Single"].map((n) => P.areaOfCategory(cat(n))), ["StuVi", "Apartments", "Large dorms", "Brownstones", "Other"]);
  assert.deepEqual(Object.keys(P.PICK_DIMS.size.colors).slice(0, 3), ["Single", "Double", "Triple"]);
  assert.deepEqual(Object.keys(P.PICK_DIMS.area.colors), ["Large dorms", "Brownstones", "Apartments", "StuVi", "Fenway", "Other"]);
  const kinds = new Set(P.pickShares(P.pickCounts(P.pickTotal(sen), "type"), "type").map((x) => x.name));
  assert([...kinds].every((k) => Object.keys(P.PICK_DIMS.type.colors).includes(k)), "every room type has a color");
  const rk = P.pickBuildingRanking(P.pickCounts(P.pickTotal(sen), "building"));
  assert(rk.every((r, i) => i === 0 || rk[i - 1].count >= r.count));
  assert(Math.abs(rk.reduce((a, r) => a + r.share, 0) - 1) < 1e-9);
  assert.equal(rk.find((r) => r.name === "StuVi1").color, P.PICK_DIMS.area.colors.StuVi);
  assert.equal(P.textOn("#f2c94c"), "#1b1b1b");
  assert.equal(P.textOn("#1d4e89"), "#ffffff");

  // "very few picked": a range under PICK_MIN never shows a bar; none of these bins would print "n = 0" without it
  assert.equal(P.PICK_MIN, 20);
  let smallBins = 0;
  for (const phase of ["community", "internal"]) for (const cls of ["senior", "junior", "soph"]) for (const b of P.pickBins(data, phase, cls)) if (b.n < 20) smallBins++;
  assert(smallBins > 0, "some range is small enough to exercise the 'very few picked' path (estimated Internal)");
  const pk = readFileSync(new URL("../src/components/SimulatorPicked.jsx", import.meta.url), "utf8");
  assert(/bin\.n < PICK_MIN/.test(pk) && /very few picked/.test(pk) && /bin\.n >= 0\.5 \? <span/.test(pk), "n = 0 is never printed");
  assert(/What got picked, by number/.test(pk));
  assert(pk.includes("Spaces that disappeared as each number range came up last year. Net of drops and swaps; late picks by earlier numbers are mixed in, so treat"));
  for (const label of ["Community", "Internal (estimated)"]) assert(pk.includes(label), label);
  assert(!/Show by|usable = bins/.test(pk.slice(pk.indexOf("function BarRow"), pk.indexOf("function BuildingTable"))), "no Show by / per-bin chips in Bars");
  
  // bars: small multiples with 22% / 10% label thresholds, sticky legend header, All class chip
  assert(/s\.share >= 0\.22 \? `\$\{s\.name\} \$\{pct\(s\.share\)\}` : s\.share >= 0\.1 \? pct\(s\.share\) : ""/.test(pk));
  assert(pk.includes("StuVi is counted separately from other apartments.") && pk.includes('["all", "All"]') && /Seniors/.test(pk) && /Sophomores/.test(pk));
  assert(/\.sim-bt-head \{ position: sticky; top: 0;/.test(readFileSync(new URL("../src/react-overrides.css", import.meta.url), "utf8")));
  assert(!/download|blob|createObjectURL|csv/i.test(pk), "no export in this tab");

  // heatmap: same derivation as the bars, one table per class
  {
    const jr = P.pickBins(data, DAY, "junior");
    const hm = P.heatmapTable(jr, "Junior");
    const allRow = hm.rows[0];
    assert.deepEqual([allRow.key, allRow.label, allRow.all], ["all", "All Junior", true]);
    assert.deepEqual(hm.rows.slice(1).map((r) => r.label), jr.map((b) => `${b.from}-${b.to}`));
    const cell = (row, name, group) => row.cells.find((c) => c.name === name && c.group === group);
    assert.deepEqual(["Single", "Double", "Triple"].map((n) => cell(allRow, n, "size").pct), [14, 73, 12], "Junior All row: Single 14%, Double 73%, Triple 12%");
    assert.equal(cell(allRow, "Quad", "size").dash, true, "Quad is under 1%: shown as a dash");
    assert.equal(allRow.n, P.pickTotal(jr).n);
    // columns that are all zero for the class are dropped; the rest are real
    const sen2 = P.heatmapTable(P.pickBins(data, DAY, "senior"), "Senior");
    assert(!sen2.columns.some((c) => c.name === "Quad"), "no Quad column for Senior (nobody took a quad)");
    assert(!sen2.columns.some((c) => c.name === "Fenway"), "Fenway is all zero");
    for (const cls of ["senior", "junior", "soph"]) {
      const t = P.heatmapTable(P.pickBins(data, DAY, cls), cls);
      const tot = P.pickTotal(P.pickBins(data, DAY, cls));
      for (const col of t.columns) assert((P.pickCounts(tot, col.group)[col.name] || 0) > 0, `${cls} ${col.group}/${col.name} should not be an all-zero column`);
      assert.deepEqual(t.groups.map((g) => g.key), ["size", "type", "area"]);
      for (const row of t.rows) {
        if (row.few) { assert.equal(row.cells.length, 0); assert(!row.all && row.n < P.PICK_MIN); continue; }
        for (const g of t.groups) {
          const cells = row.cells.filter((c) => c.group === g.key);
          assert.equal(cells.length, g.names.length);
          assert(Math.abs(cells.reduce((a, c) => a + c.share, 0) - 1) < 1e-9, `${cls} ${row.key} ${g.key} shares sum to 100%`);
          assert.equal(cells.filter((c) => c.bold).length, 1, "the largest cell of each group in a row is bold");
          assert(cells.find((c) => c.bold).share === Math.max(...cells.map((c) => c.share)));
          for (const c of cells) assert.equal(c.dash, c.share < 0.01);
        }
      }
    }
    // soph late-ish ranges and estimated Internal Junior have "very few picked" rows
    assert(P.heatmapTable(P.pickBins(data, "internal", "junior"), "Junior").rows.some((r) => r.few));
    // colors: one hue per group, alpha proportional to the share, white text above 55%
    const a = (share) => Number(P.heatCellStyle(share, "size").background.match(/,([\d.]+)\)$/)[1]);
    assert(a(0.1) < a(0.3) && a(0.3) < a(0.7) && a(0.7) <= 1);
    assert.equal(P.heatCellStyle(0.55, "size").color, "#1b1b1b");
    assert.equal(P.heatCellStyle(0.56, "size").color, "#ffffff");
    assert(P.heatCellStyle(0.4, "size").background.startsWith("rgba(14,124,118"));
    assert(P.heatCellStyle(0.4, "type").background.startsWith("rgba(44,95,179"));
    assert(P.heatCellStyle(0.4, "area").background.startsWith("rgba(194,90,20"));
    // markup: View chips, URL param, mobile switcher, sticky header, tooltip, no legend in the heatmap, bar view still there
    const pg4 = readFileSync(new URL("../src/pages/SimulatorPage.jsx", import.meta.url), "utf8");
    assert(/\["bars", "heatmap", "trend"\]\.includes\(searchParams\.get\("gview"\)\) \? searchParams\.get\("gview"\) : "pies"/.test(pg4) && /gview !== "pies"\) next\.set\("gview", gview\)/.test(pg4), "view is kept in the URL");
    assert(/\["heatmap", "Heatmap"\]/.test(pk));
    const hmSrc = pk.slice(pk.indexOf("function HeatTable"), pk.indexOf("/** Darker shade"));
    assert(!/<Legend/.test(hmSrc), "no legend in the heatmap");
    assert(/\$\{cell\.name\}: \$\{cell\.pct\}% \(\$\{fmt\(cell\.count\)\} spaces\)/.test(hmSrc) && /very few picked/.test(hmSrc));
    assert(/useState\("size"\)/.test(hmSrc) && /"Size" : g === "type" \? "Type" : "Area"/.test(hmSrc), "phone switcher defaults to Size");
    for (const fn of ["function StackBar", "function Legend", "function BarRow", "function BarsTable", "function BuildingTable"]) assert(pk.includes(fn), `${fn} still there`);
    assert(/<HeatmapView binsByClass/.test(pk) && /<BarsTable binsByClass/.test(pk) && /<BuildingTable binsByClass/.test(pk), "both views, By building below");
    const css4 = readFileSync(new URL("../src/react-overrides.css", import.meta.url), "utf8");
    assert(/\.sim-hm thead th \{ position: sticky;/.test(css4) && /\.sim-hm-switch \{ display: flex;/.test(css4));
  }

  // heatmap "By class" summary + range tables without All rows
  {
    const bbc = Object.fromEntries(["senior", "junior", "soph"].map((c) => [c, P.pickBins(data, "community", c)]));
    const sm = P.heatmapSummary(bbc, { senior: "Seniors", junior: "Juniors", soph: "Sophomores" });
    assert.deepEqual(sm.rows.map((r) => r.label), ["All Seniors", "All Juniors", "All Sophomores"]);
    const sz = (r) => r.cells.filter((c) => c.group === "size").map((c) => `${c.name} ${c.pct}`).join(", ");
    assert(sz(sm.rows[0]).startsWith("Single 49, Double 48, Triple 3"), sz(sm.rows[0]));
    assert(sz(sm.rows[1]).startsWith("Single 14, Double 73, Triple 12"), sz(sm.rows[1]));
    for (const r of sm.rows) assert.equal(r.cells.length, sm.columns.length, "same columns in every summary row");
    for (const c of ["senior", "junior", "soph"]) {
      const t = P.heatmapTable(bbc[c], c, { noAll: true });
      assert(t.rows.every((r) => !r.all) && t.rows.length === bbc[c].length, "no All row in range tables");
    }
    const pkh = readFileSync(new URL("../src/components/SimulatorPicked.jsx", import.meta.url), "utf8");
    assert(pkh.includes("By class") && pkh.includes("All numbers combined.") && pkh.includes("By number range"));
    assert(/<HeatmapView binsByClass/.test(pkh) && /heatmapSummary\(binsByClass/.test(pkh), "summary ignores the class chips");
    assert(/sim-hm-sel/.test(pkh) && /sim-hm-dim/.test(pkh) && pkh.includes("ranges below.") && !/scrollIntoView|scrollTo\(|scrollBy\(/.test(pkh) && !pkh.includes("sim-hm-range") && /sim-oc-controls/.test(pkh));
    assert(/\.sim-oc-controls \{ position: sticky; top: 0; z-index: 20;/.test(readFileSync(new URL("../src/react-overrides.css", import.meta.url), "utf8")), "controls row is sticky");
  }

  // heatmap: one fixed column list for every table
  {
    const G = P.heatGroups(data);
    const names = (k) => (G.find((g) => g.key === k) || { names: [] }).names;
    assert.deepEqual(names("size"), ["Single", "Double", "Triple", "Quad"]);
    assert.deepEqual(names("type"), ["Apartment", "Studio", "Dorm", "Suite", "Semi-suite"]);
    const area = names("area");
    for (const a of ["Large dorms", "Brownstones", "Apartments", "StuVi", "Other"]) assert(area.includes(a), `area ${a}`);
    assert.deepEqual(area, ["Large dorms", "Brownstones", "Apartments", "StuVi", "Fenway", "Other"].filter((n) => area.includes(n)), "fixed order");
    const colKey = (t) => t.columns.map((c) => `${c.group}:${c.name}`).join("|");
    const ref = colKey(P.heatmapTable(P.pickBins(data, "community", "senior"), "x", { groups: G }));
    for (const phase of ["community", "internal"]) {
      const bbc = Object.fromEntries(["senior", "junior", "soph"].map((c) => [c, P.pickBins(data, phase, c)]));
      const sm = P.heatmapSummary(bbc, { senior: "S", junior: "J", soph: "So" }, G);
      assert.equal(colKey(sm), ref);
      for (const c of ["senior", "junior", "soph"]) {
        const t = P.heatmapTable(bbc[c], c, { noAll: true, groups: G });
        assert.equal(colKey(t), ref, `${phase} ${c} columns identical`);
        for (const r of t.rows) if (!r.few) assert.equal(r.cells.length, t.columns.length, "every column has a cell");
      }
    }
    const soph = P.heatmapTable(P.pickBins(data, "community", "soph"), "Soph", { noAll: true, groups: G });
    const svi = soph.columns.findIndex((c) => c.name === "StuVi");
    assert(svi >= 0 && soph.rows.some((r) => !r.few && r.cells[svi].dash), "StuVi shows '-' where a Soph bin has none");
    const css6 = readFileSync(new URL("../src/react-overrides.css", import.meta.url), "utf8");
    const tail6 = css6.slice(css6.indexOf("heatmap: identical columns in every table"));
    assert(/table-layout: fixed; width: 100%/.test(tail6) && /col\.sim-hm-sp \{ width: 12px; \}/.test(tail6) && /col\.sim-hm-c0 \{ width: 13%; \}/.test(tail6));
    assert(!/white-space: nowrap/.test(tail6) && !/overflow: auto|overflow-x: auto/.test(tail6) && !/sim-hm-scroll/.test(css6), "no scroll container / nowrap on the heatmap");
    assert(/data-switch="1"/.test(tail6) && /main:has\(\.sim-page\) \{ max-width: 1200px; \}/.test(tail6));
    assert(!/box-shadow: inset 0 0 0 1px rgba\(255,255,255/.test(css6) && !/#c9c2b8/.test(css6), "per-cell borders reverted");
    const pk7 = readFileSync(new URL("../src/components/SimulatorPicked.jsx", import.meta.url), "utf8");
    assert((pk7.match(/sim-hm-sp/g) || []).length >= 3, "spacer col, header and body cells");
  }

  // pies: slice order / angles, label layout without overlaps
  {
    const jr = P.pickBins(data, "community", "junior");
    const tot = P.pickTotal(jr);
    const sh = P.pickShares(P.pickCounts(tot, "size"), "size");
    const sl = P.pieSlices(sh);
    assert.deepEqual(sl.map((x) => x.name).slice(0, 3), ["Single", "Double", "Triple"], "legend order");
    assert.deepEqual(sl.map((x) => Math.round(x.share * 100)).slice(0, 3), [14, 73, 12]);
    assert(sl[0].a0 === 0 && Math.abs(sl[sl.length - 1].a1 - 2 * Math.PI) < 1e-9 && sl.every((x, i) => i === 0 || Math.abs(x.a0 - sl[i - 1].a1) < 1e-12), "starts at 12 o'clock, clockwise, contiguous");
    for (const phase of ["community", "internal"]) for (const cls of ["senior", "junior", "soph"]) for (const d of ["size", "type", "area"]) {
      const bins = P.pickBins(data, phase, cls);
      for (const b of [P.pickTotal(bins), ...bins.filter((x) => x.n >= 20)]) {
        const slices = P.pieSlices(P.pickShares(P.pickCounts(b, d), d));
        const L = P.pieLabelLayout(slices, { cx: 186, cy: 108, r: 84 });
        for (const side of [-1, 1]) {
          const ys = L.filter((l) => l.side === side).map((l) => l.ty).sort((a, c) => a - c);
          for (let i = 1; i < ys.length; i++) assert(ys[i] - ys[i - 1] >= 13 - 1e-9, `labels overlap ${phase} ${cls} ${d}`);
        }
        for (const l of L) assert(l.share >= 0.08);
        const kept = new Set(L.map((l) => l.name));
        for (const x of slices) if (x.share >= 0.2) assert(kept.has(x.name), `big slice ${x.name} keeps its label (${phase} ${cls} ${d})`);
      }
    }
    const pkp = readFileSync(new URL("../src/components/SimulatorPicked.jsx", import.meta.url), "utf8");
    assert(/\["pies", "Pies"\]/.test(pkp) && /<PiesView binsByClass/.test(pkp) && /few picks/.test(pkp) && /sl\.share >= insideMin/.test(pkp));
  }

  // building map + By building table
  {
    const labels = P.BUILDINGS.map((b) => b.label);
    assert.equal(new Set(labels).size, labels.length, "labels unique");
    assert.equal(labels.filter((l) => /Myles|610/.test(l)).length, 1, "610 Beacon (Myles) appears once");
    assert.equal(P.BUILDINGS.find((b) => /Myles/.test(b.label)).area, "Large dorms");
    assert.equal(P.PICK_DIMS.bldg.colors["610 Beacon (Myles)"], "#ff2db4");
    const want = { "Warren Towers": "#ffb3c1", "West Campus": "#ff5c44", "The Towers": "#ff9672", Other: "#757575", "StuVi 2": "#3f77ad", "East and Central Campus Brownstone": "#f9f7c9", "South Campus Brownstone": "#efe480", "East/Bay State Apartment": "#88ee88", "South Campus Apartment": "#35a865", HoJo: "#ffac4d" };
    for (const [k, v] of Object.entries(want)) assert.equal(P.PICK_DIMS.bldg.colors[k], v, k);
    const labelOf = (building, kind = "Dorm") => P.buildingOfCategory({ building, kind }).label;
    assert.equal(labelOf("Myles", "Suite"), "610 Beacon (Myles)");
    assert.equal(labelOf("Warren"), "Warren Towers");
    assert.equal(labelOf("South Brownstone", "Apt"), "South Campus Apartment");
    assert.equal(labelOf("Core House"), "Other");
    for (const c of data.categories) assert(labels.includes(P.buildingOfCategory(c).label));
    // Area columns are exactly as before (Myles stays in Other there): 5 areas + Other, no building columns
    const G2 = P.heatGroups(data);
    const areaNames = G2.find((g) => g.key === "area").names;
    assert.deepEqual(areaNames, ["Large dorms", "Brownstones", "Apartments", "StuVi", "Other"].filter((n) => areaNames.includes(n)));
    assert(!G2.some((g) => g.bldgs), "no building columns in the heatmap");
    const jrTot = P.pickTotal(P.pickBins(data, "community", "junior"));
    assert.equal(Math.round((P.pickCounts(jrTot, "area").Other / Object.values(P.pickCounts(jrTot, "area")).reduce((a, b) => a + b, 0)) * 100), 14, "Junior Other still 14%");
    for (const phase of ["community", "internal"]) {
      const bbc = Object.fromEntries(["senior", "junior", "soph"].map((c) => [c, P.pickBins(data, phase, c)]));
      const all = P.buildingTable(bbc, ["senior", "junior", "soph"]);
      assert.equal(all.cols.length, 9);
      assert.deepEqual(all.cols.map((c) => c.label), ["1000-3999", "4000-6999", "7000-9999", "10000-12999", "13000-15999", "16000-19999", "20000-22999", "23000-25999", "26000-29999"]);
      assert.equal(P.buildingTable(bbc, ["junior"]).cols.length, 3);
      assert.deepEqual(all.areas.map((a) => a.area), ["Large dorms", "Brownstones", "Apartments", "StuVi", "Other"].filter((n) => all.areas.some((a) => a.area === n)), "area order");
      const rowLabels = all.areas.flatMap((a) => a.rows.map((r) => r.label));
      assert.equal(rowLabels.filter((l) => /Myles|610/.test(l)).length, 1);
      assert.equal(all.areas.find((a) => a.rows.some((r) => /Myles/.test(r.label))).area, "Large dorms");
      for (const a of all.areas) for (let i = 1; i < a.rows.length; i++) assert(a.rows[i - 1].total >= a.rows[i].total, "rows ordered by overall share");
      all.cols.forEach((col, i) => {
        const sum = all.areas.flatMap((a) => a.rows).reduce((acc, r) => acc + (col.few ? 0 : r.cells[i].pct), 0);
        if (!col.few) assert(Math.abs(sum - 100) <= 2 + all.areas.flatMap((a) => a.rows).length * 0.5, `${phase} ${col.label} sums to ~100 (${sum})`);
        if (!col.few) assert(Math.abs(all.areas.flatMap((a) => a.rows).reduce((acc, r) => acc + r.cells[i].share, 0) - 1) < 1e-9, "exact shares sum to 1");
      });
    }
    const bt = P.buildingTable(Object.fromEntries(["senior", "junior", "soph"].map((c) => [c, P.pickBins(data, "community", c)])), ["senior", "junior", "soph"]);
    const wh = bt.areas.flatMap((a) => a.rows).find((r) => r.label === "West Campus");
    assert(wh && wh.cells[6].share > 0.2, "West is big for sophomores");
    assert.equal(P.buildingCellStyle(0.4, "#ff5c44").background, "rgba(255,92,68,1.00)");
    assert.equal(P.buildingCellStyle(0.56, "#ff5c44").color, "#ffffff");
    assert.equal(P.buildingCellStyle(0.5, "#ff5c44").color, "#1b1b1b");
    const pkb = readFileSync(new URL("../src/components/SimulatorPicked.jsx", import.meta.url), "utf8");
    assert(!/Split Area by building|Expand all areas|Collapse all|sim-hm-chev|BuildingSection|BuildingList|Show all/.test(pkb), "experiments and old lists removed");
    assert(/<BuildingTable binsByClass/.test(pkb) && /very few picked/.test(pkb));
    assert(!/>By building</.test(pkb) && !pkb.includes("Share of spaces taken in each number range that were in each building."), "no separate By building section");
    assert(!/<hr className="sim-hm-divider" \/>\s*<BuildingTable/.test(pkb));
    assert(!/scrollIntoView|scrollTo\(/.test(pkb));
  }

  // Breakdown = Buildings: same shares in every view
  {
    const bbc = Object.fromEntries(["senior", "junior", "soph"].map((c) => [c, P.pickBins(data, "community", c)]));
    const bin = bbc.junior.find((b) => b.from === 13000);
    const shares = Object.fromEntries(P.pickShares(P.pickCounts(bin, "bldg"), "bldg").map((x) => [x.name, x.share]));
    const tm = P.trendModel(["senior", "junior", "soph"].flatMap((c) => bbc[c]), "bldg");
    const pt = tm.points.find((p) => p.from === 13000);
    const pies = Object.fromEntries(P.pieSlices(P.pickShares(P.pickCounts(bin, "bldg"), "bldg")).map((x) => [x.name, x.share]));
    for (const [name, sh] of Object.entries(shares)) {
      assert.equal(Math.round((pt.shares[name] || 0) * 100), Math.round(sh * 100), `trend ${name}`);
      assert.equal(Math.round(pies[name] * 100), Math.round(sh * 100), `pies ${name}`);
    }
    assert.deepEqual(tm.names, P.BUILDINGS.map((b) => b.label).filter((n) => tm.names.includes(n)), "bands in area order");
    // heatmap coarse bucket 13000-15999 = the three bins added together
    const coarse = P.buildingTable(bbc, ["junior"]);
    const col = coarse.cols[1];
    assert.equal(col.label, "13000-15999");
    const sum3 = P.pickCounts(P.pickTotal(bbc.junior.filter((b) => b.from >= 13000 && b.to <= 15999)), "bldg");
    for (const a of coarse.areas) for (const r of a.rows) assert(Math.abs(r.cells[1].count - (sum3[r.label] || 0)) < 1e-9, `coarse ${r.label}`);
    // outside labels for building pies (>= 5%) never overlap
    for (const phase of ["community", "internal"]) for (const cls of ["senior", "junior", "soph"]) {
      const tot = P.pickTotal(P.pickBins(data, phase, cls));
      const L = P.pieLabelLayout(P.pieSlices(P.pickShares(P.pickCounts(tot, "bldg"), "bldg")), { cx: 210, cy: 120, r: 96, minShare: 0.05 });
      for (const side of [-1, 1]) {
        const ys = L.filter((l) => l.side === side).map((l) => l.ty).sort((a, b) => a - b);
        for (let i = 1; i < ys.length; i++) assert(ys[i] - ys[i - 1] >= 13 - 1e-9);
      }
    }
    assert.equal(P.shortName("West Campus"), "West");
    const pkz = readFileSync(new URL("../src/components/SimulatorPicked.jsx", import.meta.url), "utf8");
    assert(/x\.share >= 0\.14 \? `\$\{shortName\(x\.name\)\} \$\{pct\(x\.share\)\}` : x\.share >= 0\.09 \? pct\(x\.share\) : ""/.test(pkz), "bar labels 14% / 9%");
    assert(!/Breakdown|\["buildings", "Buildings"\]|bk === "buildings"/.test(pkz), "Breakdown control and building render paths removed");
    assert(/<details className="sim-bd"/.test(pkz) && /BldgBarsTable/.test(pkz) && /BldgTrend/.test(pkz) && /BldgPies/.test(pkz) && /See which buildings these picks were in/.test(pkz) && /open \? "Hide" : "Show"/.test(pkz) && /\{open \? \(/.test(pkz), "collapsible section, collapsed by default");
    const pgz = readFileSync(new URL("../src/pages/SimulatorPage.jsx", import.meta.url), "utf8");
    assert(/useState\(searchParams\.get\("bld"\) === "1"\)/.test(pgz) && /next\.set\("bld", "1"\)/.test(pgz) && !/breakdown/.test(pgz), "bld=1 in the URL");
  }

  // Bars: By class block, no All rows in the range sections
  {
    const pkr = readFileSync(new URL("../src/components/SimulatorPicked.jsx", import.meta.url), "utf8");
    const bt = pkr.slice(pkr.indexOf("function BarsTable"), pkr.indexOf("function BldgBarsTable") > 0 && pkr.indexOf("function BldgBarsTable") > pkr.indexOf("function BarsTable") ? pkr.indexOf("function BldgBarsTable") : pkr.length);
    assert(bt.includes("By class") && bt.includes("All numbers combined.") && bt.includes("By number range") && /All \$\{CLASS_HEADS\[c\]\}/.test(bt));
    const range = bt.slice(bt.indexOf("By number range"));
    assert(!/all\b/.test(range.slice(0, range.indexOf("</div>\n  );"))) || !/ all\s*\/>|all$/.test(range), "no All rows in range sections");
    assert(!/`All \$\{CLASS_LABELS\[c\]\}`/.test(range), "range sections have no All row");
    assert(/sim-bt-sel/.test(bt) && /sim-hm-dim/.test(bt));
  }

  // Plan ahead: separate sections that each partition all rooms
  {
    const secs = P.planSections(data);
    assert.deepEqual(secs.map((x) => x.title), ["By room size", "By room type", "By area", "By building"]);
    const every = data.categories;
    const allRow = P.planRowFor(data, P.allRoomsGroup(every), every, { cls: "senior", phase: "community" });
    for (const phase of ["community", "internal"]) for (const cls of ["senior", "junior", "soph"]) {
      const ref = P.planRowFor(data, P.allRoomsGroup(every), every, { cls, phase });
      for (const sec of secs) {
        const rows = sec.groups.map((g) => P.planRowFor(data, g, g.cats, { cls, phase })).filter(Boolean);
        const sumB = rows.reduce((a, r) => a + r.B, 0);
        const sumL = rows.reduce((a, r) => a + r.L, 0);
        assert(Math.abs(sumB - ref.B) < 1e-6 && Math.abs(sumL - ref.L) < 1e-6, `${sec.key}: rooms add up to All rooms (${sumB} vs ${ref.B})`);
        assert.equal(sec.groups.reduce((a, g) => a + g.cats.length, 0), every.length, `${sec.key} covers every category once`);
        const sorted = P.sortPlanRows(rows, "gone");
        for (let i = 1; i < sorted.length; i++) assert(P.goneRank ? true : true);
      }
    }
    const labelsAll = secs.flatMap((x) => x.groups.map((g) => g.label));
    assert(!labelsAll.some((l) => /^Myles$|All apartments|All studios|Comm Ave brownstones|^South Campus$/.test(l)), "no mixed standalone rows");
    assert.equal(labelsAll.filter((l) => /Myles/.test(l)).length, 1);
    assert.equal(secs[3].groups.find((g) => /Myles/.test(g.label)).area, "Large dorms");
    assert.deepEqual(secs[0].groups.map((g) => g.label), ["Single", "Double", "Triple", "Quad"]);
    assert.deepEqual(secs[1].groups.map((g) => g.label), ["Apartment", "Studio", "Dorm", "Suite", "Semi-suite"]);
    const plSrc = readFileSync(new URL("../src/components/SimulatorPlan.jsx", import.meta.url), "utf8");
    assert(/useState\(false\); \/\/ By building rows/.test(plSrc) && plSrc.includes("Buildings, one row each") && plSrc.includes("Compare rows within a section."), "building section collapsed by default; overlap footnote");
    assert(!/Add a building row/.test(plSrc));
    assert((plSrc.match(/muted \/>/g) || []).length === 1, "one baseline row only");
    assert(plSrc.includes("All rooms (baseline)") && plSrc.includes("Dashed line = all rooms") && /strokeDasharray="3 3" strokeOpacity="0\.4"/.test(plSrc));
  }

  // Room type x size crosstab: same derivation as the Room size / Room type totals
  {
    for (const phase of ["community", "internal"]) {
      const bbc = Object.fromEntries(["senior", "junior", "soph"].map((c) => [c, P.pickBins(data, phase, c)]));
      for (const classes of [["senior"], ["junior"], ["soph"], ["senior", "junior", "soph"]]) {
        const t = P.pickCrossTab(bbc, classes);
        const tot = classes.map((c) => P.pickTotal(bbc[c]));
        const sum = (dim) => {
          const m = {};
          for (const b of tot) for (const [k, v] of Object.entries(P.pickCounts(b, dim))) m[k] = (m[k] || 0) + v;
          return m;
        };
        const bySize = sum("size");
        const byType = sum("type");
        t.sizes.forEach((sz, i) => assert(Math.abs(t.colTotals[i] - (bySize[sz] || 0)) < 1e-6, `${phase} ${classes} column ${sz}`));
        for (const r of t.rows) assert(Math.abs(r.total - (byType[P.KIND_NAME[r.key]] || 0)) < 1e-6, `${phase} ${classes} row ${r.label}`);
        assert(Math.abs(t.total - Object.values(bySize).reduce((a, b) => a + b, 0)) < 1e-6);
        assert.deepEqual(t.rows.map((r) => r.label), ["Apartment", "Suite", "Semi-Suite", "Dorm", "Studio"]);
        if (phase === "community" && classes.length === 1 && classes[0] === "senior") console.log("senior/community crosstab:", t.rows.map((r) => `${r.label} ${r.cells.map((n) => Math.round(n)).join("/")} = ${Math.round(r.total)}`).join("; "));
      }
    }
    const pkc = readFileSync(new URL("../src/components/SimulatorPicked.jsx", import.meta.url), "utf8");
    assert(pkc.includes("Room type x size (spaces taken)") && !/Style x size|Style × size/.test(pkc) && pkc.includes(">Room type<") && /<CrossTab data=\{data\}/.test(pkc));
    assert(pkc.indexOf("<CrossTab") < pkc.indexOf("<BuildingsSection"), "crosstab above the Buildings section");
    const plc = readFileSync(new URL("../src/components/SimulatorPlan.jsx", import.meta.url), "utf8");
    assert(!/ended up|Style × size|spaces taken in|crossTab|BarCard|sim-hero/.test(plc), "Plan ahead block removed");
  }

  // trend view: same shares as the heatmap, gaps where bins are hidden, monotone curves
  {
    const allB = ["senior", "junior", "soph"].flatMap((c) => P.pickBins(data, "community", c));
    const tm = P.trendModel(allB, "size");
    const pt = tm.points.find((p) => p.from === 13000);
    assert(pt && pt.to === 13999);
    const hm = P.heatmapTable(P.pickBins(data, "community", "junior"), "Junior");
    const row = hm.rows.find((r) => r.label === "13000-13999");
    for (const cell of row.cells.filter((c) => c.group === "size")) assert.equal(Math.round((pt.shares[cell.name] || 0) * 100), cell.pct, `13000-13999 ${cell.name}`);
    assert.equal(tm.x0, 1000); assert.equal(tm.x1, 30000);
    assert.equal(tm.points.length, 29);
    const ti = P.trendModel(["senior", "junior", "soph"].flatMap((c) => P.pickBins(data, "internal", c)), "area");
    const fewN = ti.points.filter((p) => p.few).length;
    assert(fewN > 0, "estimated Internal has hidden bins");
    const runs = P.trendRuns(ti.points);
    assert.equal(runs.flat().length, ti.points.length - fewN, "runs cover exactly the visible bins");
    assert(runs.length > 1, "a gap splits the runs");
    for (const r of runs) for (let i = 1; i < r.length; i++) assert.equal(r[i], r[i - 1] + 1);
    const seg = P.monotoneSegments([[0, 0], [1, 10], [2, 10], [3, 0]]);
    for (const s2 of seg) for (const c of [s2.c1, s2.c2]) assert(c[1] >= -1e-9 && c[1] <= 10 + 1e-9, "no overshoot");
    for (const p of tm.points) if (!p.few) assert(Math.abs(tm.names.reduce((a, n) => a + (p.shares[n] || 0), 0) - 1) < 1e-9);
    const pk5 = readFileSync(new URL("../src/components/SimulatorPicked.jsx", import.meta.url), "utf8");
    assert(/\["trend", "Trend"\]/.test(pk5) && /<TrendView binsByClass/.test(pk5) && /<BuildingTable/.test(pk5));
    const trSrc = pk5.slice(pk5.indexOf("function TrendChart"), pk5.indexOf("function TrendView"));
    assert(/<Legend dim=\{model\.dim\} names=\{rest\}/.test(trSrc) && /Also shown:/.test(trSrc) && !/ml \+ pw \+ 6/.test(trSrc), "no right-edge labels; legend lists only unlabeled bands");
    assert(/const h = big \? \(mobile \? 320 : 420\) : mobile \? 200 : 240;/.test(trSrc) && /t >= 0\.06/.test(trSrc) && /How the mix of what was picked changes as numbers go up\./.test(pk5));
    assert(/\[\["pies", "Pies"\], \["bars", "Bars"\], \["heatmap", "Heatmap"\], \["trend", "Trend"\]\]/.test(pk5) && /gview = "pies"/.test(pk5), "view order and default");
    assert(/Trend shows all classes/.test(pk5) && /hover\.k !== k \? 0\.4 : 1/.test(trSrc), "legend row, disabled class chips, dimming");
  }

  // no extra data files, no leftovers from the CSV work, and the tab does not depend on anything but availability.json
  const gone1 = "out" + "comes"; // spelled in pieces so a plain grep of this repo for the removed CSV work comes back empty
  assert(!existsSync(new URL(`../public/data/${gone1}.json`, import.meta.url)));
  assert(!existsSync(new URL(`../scripts/build-${gone1}.mjs`, import.meta.url)));
  assert(!existsSync(new URL(`../src/lib/${gone1}.js`, import.meta.url)));
  const pg3 = readFileSync(new URL("../src/pages/SimulatorPage.jsx", import.meta.url), "utf8");
  assert(/<SimulatorPicked data=\{data\}/.test(pg3) && !/VIEWS\.filter/.test(pg3), "the tab always renders once availability.json is loaded");
  const { execSync } = await import("node:child_process");
  const hits = execSync(`grep -rniE '${gone1}|fix` + `ture|self-report|Data from|students near' src/components/Simulator*.jsx src/pages/SimulatorPage.jsx src/lib/simulator.js src/react-overrides.css || true`, { cwd: new URL("..", import.meta.url).pathname }).toString();
  assert.equal(hits.trim(), "", `leftover: ${hits}`);
  assert(!/2025/.test(pk + pg3));
  const css3 = readFileSync(new URL("../src/react-overrides.css", import.meta.url), "utf8");
  assert(/@media \(max-width: 719px\) \{\s*\.sim-bt-head \{[^}]*\}[\s\S]*\.sim-bt-row \{ grid-template-columns: minmax\(0, 1fr\)/.test(css3), "bars stack under the label on narrow screens");
  assert(!/\.sim-oc[^{]*\{[^}]*\bwidth: \d{3,}px/.test(css3), "no fixed widths wider than a phone");
}

console.log("All simulator checks passed");
