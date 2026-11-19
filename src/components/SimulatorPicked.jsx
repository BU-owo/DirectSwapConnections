/**
 * SimulatorPicked - the "What people got" tab: which rooms disappeared as each range of housing numbers came up.
 * Derived entirely from availability.json (see pickBins in lib/simulator.js): spaces that vanished between the times two
 * numbers map to, summed by room size / room type / area / building. Size, type and area get one 100% stacked bar per
 * 1000-number range; Building gets a ranked list (a many-colored stack would be unreadable). Read-only.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BUILDINGS,
  CLASSES,
  areaOfLabel,
  shortName,
  preInternalSpaces,
  unmappedBuildings,
  CLASS_LABELS,
  PICK_DIMS,
  PICK_MIN,
  heatCellStyle,
  heatGroups,
  buildingCellStyle,
  buildingTable,
  heatmapSummary,
  heatmapTable,
  monotoneSegments,
  pieLabelLayout,
  pieSlices,
  trendModel,
  trendRuns,
  pickBins,
  pickCounts,
  pickCrossTab,
  pickShares,
  pickTotal,
  textOn,
} from "../lib/simulator";

const pct = (x) => `${Math.round(x * 100)}%`;
const fmt = (n) => Math.round(n).toLocaleString("en-US");
const binLabel = (b) => `${b.from}-${b.to}`;
const PHASE_CHIPS = [
  { key: "community", label: "Community" },
  { key: "internal", label: "Internal (estimated)" },
];

const BAR_DIMS = [["size", "Room size"], ["type", "Room type"], ["area", "Area"]];
const CLASS_HEADS = { senior: "Seniors", junior: "Juniors", soph: "Sophomores" };

/** One stacked 100% bar, 18px tall. Label inside when wide enough: "{Name} {pct}%" from 22%, "{pct}%" from 10%. */
function StackBar({ bin, dim, label }) {
  const shares = pickShares(pickCounts(bin, dim), dim);
  return (
    <div className="sim-bt-bar" role="img" aria-label={`${label}: ${shares.map((s) => `${s.name} ${pct(s.share)}`).join(", ")}`}>
      {shares.map((s) => (
        <div
          key={s.name}
          className="sim-oc-seg"
          style={{ width: `${s.share * 100}%`, background: s.color, color: textOn(s.color) }}
          title={`${s.name}: ${pct(s.share)} (${fmt(s.count)} spaces)`}
        >
          {s.share >= 0.22 ? `${s.name} ${pct(s.share)}` : s.share >= 0.1 ? pct(s.share) : ""}
        </div>
      ))}
    </div>
  );
}

/** Names minus those that already have an in-chart label. */
const without = (names, labeled) => new Set([...names].filter((n) => !labeled.has(n)));

function Legend({ dim, names, prefix = "" }) {
  const cfg = PICK_DIMS[dim];
  if (!names.size) return null;
  const shown = cfg.order.filter((n) => names.has(n));
  const extra = [...names].filter((n) => !cfg.order.includes(n));
  return (
    <ul className="sim-oc-legend" aria-label={`${cfg.label} legend`}>
      {prefix ? <li className="sim-lg-pre">{prefix}</li> : null}
      {[...shown, ...extra].map((n) => (
        <li key={n}>
          <i style={{ background: cfg.colors[n] || "#9aa0a6" }} /> {n}
        </li>
      ))}
    </ul>
  );
}

/** Legend for the building breakdown: area name (bold), then that area's building dots + names. */
function BldgLegend({ names, prefix = "" }) {
  if (!names.size) return null;
  const areas = [...new Set(BUILDINGS.map((b) => b.area))];
  return (
    <ul className="sim-oc-legend sim-lg-grouped" aria-label="Building legend">
      {prefix ? <li className="sim-lg-pre">{prefix}</li> : null}
      {areas.map((a) => {
        const items = BUILDINGS.filter((b) => b.area === a && names.has(b.label));
        return items.length ? (
          <li key={a} className="sim-lg-grp">
            <strong>{a}</strong>
            {items.map((b) => (
              <span key={b.label} className="sim-lg-item">
                <i style={{ background: b.color }} /> {b.label}
              </span>
            ))}
          </li>
        ) : null;
      })}
    </ul>
  );
}

/** One full-width 100% bar of buildings in area order; a 2px white gap marks each new area. */
function BldgBar({ bin, label }) {
  const shares = pickShares(pickCounts(bin, "bldg"), "bldg");
  return (
    <div className="sim-bt-bar sim-bk-bar" role="img" aria-label={`${label}: ${shares.filter((x) => x.share >= 0.05).map((x) => `${x.name} ${pct(x.share)}`).join(", ")}`}>
      {shares.map((x, i) => {
        const newArea = i > 0 && areaOfLabel(x.name) !== areaOfLabel(shares[i - 1].name);
        return (
          <div
            key={x.name}
            className="sim-oc-seg"
            style={{ width: `${x.share * 100}%`, background: x.color, color: textOn(x.color), borderLeft: newArea ? "2px solid #fff" : undefined, boxSizing: "border-box" }}
            title={`${x.name} (${areaOfLabel(x.name)}): ${pct(x.share)} (${fmt(x.count)} spaces)`}
          >
            {x.share >= 0.14 ? `${shortName(x.name)} ${pct(x.share)}` : x.share >= 0.09 ? pct(x.share) : ""}
          </div>
        );
      })}
    </div>
  );
}

function BldgRow({ bin, label, all = false }) {
  const few = bin.n < PICK_MIN;
  return (
    <div className={`sim-bt-row sim-bk-row ${all ? "sim-bt-all" : ""} ${few ? "sim-bt-few" : ""}`.trim()}>
      <div className="sim-bt-label">
        <span className="sim-bt-rl">{label}</span>
        {bin.n >= 0.5 ? <span className="sim-bt-rn">{fmt(bin.n)} spaces</span> : null}
      </div>
      {few ? <div className="sim-bt-fewmsg">very few picked</div> : <BldgBar bin={bin} label={label} />}
    </div>
  );
}

