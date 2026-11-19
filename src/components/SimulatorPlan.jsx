/**
 * SimulatorPlan - the "Plan ahead" view of the Housing Selection Simulator, for people without a number yet.
 * Main table: one row per group of categories (sums before dividing) with a sparkline of picked rooms
 * remaining across numbers 1000-29999, five scenario cells for the chosen class, "half / mostly gone by"
 * numbers and the never-filled count.
 *
 * Definitions: locked = full before selection began (hidden); baseline B = open when selection began;
 * leftover L = never filled; picked C = B - L; picked remaining = max(0, open - L) / C.
 */
import React, { useMemo, useState } from "react";
import {
  CLASSES,
  CLASS_LABELS,
  PHASE_LABELS,
  BUILDINGS,
  allRoomsGroup,
  planSections,
  PLAN_PHASES,
  PLAN_SORTS,
  SIZE_LIST,
  buildingLabel,
  groupStats,
  goneLabel,
  planRowFor,
  seriesCategories,
  sortPlanRows,
  styleLabel,
  uniqueValues,
} from "../lib/simulator";

const PLAN_LABELS = { ...PHASE_LABELS, both: "Both" };
const fmt = (n) => Math.round(n).toLocaleString("en-US");
const pct0 = (x) => `${Math.round(x * 100)}%`;

/** Multi-select chip filter. sel === null means "everything selected". */
function toggleIn(sel, all, v) {
  const base = sel === null ? all : sel;
  const next = base.includes(v) ? base.filter((x) => x !== v) : [...base, v];
  return next.length === all.length ? null : next;
}