/** Bars, Buildings breakdown: sticky grouped legend, then per class a header, an All row and one row per 1000-bin. */
function BldgBarsTable({ binsByClass, classes }) {
  const names = new Set();
  const labeled = new Set();
  for (const c of classes) for (const b of [pickTotal(binsByClass[c]), ...binsByClass[c]]) if (b.n >= PICK_MIN) for (const x of pickShares(pickCounts(b, "bldg"), "bldg")) {
    names.add(x.name);
    if (x.share >= 0.14) labeled.add(x.name);
  }
  return (
    <div className="sim-bt sim-bk">
      <div className="sim-bt-head sim-bk-head">
        <div className="sim-bt-label" aria-hidden="true" />
        <div className="sim-bt-col">
          <div className="sim-bt-title">Buildings, grouped by area</div>
          <BldgLegend names={without(names, labeled)} prefix={labeled.size ? "Also shown:" : ""} />
        </div>
      </div>
      {classes.map((c) => {
        const bs = binsByClass[c];
        return (
          <section key={c} className="sim-bt-class" aria-label={CLASS_HEADS[c]}>
            <h4 className="sim-bt-ch">{CLASS_HEADS[c]}</h4>
            <BldgRow bin={pickTotal(bs)} label={`All ${CLASS_LABELS[c]}`} all />
            {bs.map((b) => (
              <BldgRow key={b.from} bin={b} label={binLabel(b)} />
            ))}
          </section>
        );
      })}
    </div>
  );
}

/** One row: label + spaces, then the size / type / area bars (or "very few picked"). */
function BarRow({ bin, label, all = false, extra = "" }) {
  const few = bin.n < PICK_MIN;
  return (
    <div className={`sim-bt-row ${all ? "sim-bt-all" : ""} ${few ? "sim-bt-few" : ""} ${extra}`.trim()}>
      <div className="sim-bt-label">
        <span className="sim-bt-rl">{label}</span>
        {bin.n >= 0.5 ? <span className="sim-bt-rn">{fmt(bin.n)} spaces</span> : null}
      </div>
      {few ? (
        <div className="sim-bt-fewmsg">very few picked</div>
      ) : (
        BAR_DIMS.map(([dim, title]) => <StackBar key={dim} bin={bin} dim={dim} label={`${label}, ${title}`} />)
      )}
    </div>
  );
}

/** Small multiples: one sticky header with three titled legends, then per class a header, an All row and one row per 1000-bin. */
function BarsTable({ binsByClass, classes, selected = "all" }) {
  const names = { size: new Set(), type: new Set(), area: new Set() };
  const labeled = { size: new Set(), type: new Set(), area: new Set() }; // named inside a segment (>= 22%) somewhere
  // By class always shows every class's total; By number range shows the bins of the shown classes
  const rowsForLegend = [...CLASSES.map((c) => pickTotal(binsByClass[c])), ...classes.flatMap((c) => binsByClass[c])];
  {
    for (const b of rowsForLegend) {
      if (b.n < PICK_MIN) continue;
      for (const [dim] of BAR_DIMS)
        for (const s of pickShares(pickCounts(b, dim), dim)) {
          names[dim].add(s.name);
          if (s.share >= 0.22) labeled[dim].add(s.name);
        }
    }
  }
  return (
    <div className="sim-bt">
      <div className="sim-bt-head">
        <div className="sim-bt-label" aria-hidden="true" />
        {BAR_DIMS.map(([dim, title]) => (
          <div key={dim} className="sim-bt-col">
            <div className="sim-bt-title">{title}</div>
            <Legend dim={dim} names={without(names[dim], labeled[dim])} prefix={labeled[dim].size ? "Also shown:" : ""} />
            {dim === "area" ? <div className="sim-bt-note">StuVi is counted separately from other apartments.</div> : null}
          </div>
        ))}
      </div>
      <section className="sim-bt-summary" aria-label="By class">
        <h4 className="sim-h4">By class</h4>
        <p className="sim-note sim-hm-cap">All numbers combined.</p>
        {CLASSES.map((c) => (
          <BarRow
            key={c}
            bin={pickTotal(binsByClass[c])}
            label={`All ${CLASS_HEADS[c]}`}
            all
            extra={selected !== "all" ? (selected === c ? "sim-bt-sel" : "sim-hm-dim") : ""}
          />
        ))}
      </section>
      <h4 className="sim-h4 sim-bt-rangeh">By number range</h4>
      {classes.map((c) => {
        const bs = binsByClass[c];
        return (
          <section key={c} className="sim-bt-class" aria-label={CLASS_HEADS[c]}>
            <h4 className="sim-bt-ch">{CLASS_HEADS[c]}</h4>
            {bs.map((b) => (
              <BarRow key={b.from} bin={b} label={binLabel(b)} />
            ))}
          </section>
        );
      })}
    </div>
  );
}

/** Heatmap, Buildings breakdown: buildings as rows (grouped by area), coarse number ranges as columns. */
function BuildingTable({ binsByClass, classes, pcls }) {
  const w = useViewportW();
  const mobile = w < 720;
  const [mcls, setMcls] = useState(pcls !== "all" ? pcls : "senior");
  useEffect(() => {
    if (pcls !== "all") setMcls(pcls);
  }, [pcls]);
  const shown = mobile ? [mcls] : classes;
  const t = useMemo(() => buildingTable(binsByClass, shown), [binsByClass, shown.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const ncols = t.cols.length;
  return (
    <section className="sim-bb" aria-label="Buildings heatmap">
      {mobile ? (
        <div className="sim-toggle sim-bb-switch" role="group" aria-label="Class">
          {CLASSES.map((c) => (
            <button key={c} type="button" className={`quick-filter-btn ${mcls === c ? "sim-on" : ""}`.trim()} aria-pressed={mcls === c} onClick={() => setMcls(c)}>
              {CLASS_HEADS[c]}
            </button>
          ))}
        </div>
      ) : null}
      <table className="sim-table sim-bb-table" aria-label="Share of spaces taken by building">
        <colgroup>
          <col className="sim-bb-c0" />
          {t.cols.map((c) => (
            <col key={`${c.cls}-${c.from}`} />
          ))}
        </colgroup>
        <thead>
          <tr className="sim-bb-r1">
            <th rowSpan={3} scope="col" className="sim-bb-corner">Building</th>
            {shown.map((c) => (
              <th key={c} scope="colgroup" colSpan={3} className={`sim-bb-gh ${c === shown[0] ? "" : "sim-bb-div"}`.trim()}>
                {CLASS_HEADS[c]}
              </th>
            ))}
          </tr>
          <tr className="sim-bb-r2">
            {t.cols.map((c, i) => (
              <th key={`${c.cls}-${c.from}`} scope="col" className={`sim-bb-ch ${i % 3 === 0 && i > 0 ? "sim-bb-div" : ""}`.trim()}>
                {c.label}
              </th>
            ))}
          </tr>
          <tr className="sim-bb-r3">
            {t.cols.map((c, i) => (
              <th key={`${c.cls}-${c.from}`} scope="col" className={`sim-bb-cn ${i % 3 === 0 && i > 0 ? "sim-bb-div" : ""}`.trim()}>
                {c.few ? "very few picked" : `${fmt(c.n)} spaces`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.areas.map((a) => (
            <React.Fragment key={a.area}>
              <tr className="sim-bb-area">
                <th colSpan={ncols + 1} scope="colgroup" style={{ background: `${a.color}33` }}>
                  {a.area}
                </th>
              </tr>
              {a.rows.map((r) => (
                <tr key={r.label} className="sim-bb-row">
                  <th scope="row" className="sim-bb-name">
                    <i style={{ background: r.color }} aria-hidden="true" />
                    {r.label}
                  </th>
                  {r.cells.map((cell, i) => {
                    const col = t.cols[i];
                    return (
                      <td
                        key={`${col.cls}-${col.from}`}
                        className={`sim-bb-cell ${col.few ? "sim-bb-few" : ""} ${i % 3 === 0 && i > 0 ? "sim-bb-div" : ""}`.trim()}
                        style={col.few || cell.dash ? undefined : buildingCellStyle(cell.share, r.color)}
                        title={`${r.label}: ${cell.pct}% (${fmt(cell.count)} spaces) in ${col.label}`}
                      >
                        {col.few ? "" : cell.dash ? <span className="sim-hm-dash">-</span> : `${cell.pct}%`}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** One heatmap table: column-group headers, then rows. `corner` labels the first column. */
const SOFT = { Brownstones: "Brown\u00ADstones", Apartments: "Apart\u00ADments", Apartment: "Apart\u00ADment" };

function HeatTable({ t, group, corner, label, selected = "all", onPick = null }) {
  const isStart = (c) => t.columns.find((x) => x.group === c.group).name === c.name; // first column of its group
  const n = (k) => t.columns.filter((c) => k === "all" || c.group === k).length;
  return (
    <div className="sim-hm-tw">
      <table className="sim-table sim-hm" data-group={group} aria-label={label} style={{ "--n-size": n("size"), "--n-type": n("type"), "--n-area": n("area"), "--n-sp": Math.max(0, t.groups.length - 1) }}>
        <colgroup>
          <col className="sim-hm-c0" />
          {t.columns.map((col, i) => (
            <React.Fragment key={`${col.group}-${col.name}`}>
              {i > 0 && isStart(col) ? <col className="sim-hm-sp" /> : null}
              <col className={`sim-hm-g-${col.group}`} />
            </React.Fragment>
          ))}
        </colgroup>
        <thead>
          <tr className="sim-hm-r1">
            <th scope="col" rowSpan={2} className="sim-sticky sim-hm-corner">{corner}</th>
            {t.groups.map((g, gi) => (
              <React.Fragment key={g.key}>
                {gi > 0 ? <th rowSpan={2} className="sim-hm-sp" aria-hidden="true" /> : null}
                <th scope="colgroup" colSpan={g.span} className={`sim-hm-gh sim-hm-g-${g.key}`}>
                  {g.label}
                </th>
              </React.Fragment>
            ))}
          </tr>
          <tr className="sim-hm-r2">
            {t.columns.map((col) => (
              <th key={`${col.group}-${col.name}`} scope="col" className={`sim-hm-ch sim-hm-g-${col.group}`}>
                {SOFT[col.name] || col.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((r) => (
            <tr key={r.key} className={`${r.all ? "sim-hm-allrow" : ""} ${r.few ? "sim-hm-fewrow" : ""} ${onPick && selected !== "all" ? (r.key === selected ? "sim-hm-sel" : "sim-hm-dim") : ""}`.trim()}>
              <th scope="row" className="sim-sticky sim-hm-rowhead">
                {onPick ? (
                  <button type="button" className="sim-hm-rowbtn" aria-pressed={selected === r.key} title={`Show ${CLASS_LABELS[r.key]} ranges`} onClick={() => onPick(r.key)}>
                    <span className="sim-hm-rl">{r.label}</span>
                    <span className="sim-hm-rn">{fmt(r.n)} spaces</span>
                  </button>
                ) : (
                  <>
                    <span className="sim-hm-rl">{r.label}</span>
                    <span className="sim-hm-rn">{fmt(r.n)} spaces</span>
                  </>
                )}
              </th>
              {r.few ? (
                <td colSpan={t.columns.length + Math.max(0, t.groups.length - 1)} className="sim-hm-few">very few picked</td>
              ) : (
                r.cells.map((cell, ci) => (
                  <React.Fragment key={`${cell.group}-${cell.name}-${cell.kind}`}>
                  {ci > 0 && isStart(cell) ? <td className="sim-hm-sp" aria-hidden="true" /> : null}
                  <td
                    className={`sim-hm-cell sim-hm-g-${cell.group} ${cell.bold ? "sim-hm-max" : ""}`.trim()}
                    style={cell.dash ? undefined : heatCellStyle(cell.share, cell.group)}
                    title={`${cell.name}: ${cell.pct}% (${fmt(cell.count)} spaces)`}
                  >
                    {cell.dash ? <span className="sim-hm-dash">-</span> : `${cell.pct}%`}
                  </td>
                  </React.Fragment>
                ))
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Heatmap: a "By class" summary (always all three classes), then "By number range": one table per shown class. */
function useViewportW() {
  const [w, setW] = useState(typeof window === "undefined" ? 1280 : window.innerWidth);
  useEffect(() => {
    const f = () => setW(window.innerWidth);
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return w;
}

function HeatmapView({ binsByClass, classes, groups, selected, onPick }) {
  const [group, setGroup] = useState("size"); // narrow screens show one column group at a time
  const w = useViewportW();
  const switchMode = w < 900; // narrow screens: one column group at a time
  const summary = heatmapSummary(binsByClass, CLASS_HEADS, groups);
  const tables = classes.map((c) => ({ c, name: CLASS_LABELS[c], t: heatmapTable(binsByClass[c], CLASS_LABELS[c], { noAll: true, groups }) }));
  const gv = switchMode ? group : "all";
  return (
    <div className="sim-hm-wrap" data-switch={switchMode ? "1" : "0"}>
      {switchMode ? (
        <div className="sim-toggle sim-hm-switch" role="group" aria-label="Column group">
          {["size", "type", "area"].map((g) => (
            <button key={g} type="button" className={`quick-filter-btn ${group === g ? "sim-on" : ""}`.trim()} aria-pressed={group === g} onClick={() => setGroup(g)}>
              {g === "size" ? "Size" : g === "type" ? "Type" : "Area"}
            </button>
          ))}
        </div>
      ) : null}
      <section className="sim-hm-class sim-hm-summary" aria-label="By class">
        <h4 className="sim-h4">By class</h4>
        <p className="sim-note sim-hm-cap">All numbers combined.</p>
        <p className="sim-note sim-hm-showing" aria-live="polite" style={selected === "all" ? { visibility: "hidden" } : undefined}>
          {selected !== "all" ? `Showing ${CLASS_LABELS[selected]} ranges below.` : "\u00a0"}
        </p>
        <HeatTable t={summary} group={gv} corner="Class" label="By class table" selected={selected} onPick={onPick} />
      </section>
      <hr className="sim-hm-divider" />
      <h4 className="sim-h4">By number range</h4>
      {tables.map(({ c, name, t }) => (
        <section key={c} className="sim-hm-class" aria-label={`${name} heatmap`}>
          <h5 className="sim-hm-ct">{CLASS_HEADS[c]}</h5>
          <HeatTable t={t} group={gv} corner="Range" label={`${name} table`} />
        </section>
      ))}
    </div>
  );
}

/** Darker shade of a band color for its direct label. */
function darken(hex, k = 0.62) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v * k));
  return `rgb(${c.join(",")})`;
}

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => setW(Math.floor(el.getBoundingClientRect().width));
    read();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** One stacked-area chart (plain SVG): x = housing number (bin midpoints), y = share of spaces taken. */
function TrendChart({ model, title, spans, pcls, hover, setHover, big = false }) {
  const [ref, w] = useWidth();
  const mobile = typeof window !== "undefined" && window.innerWidth < 720;
  const h = big ? (mobile ? 320 : 420) : mobile ? 200 : 240;
  const disp = (nm) => (big ? shortName(nm) : nm);
  const ml = 34;
  const mr = 12;
  const mt = 18;
  const mb = 18;
  const pw = Math.max(10, w - ml - mr);
  const ph = h - mt - mb;
  const { points, names, colors, x0, x1 } = model;
  const X = (v) => ml + ((v - x0) / (x1 - x0)) * pw;
  const Y = (share) => mt + (1 - share) * ph;
  const runs = trendRuns(points);
  const cum = points.map((p) => {
    let c = 0;
    return names.map((nm) => (c += p.shares[nm] || 0));
  });
  const lowerOf = (i, k) => (k === 0 ? 0 : cum[i][k - 1]);

  const bandPath = (run, k) => {
    if (run.length === 1) {
      const p = points[run[0]];
      const xa = X(p.from);
      const xb = X(p.to + 1);
      return `M${xa},${Y(cum[run[0]][k])}L${xb},${Y(cum[run[0]][k])}L${xb},${Y(lowerOf(run[0], k))}L${xa},${Y(lowerOf(run[0], k))}Z`;
    }
    const top = run.map((i) => [X(points[i].mid), Y(cum[i][k])]);
    const bot = run.map((i) => [X(points[i].mid), Y(lowerOf(i, k))]);
    const ts = monotoneSegments(top);
    const bs = monotoneSegments(bot);
    let d = `M${top[0][0]},${top[0][1]}`;
    for (const s of ts) d += `C${s.c1[0]},${s.c1[1]},${s.c2[0]},${s.c2[1]},${s.p[0]},${s.p[1]}`;
    d += `L${bot[bot.length - 1][0]},${bot[bot.length - 1][1]}`;
    for (let j = bs.length - 1; j >= 0; j--) {
      const start = j === 0 ? bot[0] : bs[j - 1].p;
      d += `C${bs[j].c2[0]},${bs[j].c2[1]},${bs[j].c1[0]},${bs[j].c1[1]},${start[0]},${start[1]}`;
    }
    return `${d}Z`;
  };

  const lastIdx = (() => {
    for (let i = points.length - 1; i >= 0; i--) if (!points[i].few) return i;
    return -1;
  })();

  // Inside labels: each band is named where it is thickest (>= 8% of the chart height); labels closer than 70px
  // horizontally to a nearby placed label move to the next-thickest spot, or are skipped (smaller band loses).
  const inside = (() => {
    const out = [];
    const cands = names.map((nm, k) => {
      const list = [];
      points.forEach((p, i) => {
        const t = p.shares[nm] || 0;
        if (!p.few && t >= 0.06) list.push({ i, t, x: X(p.mid), y: Y(lowerOf(i, k) + t / 2) });
      });
      list.sort((a, b) => b.t - a.t);
      return list;
    });
    const order = names.map((_, k) => k).filter((k) => cands[k].length).sort((a, b) => cands[b][0].t - cands[a][0].t);
    for (const k of order) {
      const half = disp(names[k]).length * (cands[k][0].t >= 0.08 ? 3.4 : 3.1) + 4;
      const spot = cands[k].find(
        (c) => c.x - half >= ml && c.x + half <= ml + pw && out.every((o) => Math.abs(o.y - c.y) >= 13 || Math.abs(o.x - c.x) >= 70)
      );
      if (spot) out.push({ k, x: spot.x, y: spot.y, t: spot.t });
    }
    return out;
  })();

  const pick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const v = x0 + ((e.clientX - r.left - ml) / pw) * (x1 - x0);
    let idx = points.findIndex((p) => v >= p.from && v < p.to + 1);
    if (idx < 0) idx = v < x0 ? 0 : points.length - 1;
    // band under the cursor (null in a gap or outside the plot)
    const sh = 1 - (e.clientY - r.top - mt) / ph;
    let band = null;
    if (!points[idx].few && sh >= 0 && sh <= 1) {
      const k = names.findIndex((_, kk) => sh >= lowerOf(idx, kk) && sh < cum[idx][kk]);
      band = k < 0 ? null : k;
    }
    setHover({ i: idx, dim: model.dim, k: band });
  };
  const active = !!hover && hover.dim === model.dim;
  const hp = hover ? points[hover.i] : null;
  const gx = hp ? X(hp.mid) : 0;
  const tip = hp ? (
    <div className="sim-tr-tip" style={mobile ? undefined : { left: gx, transform: gx > ml + pw / 2 ? "translateX(calc(-100% - 10px))" : "translateX(10px)" }}>
      {hover.dim === model.dim && hover.k != null && !hp.few ? (
        <strong className="sim-tr-band">
          {names[hover.k]} {pct(hp.shares[names[hover.k]] || 0)}
          <br />
        </strong>
      ) : null}
      <span className="sim-tr-r">
        {hp.from}-{hp.to}
      </span>
      {hp.few
        ? `: very few picked (${fmt(hp.n)} spaces)`
        : `: ${names.filter((nm) => (hp.shares[nm] || 0) >= 0.005).map((nm) => `${disp(nm)} ${pct(hp.shares[nm])}`).join(", ")}`}
      {hp.few ? null : <span className="sim-tr-n"> {fmt(hp.n)} spaces</span>}
    </div>
  ) : null;

  return (
    <div className={`sim-tr-chart ${active ? "sim-tr-active" : ""}`.trim()}>
      <h4 className="sim-tr-title">{title}</h4>
      {(() => {
        const labeled = new Set(inside.map((l) => names[l.k]));
        const rest = without(new Set(model.names), labeled);
        const prefix = labeled.size ? "Also shown:" : "";
        return big ? <BldgLegend names={rest} prefix={prefix} /> : <Legend dim={model.dim} names={rest} prefix={prefix} />;
      })()}
      <div className="sim-tr-box" ref={ref}>
        {w > 0 ? (
          <svg
            width={w}
            height={h}
            role="img"
            aria-label={`${title}: share of spaces taken by housing number`}
            style={{ touchAction: "pan-y", display: "block" }}
            onPointerMove={pick}
            onPointerDown={pick}
            onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
          >
            {spans.map((sp) => (
              <g key={sp.c}>
                {pcls === sp.c ? <rect x={X(sp.from)} y={mt} width={X(sp.to) - X(sp.from)} height={ph} fill="rgba(0,0,0,.06)" /> : null}
                <text x={(X(sp.from) + X(sp.to)) / 2} y={11} textAnchor="middle" fontSize={mobile ? 9 : 10} fill="#6b6b6b" fontWeight={pcls === sp.c ? 700 : 400}>
                  {CLASS_HEADS[sp.c]}
                </text>
              </g>
            ))}
            {[0, 0.25, 0.5, 0.75, 1].map((v) => (
              <g key={v}>
                <line x1={ml} x2={ml + pw} y1={Y(v)} y2={Y(v)} stroke="#e6e2e1" strokeWidth="1" strokeOpacity={v === 0 || v === 0.5 || v === 1 ? 1 : 0.6} />
                <text x={ml - 5} y={Y(v)} textAnchor="end" dominantBaseline="central" fontSize="9.5" fill="#6b6b6b">{`${v * 100}%`}</text>
              </g>
            ))}
            {points.map((p) =>
              p.few ? (
                <rect key={p.from} x={X(p.from)} y={mt} width={X(p.to + 1) - X(p.from)} height={ph} fill="none" stroke="#9a9494" strokeWidth="1" strokeDasharray="1.5 3" />
              ) : null
            )}
            {runs.map((run) =>
              names.map((nm, k) => (
                <path key={`${run[0]}-${nm}`} d={bandPath(run, k)} fill={colors[nm] || "#9aa0a6"} stroke="#fff" strokeWidth="0.5" opacity={active && hover.k != null && hover.k !== k ? 0.4 : 1}>
                  <title>{nm}</title>
                </path>
              ))
            )}
            {spans.slice(1).map((sp) => (
              <line key={`d${sp.c}`} x1={X(sp.from)} x2={X(sp.from)} y1={mt - 4} y2={mt + ph} stroke="#6b6b6b" strokeOpacity="0.45" strokeWidth="1" strokeDasharray="3 3" />
            ))}
            {[5000, 10000, 15000, 20000, 25000].map((v) => (
              <text key={v} x={X(v)} y={h - 4} textAnchor="middle" fontSize="9.5" fill="#6b6b6b">{v / 1000}k</text>
            ))}
            {[0.1, 0.2, 0.3, 0.4, 0.6, 0.7, 0.8, 0.9].map((v) => (
              <line key={`g${v}`} x1={ml} x2={ml + pw} y1={Y(v)} y2={Y(v)} stroke="#fff" strokeOpacity="0.22" strokeWidth="1" pointerEvents="none" />
            ))}
            {[0.25, 0.5, 0.75].map((v) => (
              <line key={`g${v}`} x1={ml} x2={ml + pw} y1={Y(v)} y2={Y(v)} stroke="#fff" strokeOpacity="0.4" strokeWidth="1" pointerEvents="none" />
            ))}
            {inside.map((l) => (
              <text key={`in${l.k}`} x={l.x} y={l.y} textAnchor="middle" dominantBaseline="central" fontSize={l.t >= 0.08 ? 11 : 10} fontWeight="600" fill={textOn(colors[names[l.k]] || "#9aa0a6")} pointerEvents="none">
                {disp(names[l.k])}
              </text>
            ))}
            {hp ? <line x1={gx} x2={gx} y1={mt - 2} y2={mt + ph} stroke="#1b1b1b" strokeWidth="1" pointerEvents="none" /> : null}
          </svg>
        ) : null}
        {tip}
      </div>
    </div>
  );
}

/** Trend: three stacked-area charts (size, type, area) over the whole number range; shares as in the heatmap. */
function TrendView({ binsByClass, pcls }) {
  const [hover, setHover] = useState(null);
  const all = useMemo(() => CLASSES.flatMap((c) => binsByClass[c]), [binsByClass]);
  const spans = useMemo(
    () =>
      CLASSES.map((c) => ({ c, from: binsByClass[c][0].from, to: binsByClass[c][binsByClass[c].length - 1].to + 1 })).sort((a, b) => a.from - b.from),
    [binsByClass]
  );
  const models = useMemo(() => BAR_DIMS.map(([dim, title]) => ({ title, model: trendModel(all, dim) })), [all]);
  return (
    <div className="sim-tr">
      <p className="sim-note sim-tr-sub">How the mix of what was picked changes as numbers go up.</p>
      {models.map(({ title, model }) => (
        <TrendChart key={model.dim} model={model} title={title} spans={spans} pcls={pcls} hover={hover} setHover={setHover} />
      ))}
      <p className="sim-note">Dotted outlines mark number ranges with too few picks to show. Hover or tap a chart to read a range.</p>
    </div>
  );
}

/** Trend, Buildings section: one more stacked-area chart (buildings as bands in area order), same axes / hover / gaps. */
function BldgTrend({ binsByClass }) {
  const [hover, setHover] = useState(null);
  const all = useMemo(() => CLASSES.flatMap((c) => binsByClass[c]), [binsByClass]);
  const spans = useMemo(
    () => CLASSES.map((c) => ({ c, from: binsByClass[c][0].from, to: binsByClass[c][binsByClass[c].length - 1].to + 1 })).sort((a, b) => a.from - b.from),
    [binsByClass]
  );
  const model = useMemo(() => trendModel(all, "bldg"), [all]);
  return (
    <div className="sim-tr">
      <TrendChart model={model} title="Buildings" spans={spans} pcls="all" hover={hover} setHover={setHover} big />
    </div>
  );
}

const PIE_W = 372;
/** Canvas geometry shared by Pie and the label bookkeeping for legends. */
const pieGeom = (big, bl) => {
  const R = big ? (bl ? 96 : 84) : 46;
  const W = big ? (bl ? 420 : PIE_W) : 96;
  return { R, W, cx: W / 2, cy: big ? R + 24 : 48, H: big ? 2 * R + 48 : 96 };
};
/** Names that get an outside label on a big pie (after label collisions are resolved). */
const pieLabeledNames = (shares, dim, labelMin) => {
  const g = pieGeom(true, dim === "bldg");
  return new Set(pieLabelLayout(pieSlices(shares), { cx: g.cx, cy: g.cy, r: g.R, minShare: labelMin }).map((l) => l.name));
};
const pieXY = (cx, cy, r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];

/**
 * One pie (plain SVG). Big pies: outside labels with leader lines (labelMin = smallest labeled slice); small pies: % inside slices
 * >= insideMin. dim "bldg": short names, area-aware tooltips, wider canvas and a bigger radius.
 */
function Pie({ shares, big, ariaLabel, few = false, dim = "", labelMin = 0.08, insideMin = 0.25 }) {
  const bl = dim === "bldg";
  const slices = pieSlices(shares);
  const { R, W, cx, cy, H } = pieGeom(big, bl);
  const r = R;
  const labels = big ? pieLabelLayout(slices, { cx, cy, r, minShare: labelMin }) : [];
  const nameOf = (n) => (bl ? shortName(n) : n);
  return (
    <svg className={big ? "sim-pie sim-pie-big" : "sim-pie sim-pie-sm"} style={bl && big ? { maxWidth: 420 } : undefined} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
      {few ? (
        <g>
          <circle cx={cx} cy={cy} r={r - 1} fill="#eee" fillOpacity="0.5" stroke="#bdb7b4" strokeDasharray="3 3" />
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize="11" fill="#7a7a7a">few picks</text>
        </g>
      ) : (
        <>
          {slices.map((sl) => {
            const tip = bl ? `${sl.name} (${areaOfLabel(sl.name)}): ${pct(sl.share)} (${fmt(sl.count)} spaces)` : `${sl.name}: ${pct(sl.share)} (${fmt(sl.count)} spaces)`;
            if (sl.share > 0.9999) return <circle key={sl.name} cx={cx} cy={cy} r={r} fill={sl.color} stroke="#fff" strokeWidth="1"><title>{tip}</title></circle>;
            const [x0, y0] = pieXY(cx, cy, r, sl.a0);
            const [x1, y1] = pieXY(cx, cy, r, sl.a1);
            return (
              <path key={sl.name} d={`M${cx},${cy}L${x0},${y0}A${r},${r} 0 ${sl.a1 - sl.a0 > Math.PI ? 1 : 0} 1 ${x1},${y1}Z`} fill={sl.color} stroke="#fff" strokeWidth="1">
                <title>{tip}</title>
              </path>
            );
          })}
          {!big
            ? slices
                .filter((sl) => sl.share >= insideMin)
                .map((sl) => {
                  const [lx, ly] = pieXY(cx, cy, r * 0.62, (sl.a0 + sl.a1) / 2);
                  return (
                    <text key={sl.name} x={lx} y={ly} textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="700" fill={textOn(sl.color)} pointerEvents="none">
                      {pct(sl.share)}
                    </text>
                  );
                })
            : null}
          {labels.map((l) => (
            <g key={l.name} pointerEvents="none">
              <polyline points={`${l.px},${l.py} ${l.ex},${l.ey} ${l.tx - l.side * 2},${l.ty}`} fill="none" stroke="#8a8378" strokeWidth="1" />
              <text x={l.tx} y={l.ty} textAnchor={l.side > 0 ? "start" : "end"} dominantBaseline="central" fontSize="11" fill="#1b1b1b">
                {nameOf(l.name)} {pct(l.share)}
              </text>
            </g>
          ))}
        </>
      )}
    </svg>
  );
}

/** Pies: "By class" (3x3 grid: class x size/type/area), then "By number range" (small pie per 1000-bin). */
function PiesView({ binsByClass, classes, selected }) {
  const [dim, setDim] = useState("size");
  const sharesOf = (bin, d) => pickShares(pickCounts(bin, d), d);
  const totals = Object.fromEntries(CLASSES.map((c) => [c, pickTotal(binsByClass[c])]));
  const namesFor = (d, list) => {
    const set = new Set();
    for (const b of list) if (b.n >= PICK_MIN) for (const x of sharesOf(b, d)) set.add(x.name);
    return set;
  };
  const dimNames = Object.fromEntries(BAR_DIMS.map(([d]) => [d, namesFor(d, CLASSES.map((c) => totals[c]))]));
  // legend lists only slices that have no outside label on any class pie
  const dimLabeled = Object.fromEntries(BAR_DIMS.map(([d]) => [d, new Set(CLASSES.flatMap((c) => (totals[c].n >= PICK_MIN ? [...pieLabeledNames(sharesOf(totals[c], d), d, 0.08)] : [])))]));
  const dimLegend = Object.fromEntries(BAR_DIMS.map(([d]) => [d, without(dimNames[d], dimLabeled[d])]));
  const dimPrefix = (d) => (dimLabeled[d].size ? "Also shown:" : "");
  const rangeNames = namesFor(dim, classes.flatMap((c) => binsByClass[c]));
  return (
    <div className="sim-pies">
      <h4 className="sim-h4">By class</h4>
      <p className="sim-note sim-hm-cap">All numbers combined.</p>
      <div className="sim-pg">
        <div className="sim-pg-head">
          <div />
          {BAR_DIMS.map(([d, title]) => (
            <div key={d} className="sim-pg-col">
              <div className="sim-bt-title">{title}</div>
              <Legend dim={d} names={dimLegend[d]} prefix={dimPrefix(d)} />
            </div>
          ))}
        </div>
        {CLASSES.map((c) => (
          <div key={c} className={`sim-pg-row ${selected !== "all" && selected !== c ? "sim-hm-dim" : ""}`.trim()}>
            <div className="sim-pg-rt">
              <strong>{CLASS_HEADS[c]}</strong>
              <span className="sim-hm-rn">{fmt(totals[c].n)} spaces</span>
            </div>
            {BAR_DIMS.map(([d, title]) => (
              <div key={d} className="sim-pg-cell">
                <div className="sim-pg-mt">
                  <div className="sim-bt-title">{title}</div>
                  <Legend dim={d} names={dimLegend[d]} prefix={dimPrefix(d)} />
                </div>
                <Pie shares={sharesOf(totals[c], d)} big ariaLabel={`${CLASS_HEADS[c]}, ${title}: ${sharesOf(totals[c], d).map((x) => `${x.name} ${pct(x.share)}`).join(", ")}`} />
              </div>
            ))}
          </div>
        ))}
      </div>

      <hr className="sim-hm-divider" />
      <h4 className="sim-h4">By number range</h4>
      <div className="sim-row sim-pr-show">
        <div className="filter-group">
          <span className="filter-group-label">Show by</span>
          <div className="sim-toggle" role="group" aria-label="Show by">
            {BAR_DIMS.map(([d, title]) => (
              <button key={d} type="button" className={`quick-filter-btn ${dim === d ? "sim-on" : ""}`.trim()} aria-pressed={dim === d} onClick={() => setDim(d)}>
                {title}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="sim-pr-legend">
        <Legend dim={dim} names={rangeNames} />
      </div>
      {classes.map((c) => (
        <section key={c} className="sim-pr-class" aria-label={`${CLASS_HEADS[c]} pies`}>
          <h5 className="sim-hm-ct">{CLASS_HEADS[c]}</h5>
          <div className="sim-pr-grid">
            {binsByClass[c].map((b) => (
              <div key={b.from} className="sim-pr-item">
                <Pie shares={sharesOf(b, dim)} few={b.n < PICK_MIN} dim={dim} ariaLabel={`${binLabel(b)}: ${b.n < PICK_MIN ? "few picks" : sharesOf(b, dim).map((x) => `${x.name} ${pct(x.share)}`).join(", ")}`} />
                <div className="sim-pr-l">{binLabel(b)}</div>
                <div className="sim-pr-n">n = {fmt(b.n)}</div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Room type x size crosstab of net spaces taken (same derivation as the rest of the tab). */
function CrossTab({ data, binsByClass, classes }) {
  const t = useMemo(() => pickCrossTab(binsByClass, classes), [binsByClass, classes.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const all = classes.length > 1;
  const who = all ? "all class" : `${CLASS_LABELS[classes[0]].toLowerCase()}`;
  const pre = Math.round(preInternalSpaces(data) / 100) * 100;
  return (
    <section className="sim-ct" aria-label="Room type by size">
      <h4 className="sim-h4">Room type x size (spaces taken)</h4>
      <div className="sim-ct-card">
        <table className="sim-table sim-heat">
          <colgroup>
            <col className="sim-ct-c0" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" style={{ textAlign: "left" }}>Room type</th>
              {t.sizes.map((sz) => (
                <th key={sz} scope="col">{sz}</th>
              ))}
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {t.rows.map((r) => (
              <tr key={r.key}>
                <th scope="row">{r.label}</th>
                {r.cells.map((n, i) => (
                  <td key={t.sizes[i]} style={{ background: n >= 0.5 ? `rgba(163,31,35,${(0.08 + 0.42 * (n / t.max)).toFixed(2)})` : undefined }}>
                    {fmt(n)}
                  </td>
                ))}
                <td className="sim-heat-total">{fmt(r.total)}</td>
              </tr>
            ))}
            {all ? (
              <tr className="sim-ct-totrow">
                <th scope="row">Total</th>
                {t.colTotals.map((n, i) => (
                  <td key={t.sizes[i]}>{fmt(n)}</td>
                ))}
                <td>{fmt(t.total)}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="sim-note sim-caveat">
        Counts are net spaces taken while {who} windows were the latest to open. Windows stay open, so late picks from earlier classes land in later
        windows. About {fmt(pre)} spaces were already gone before Internal began and are not attributed to any class.
      </p>
    </section>
  );
}

/** Pies, Buildings section: one pie per shown class, then (under a grouped legend) small pies per 1000-bin. */
function BldgPies({ binsByClass, classes, selected }) {
  const sharesOf = (bin) => pickShares(pickCounts(bin, "bldg"), "bldg");
  const totals = Object.fromEntries(CLASSES.map((c) => [c, pickTotal(binsByClass[c])]));
  const names = new Set();
  for (const b of classes.flatMap((c) => [totals[c], ...binsByClass[c]])) if (b.n >= PICK_MIN) for (const x of sharesOf(b)) names.add(x.name);
  // under the class pies: only buildings without an outside label; under the range pies nothing is named, so the full key
  const clsNames = new Set();
  const clsLabeled = new Set();
  for (const c of classes) {
    if (totals[c].n < PICK_MIN) continue;
    for (const x of sharesOf(totals[c])) clsNames.add(x.name);
    for (const n of pieLabeledNames(sharesOf(totals[c]), "bldg", 0.05)) clsLabeled.add(n);
  }
  return (
    <div className="sim-pk">
      <div className="sim-pk-grid" data-n={classes.length}>
        {classes.map((c) => (
          <div key={c} className={`sim-pk-cell ${selected !== "all" && selected !== c ? "sim-hm-dim" : ""}`.trim()}>
            <div className="sim-pk-t">
              <strong>{CLASS_HEADS[c]}</strong> <span className="sim-hm-rn">{fmt(totals[c].n)} spaces</span>
            </div>
            <Pie shares={sharesOf(totals[c])} big dim="bldg" labelMin={0.05} ariaLabel={`${CLASS_HEADS[c]}, buildings: ${sharesOf(totals[c]).filter((x) => x.share >= 0.05).map((x) => `${x.name} ${pct(x.share)}`).join(", ")}`} />
          </div>
        ))}
      </div>
      <BldgLegend names={without(clsNames, clsLabeled)} prefix={clsLabeled.size ? "Also shown:" : ""} />
      <div className="sim-pr-legend">
        <BldgLegend names={names} />
      </div>
      {classes.map((c) => (
        <section key={c} className="sim-pr-class" aria-label={`${CLASS_HEADS[c]} building pies`}>
          <h5 className="sim-hm-ct">{CLASS_HEADS[c]}</h5>
          <div className="sim-pr-grid">
            {binsByClass[c].map((b) => (
              <div key={b.from} className="sim-pr-item">
                <Pie shares={sharesOf(b)} few={b.n < PICK_MIN} dim="bldg" insideMin={0.3} ariaLabel={`${binLabel(b)}: ${b.n < PICK_MIN ? "few picks" : sharesOf(b).filter((x) => x.share >= 0.05).map((x) => `${x.name} ${pct(x.share)}`).join(", ")}`} />
                <div className="sim-pr-l">{binLabel(b)}</div>
                <div className="sim-pr-n">n = {fmt(b.n)}</div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Collapsible "Buildings" section at the bottom of every view; renders in the active view's style. */
function BuildingsSection({ open, setOpen, gview, binsByClass, classes, pcls }) {
  return (
    <details className="sim-bd" open={open} onToggle={(e) => e.currentTarget.open !== open && setOpen(e.currentTarget.open)}>
      <summary>
        <svg className="sim-bd-chev" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M5.5 3 L10.5 8 L5.5 13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="sim-bd-t">Buildings</span>
        <span className="sim-bd-hint">See which buildings these picks were in</span>
        <span className="sim-bd-right">
          <span className="sim-bd-dots" aria-hidden="true">
            {["Large dorms", "Brownstones", "Apartments", "StuVi"].map((a) => (
              <i key={a} style={{ background: PICK_DIMS.area.colors[a] }} />
            ))}
          </span>
          <span className="sim-bd-act">{open ? "Hide" : "Show"}</span>
        </span>
      </summary>
      {open ? (
        <div className="sim-bd-body">
          {gview === "heatmap" ? (
            <BuildingTable binsByClass={binsByClass} classes={classes} pcls={pcls} />
          ) : gview === "trend" ? (
            <BldgTrend binsByClass={binsByClass} />
          ) : gview === "pies" ? (
            <BldgPies binsByClass={binsByClass} classes={classes} selected={pcls} />
          ) : (
            <BldgBarsTable binsByClass={binsByClass} classes={classes} />
          )}
        </div>
      ) : null}
    </details>
  );
}

export default function SimulatorPicked({ data, phase, setPhase, pcls = "all", setPcls, gview = "pies", setGview, bld = false, setBld = null }) {
  const binsByClass = useMemo(() => Object.fromEntries(CLASSES.map((c) => [c, pickBins(data, phase, c)])), [data, phase]);
  const trend = gview === "trend";
  const shownCls = trend ? "all" : pcls; // Trend always shows every class
  const classes = shownCls === "all" ? CLASSES : [shownCls];
  const heat = gview === "heatmap";
  const fixedGroups = useMemo(() => heatGroups(data), [data]);
  // one-time dev note: buildings that are not in the building map
  useEffect(() => {
    if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV && !window.__simUnmappedLogged) {
      window.__simUnmappedLogged = true;
      const u = unmappedBuildings(data);
      if (u.length) console.info(`[simulator] buildings not in the building map (shown as "Other"): ${u.join(", ")}`);
    }
  }, [data]);
  // The controls row is sticky; its height offsets the sticky table headers below it
  const ctlRef = useRef(null);
  const rootRef = useRef(null);
  useEffect(() => {
    const el = ctlRef.current;
    if (!el || !rootRef.current) return undefined;
    const set = () => rootRef.current && rootRef.current.style.setProperty("--sim-ctl-h", `${Math.round(el.getBoundingClientRect().height)}px`);
    set();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Keep the page from getting shorter when a class chip shrinks the content, so the scroll position never jumps:
  // the tab keeps the tallest height seen for this phase/view (reset when those or the window size change).
  useEffect(() => {
    const reset = () => rootRef.current && (rootRef.current.style.minHeight = "");
    reset();
    window.addEventListener("resize", reset);
    return () => window.removeEventListener("resize", reset);
  }, [gview, phase]);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const h = Math.ceil(el.getBoundingClientRect().height);
    const cur = parseFloat(el.style.minHeight) || 0;
    if (h > cur) el.style.minHeight = `${h}px`;
  });
  const chips = (label, items, cur, set, off = false) => (
    <div className="filter-group">
      <span className="filter-group-label">{label}</span>
      <div className="sim-toggle" role="group" aria-label={label}>
        {items.map(([k, text]) => (
          <button key={k} type="button" className={`quick-filter-btn ${cur === k ? "sim-on" : ""}`.trim()} aria-pressed={cur === k} onClick={() => set(k)} disabled={off} title={off ? "Trend shows all classes" : undefined}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <div className="sim-oc" ref={rootRef}>
      <h3 className="sim-h3">What got picked, by number</h3>
      <p className="sim-note sim-oc-note">
        Spaces that disappeared as each number range came up last year. Net of drops and swaps; late picks by earlier numbers are mixed in, so treat
        it as an estimate.
      </p>

      <div className="sim-row sim-plan-controls sim-oc-controls" ref={ctlRef}>
        {chips("Phase", PHASE_CHIPS.map((p) => [p.key, p.label]), phase, setPhase)}
        {chips("Class year", [["all", "All"], ...CLASSES.map((c) => [c, CLASS_LABELS[c]])], shownCls, setPcls, trend)}
        {setGview ? chips("View", [["pies", "Pies"], ["bars", "Bars"], ["heatmap", "Heatmap"], ["trend", "Trend"]], gview, setGview) : null}
      </div>

      {heat ? (
        <HeatmapView binsByClass={binsByClass} classes={classes} groups={fixedGroups} selected={shownCls} onPick={setPcls} />
      ) : gview === "trend" ? (
        <TrendView binsByClass={binsByClass} pcls="all" />
      ) : gview === "pies" ? (
        <PiesView binsByClass={binsByClass} classes={classes} selected={shownCls} />
      ) : (
        <BarsTable binsByClass={binsByClass} classes={classes} selected={shownCls} />
      )}
      <p className="sim-note">The last range in each class also includes picks made after its final number, until the next class&apos;s window opened.</p>
      <CrossTab data={data} binsByClass={binsByClass} classes={classes} />
      {setBld ? <BuildingsSection open={bld} setOpen={setBld} gview={gview} binsByClass={binsByClass} classes={classes} pcls={shownCls} /> : null}
    </div>
  );
}