export default function SimulatorPlan({ data, cls, setCls, planPhase, setPlanPhase, onJump }) {
  const { meta } = data;
  const [sortBy, setSortBy] = useState("gone");
  const [showB, setShowB] = useState(false); // By building rows (collapsed by default)
  const [fStyle, setFStyle] = useState(null);
  const [fSize, setFSize] = useState(null);
  const [fArea, setFArea] = useState(null);

  const styles = useMemo(() => uniqueValues(data.categories, "kind"), [data]);
  const areas = useMemo(() => uniqueValues(data.categories, "building"), [data]);
  const filtered = fStyle !== null || fSize !== null || fArea !== null;
  const inFilter = (c) =>
    (fStyle === null || fStyle.includes(c.kind)) && (fSize === null || fSize.includes(c.size)) && (fArea === null || fArea.includes(c.building));

  // The table reads one phase's number axis; Community is used when Both is selected.
  const axisPhase = planPhase === "internal" ? "internal" : "community";

  // Sections: size / type / area / building; each row is one group, sorted within its section.
  const sections = useMemo(() => {
    const secs = planSections(data);
    const uni = data.categories.filter(inFilter);
    const ref = uni.length ? planRowFor(data, allRoomsGroup(uni), uni, { cls, phase: axisPhase }) : null;
    return {
      ref,
      list: secs.map((sec) => {
        const rows = [];
        for (const g of sec.groups) {
          const cats = g.cats.filter(inFilter);
          if (!cats.length) continue;
          const row = planRowFor(data, { ...g, cats }, cats, { cls, phase: axisPhase });
          if (row) rows.push(row);
        }
        if (sec.key === "bldg") {
          // grouped under area headers (area order), sorted within each area
          const order = [...new Set(BUILDINGS.map((b) => b.area))];
          return { ...sec, rows: order.flatMap((a) => sortPlanRows(rows.filter((r) => r.group.area === a), sortBy)) };
        }
        return { ...sec, rows: sortPlanRows(rows, sortBy) };
      }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, cls, axisPhase, sortBy, fStyle, fSize, fArea]);
  const rows = sections.ref ? [sections.ref] : [];
  const columns = rows[0] ? rows[0].cells : [];
  const nCols = columns.length + 4; // group, sparkline, the checkpoint columns, three "gone" columns

  // Summary over the (filtered) categories
  const universe = useMemo(() => data.categories.filter(inFilter), [data, fStyle, fSize, fArea]); // eslint-disable-line react-hooks/exhaustive-deps
  const sum = groupStats(meta, universe);
  const all = groupStats(meta, data.categories);
  const totalRooms = all.rooms;

  return (
    <div className="sim-plan">
      <p className="sim-plan-lead">
        You don&apos;t have a number yet? Here&apos;s how long each kind of room lasted last year, and what number it took.
      </p>

      <div className="sim-row sim-plan-controls">
        <div className="filter-group">
          <span className="filter-group-label">Class year</span>
          <div className="sim-toggle" role="group" aria-label="Class year">
            {CLASSES.map((c) => (
              <button key={c} type="button" className={`quick-filter-btn ${cls === c ? "sim-on" : ""}`.trim()} aria-pressed={cls === c} onClick={() => setCls(c)}>
                {CLASS_LABELS[c]}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-group">
          <span className="filter-group-label">Phase</span>
          <div className="sim-toggle" role="group" aria-label="Phase">
            {PLAN_PHASES.map((p) => (
              <button key={p} type="button" className={`quick-filter-btn ${planPhase === p ? "sim-on" : ""}`.trim()} aria-pressed={planPhase === p} onClick={() => setPlanPhase(p)}>
                {PLAN_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filters (multi-select, default all) */}
      <div className="sim-filters">
        <ChipFilter label="Style" values={styles} sel={fStyle} setSel={setFStyle} display={styleLabel} />
        <ChipFilter label="Size" values={SIZE_LIST} sel={fSize} setSel={setFSize} display={(v) => v} />
        <details className="sim-area-filter">
          <summary>
            <span className="filter-group-label">Area</span>
            <span className="sim-area-count">{fArea === null ? "All areas" : `${fArea.length} of ${areas.length}`}</span>
          </summary>
          <ChipFilter values={areas} sel={fArea} setSel={setFArea} display={buildingLabel} />
        </details>
        {filtered ? (
          <button type="button" className="btn-ghost-xs" onClick={() => { setFStyle(null); setFSize(null); setFArea(null); }}>Reset filters</button>
        ) : null}
      </div>

      <p className="sim-summary">
        Last year: <strong>{fmt(sum.B)}</strong> rooms{filtered ? " in this selection" : ""} were up for grabs when selection began;{" "}
        <strong>{fmt(sum.L)}</strong> never filled.
      </p>
      <p className="sim-note">
        ~{fmt(all.locked)} rooms ({((all.locked / totalRooms) * 100).toFixed(1)}%) were already taken before selection began (likely
        current residents keeping their rooms) and are not shown.
      </p>

      {/* Main table */}
      <h3 className="sim-h3">How long did each kind of room last?</h3>
      <div className="sim-plan-tools">
        <label className="filter-group-label" htmlFor="sim-plan-sort">Sort</label>
        <select id="sim-plan-sort" className="sim-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          {PLAN_SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <span className="sim-note sim-inline">
          {PHASE_LABELS[axisPhase]} numbers{planPhase === "both" ? " (used when Both is selected)" : ""}; {CLASS_LABELS[cls]} cells.
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="sim-status">No groups match these filters.</p>
      ) : (
        <div className="sim-scroll" tabIndex={0} role="region" aria-label="Plan ahead table, scrolls sideways">
          <table className="sim-table sim-matrix">
            <thead>
              <tr>
                <th scope="col" className="sim-sticky">Group</th>
                <th scope="col">Across all numbers</th>
                {columns.map((c) => (
                  <th key={c.p} scope="col">
                    #{c.n}
                    <span className="sim-th-sub">{Math.round(c.p * 100)}% in</span>
                  </th>
                ))}
                <th scope="col" className="sim-th-gone">Half gone by</th>
                <th scope="col" className="sim-th-gone">Mostly gone (90%) by</th>
                <th scope="col" className="sim-th-gone" title="Still open on 4/2. May be low demand or limited eligibility.">
                  Never filled
                  <span className="sim-th-sub">open on 4/2</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sections.ref ? <PlanRow r={sections.ref} meta={meta} cls={cls} axisPhase={axisPhase} onJump={onJump} muted /> : null}
              {sections.list.map((sec) => {
                const isB = sec.key === "bldg";
                const open = !isB || showB;
                return (
                  <React.Fragment key={sec.key}>
                    <tr className="sim-pl-sec">
                      <th scope="colgroup" colSpan={nCols}>
                        <strong>{sec.title}</strong>
                        <span className="sim-pl-cap">{sec.caption}</span>
                      </th>
                    </tr>
                    {isB ? (
                      <tr className="sim-pl-disc">
                        <td colSpan={nCols}>
                          <button type="button" className="sim-pl-disc-btn" aria-expanded={showB} onClick={() => setShowB(!showB)}>
                            <span className="sim-bd-chev" aria-hidden="true">{showB ? "▾" : "▸"}</span> Buildings, one row each
                          </button>
                        </td>
                      </tr>
                    ) : null}
                    {open
                      ? sec.rows.map((r, i) => (
                          <React.Fragment key={r.group.series.id + r.group.label}>
                            {isB && (i === 0 || sec.rows[i - 1].group.area !== r.group.area) ? (
                              <tr className="sim-pl-area">
                                <th scope="colgroup" colSpan={nCols} style={{ background: `${(BUILDINGS.find((b) => b.area === r.group.area) || {}).color || "#999999"}33` }}>
                                  {r.group.area}
                                </th>
                              </tr>
                            ) : null}
                            <PlanRow r={r} meta={meta} cls={cls} axisPhase={axisPhase} onJump={onJump} base={sections.ref ? sections.ref.spark : null} />
                          </React.Fragment>
                        ))
                      : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="sim-note sim-pl-overlap">
        Rows in different sections overlap (for example, StuVi rooms are also apartments and singles). Compare rows within a section.
      </p>

      <p className="sim-note sim-caption sim-caption-late">Late numbers mostly end up in the &lsquo;never filled&rsquo; rooms.</p>
      <p className="sim-note sim-caption">
        Colors show how much of the rooms that got picked (the ones someone took) were still open at that number. Rooms nobody took are in the
        last column. This is not your odds.
      </p>
      <p className="sim-note">
        <span className="sim-word sim-cell-plenty">Plenty</span> 50%+ <span className="sim-word sim-cell-some">Some</span> 20-50%{" "}
        <span className="sim-word sim-cell-slim">Slim</span> 5-20% <span className="sim-word sim-cell-gone">Gone</span> under 5% of
        the rooms that got picked still open. Click a row to explore it over time.
      </p>
    </div>
  );
}

/** A row of toggle chips. */
function ChipFilter({ label, values, sel, setSel, display }) {
  return (
    <div className="sim-chipfilter" role="group" aria-label={label || "Filter"}>
      {label ? <span className="filter-group-label">{label}</span> : null}
      <div className="sim-chips">
        {values.map((v) => {
          const on = sel === null || sel.includes(v);
          return (
            <button key={v} type="button" className={`sim-preset ${on ? "sim-preset-on" : ""}`.trim()} aria-pressed={on} onClick={() => setSel(toggleIn(sel, values, v))}>
              {on ? "✓ " : ""}{display(v)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const SP_W = 132;
const SP_H = 34;

/** Inline SVG: picked remaining % across numbers 1000-29999, faint ticks at 10000 and 20000. */
function Sparkline({ spark, meta, cls, base = null }) {
  const x = (n) => 2 + ((n - 1000) / (29999 - 1000)) * (SP_W - 4);
  const y = (v) => 3 + (1 - v) * (SP_H - 6);
  const [lo, hi] = meta.classRanges[cls];
  const pts = spark.map((p) => `${x(p.n).toFixed(1)},${y(p.share).toFixed(1)}`).join(" ");
  const basePts = base ? base.map((p) => `${x(p.n).toFixed(1)},${y(p.share).toFixed(1)}`).join(" ") : null;
  const at = (n) => spark.reduce((best, p) => (Math.abs(p.n - n) < Math.abs(best.n - n) ? p : best), spark[0]);
  const label = `Picked rooms still open: ${pct0(at(1000).share)} at #1000, ${pct0(at(10000).share)} at #10000, ${pct0(at(20000).share)} at #20000, ${pct0(at(29999).share)} at #29999`;
  return (
    <svg className="sim-spark" width={SP_W} height={SP_H} viewBox={`0 0 ${SP_W} ${SP_H}`} role="img" aria-label={label}>
      {base ? <title>Dashed line = all rooms</title> : null}
      <rect x={x(lo)} y="1" width={Math.max(1, x(hi) - x(lo))} height={SP_H - 2} className="sim-spark-class" />
      <line x1={x(10000)} x2={x(10000)} y1="1" y2={SP_H - 1} className="sim-spark-tick" />
      <line x1={x(20000)} x2={x(20000)} y1="1" y2={SP_H - 1} className="sim-spark-tick" />
      {basePts ? <polyline points={basePts} fill="none" className="sim-spark-base" strokeWidth="1" strokeDasharray="3 3" strokeOpacity="0.4" /> : null}
      <polyline points={pts} fill="none" stroke="#a31f23" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

/** Horizontal bars: width = share of all spaces taken, label shows % and count. */
/** One Plan ahead row (group label, sparkline, five checkpoints, half / mostly gone by, never filled). */
function PlanRow({ r, meta, cls, axisPhase, onJump, muted = false, base = null }) {
  return (
    <tr className={`sim-matrix-row ${muted ? "sim-pl-ref" : ""}`.trim()} onClick={() => onJump(r.group.series)}>
      <th scope="row" className="sim-sticky">
        <button type="button" className="sim-rowbtn" onClick={(e) => { e.stopPropagation(); onJump(r.group.series); }} title={`Explore ${r.group.label} over time`}>
          {muted ? "All rooms (baseline)" : r.group.short || r.group.label}
          <span className="sim-rowbtn-sub">{fmt(r.B)} rooms · explore →</span>
        </button>
      </th>
      <td className="sim-spark-cell"><Sparkline spark={r.spark} meta={meta} cls={cls} base={muted ? null : base} /></td>
      {r.cells.map((c) => (
        <td key={c.p} className={`sim-cell sim-cell-${c.key}`} title={`${fmt(c.count)} of ${fmt(r.C)} rooms that got picked were still open`}>
          <strong>{pct0(c.share)}</strong>
          <span className="sim-cell-word">{c.word}</span>
        </td>
      ))}
      <td className="sim-gone sim-gone-text">{goneLabel(r.half, meta, axisPhase)}</td>
      <td className="sim-gone sim-gone-text">{goneLabel(r.mostly, meta, axisPhase)}</td>
      <td className="sim-gone sim-never" title="Still open on 4/2. May be low demand or limited eligibility.">{fmt(r.L)}</td>
    </tr>
  );
}
