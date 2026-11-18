/**
 * SimulatorOverTime - the "Over time" tab of the Housing Selection Simulator.
 * Series are groups of categories (presets, group-by, custom filters, single categories); values are
 * summed across the group. The chart is hand-written SVG: shaded class-window bands on the x axis,
 * crosshair + tooltip (mouse and keyboard), clickable legend. Series state is lifted to the
 * page so it can live in the URL.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  MAX_SERIES,
  METRICS,
  PRESETS,
  RANGES,
  addSeries,
  addSeriesGroup,
  allSeriesPresent,
  autoName,
  domainIndices,
  formatTick,
  formatValue,
  groupSeriesValues,
  groupTotals,
  indexToTime,
  layoutWindowLabels,
  makeSeries,
  metricAvailable,
  niceTicks,
  parseSeriesParam,
  rangeDomain,
  uniqueValues,
  windowAt,
  windowBands,
  DEFAULT_SERIES_PARAM,
  formatTime,
} from "../lib/simulator";

// Okabe-Ito based, color-blind safe; every series also gets its own dash pattern.
const COLORS = ["#0072B2", "#D55E00", "#009E73", "#CC79A7", "#B8860B", "#56B4E9", "#222222", "#7B4BB0"];
const DASHES = ["", "8 4", "2 4", "10 4 2 4", "14 5", "4 3", "10 4 2 4 2 4", "1 6"];

/** Keep each series' color/dash slot stable while others are added or removed. */
function assignSlots(series, prev) {
  const next = {};
  const used = new Set();
  for (const s of series) if (prev[s.id] !== undefined) { next[s.id] = prev[s.id]; used.add(prev[s.id]); }
  for (const s of series) {
    if (next[s.id] === undefined) {
      let k = 0;
      while (used.has(k)) k++;
      next[s.id] = k;
      used.add(k);
    }
  }
  return next;
}

export default function SimulatorOverTime({ data, excludeNever, slotTime, series, setSeries, metric, setMetric }) {
  const { meta, categories } = data;
  const length = categories[0].openRooms.length;

  const [range, setRange] = useState("full");
  const [hidden, setHidden] = useState(() => new Set());
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [groupBy, setGroupBy] = useState("size");
  const [sel, setSel] = useState({ building: [], size: [], kind: [] });
  const [nameDraft, setNameDraft] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  const slotsRef = useRef({});

  const slots = (slotsRef.current = assignSlots(series, slotsRef.current));

  const computed = useMemo(
    () =>
      series.map((s) => ({
        ...s,
        slot: slots[s.id],
        totals: groupTotals(data, s, excludeNever),
        values: groupSeriesValues(data, s, metric, excludeNever),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, series, metric, excludeNever]
  );
  const visible = computed.filter((s) => !hidden.has(s.id));

  const domain = useMemo(() => rangeDomain(meta, range), [meta, range]);
  const [i0, i1] = domainIndices(meta, domain, length);

  // ── actions ──
  function add(list) {
    const r = addSeries(series, list);
    setSeries(r.list);
    setMessage(r.message);
  }
  function togglePreset(p) {
    if (series.some((s) => s.id === p.id)) {
      setSeries(series.filter((s) => s.id !== p.id));
      setMessage("");
    } else add([makeSeries(p.clauses, p.label)]);
  }
  function remove(id) {
    setSeries(series.filter((s) => s.id !== id));
    setMessage("");
  }
  function toggleHidden(id) {
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  const groupSeriesList = uniqueValues(categories, groupBy).map((v) => makeSeries({ [groupBy]: [v] }));
  const groupAllAdded = allSeriesPresent(series, groupSeriesList);
  function addGroupBy() {
    const r = addSeriesGroup(series, groupSeriesList);
    setSeries(r.list);
    setMessage(r.message);
  }
  function toggleSel(field, v) {
    setSel((s) => ({ ...s, [field]: s[field].includes(v) ? s[field].filter((x) => x !== v) : [...s[field], v] }));
  }
  const selClauses = Object.fromEntries(Object.entries(sel).filter(([, v]) => v.length));
  const hasSel = Object.keys(selClauses).length > 0;
  const builderName = nameEdited ? nameDraft : autoName(selClauses);
  const builderSeries = hasSel ? makeSeries(selClauses, builderName) : null;
  const builderTotals = builderSeries ? groupTotals(data, builderSeries, false) : null;
  function addCustom() {
    if (!builderSeries) return;
    if (!builderTotals.cats.length) {
      setMessage("No categories match those filters.");
      return;
    }
    add([builderSeries]);
    setSel({ building: [], size: [], kind: [] });
    setNameEdited(false);
    setNameDraft("");
  }

  const pool = categories;
  const matches = pool
    .filter((c) => !series.some((s) => s.id === `cat:${c.name}`) && c.name.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 8);

  const metricOpts = METRICS.filter((m) => metricAvailable(m.key, excludeNever));

  return (
    <div className="sim-time-view">
      {/* Metric + range + export */}
      <div className="sim-chart-controls">
        <div className="sim-toggle" role="group" aria-label="Metric">
          {metricOpts.map((m) => (
            <button key={m.key} type="button" className={`quick-filter-btn ${metric === m.key ? "sim-on" : ""}`.trim()} aria-pressed={metric === m.key} onClick={() => setMetric(m.key)}>
              {m.label}
            </button>
          ))}
        </div>
        <div className="sim-toggle" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button key={r.key} type="button" className={`quick-filter-btn ${range === r.key ? "sim-on" : ""}`.trim()} aria-pressed={range === r.key} onClick={() => setRange(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {!metricAvailable("empty", excludeNever) ? (
        <p className="sim-note">Fully empty rooms and open spaces are hidden while never-filled rooms are not shown.</p>
      ) : null}

      {/* Presets */}
      <div className="sim-subhead">Add a group</div>
      <div className="sim-chips" role="group" aria-label="Presets">
        {PRESETS.map((p) => {
          const on = series.some((s) => s.id === p.id);
          return (
            <button key={p.id} type="button" className={`sim-preset ${on ? "sim-preset-on" : ""}`.trim()} aria-pressed={on} onClick={() => togglePreset(p)}>
              {on ? "✓ " : "+ "}{p.label}
            </button>
          );
        })}
      </div>

      <div className="sim-adders">
        <div className="sim-adder">
          <label className="filter-group-label" htmlFor="sim-groupby">Add a line for every...</label>
          <div className="sim-adder-row">
            <select id="sim-groupby" className="sim-select" value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
              <option value="size">size (single, double, triple, quad)</option>
              <option value="building">building</option>
              <option value="kind">room type (apt, dorm, suite...)</option>
            </select>
            <button type="button" className="quick-filter-btn" onClick={addGroupBy} disabled={groupAllAdded}>Add all</button>
            {groupAllAdded ? <span className="sim-adder-state">Already added</span> : null}
          </div>
          <span className="sim-helper">Adds a separate line for each option, e.g. one line per building.</span>
        </div>
        <div className="sim-adder sim-picker">
          <label className="filter-group-label" htmlFor="sim-cat-search">Single category</label>
          <input
            id="sim-cat-search"
            className="sim-input sim-input-wide"
            type="search"
            autoComplete="off"
            placeholder="Search categories…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
          />
          {focused && matches.length ? (
            <ul className="sim-suggest">
              {matches.map((c) => (
                <li key={c.name}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      add([makeSeries({ cat: [c.name] })]);
                      setQuery("");
                    }}
                  >
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <details className="sim-builder">
        <summary>Custom group (building, size and kind filters combined with AND)</summary>
        <div className="sim-builder-grid">
          {[
            ["building", "Building"],
            ["size", "Size"],
            ["kind", "Kind"],
          ].map(([field, label]) => (
            <fieldset key={field} className="sim-fieldset">
              <legend>{label}</legend>
              <div className="sim-checklist">
                {uniqueValues(categories, field).map((v) => (
                  <label key={v} className="sim-check">
                    <input type="checkbox" checked={sel[field].includes(v)} onChange={() => toggleSel(field, v)} />
                    <span>{v}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        <div className="sim-builder-foot">
          <div className="sim-namefield">
            <label className="filter-group-label" htmlFor="sim-group-name">Series name</label>
            <input
              id="sim-group-name"
              className="sim-input"
              type="text"
              value={builderName}
              disabled={!hasSel}
              onChange={(e) => {
                setNameDraft(e.target.value);
                setNameEdited(true);
              }}
            />
          </div>
          <button type="button" className="quick-filter-btn" onClick={addCustom} disabled={!hasSel}>Add group</button>
          {builderTotals ? (
            <span className="sim-note sim-inline">
              {builderTotals.cats.length} categories, {builderTotals.rooms.toLocaleString("en-US")} rooms
            </span>
          ) : null}
        </div>
      </details>

      {message ? <div className="msg sim-limit" role="status">{message}</div> : null}
      <p className="sim-note">
        {series.length} of {MAX_SERIES} series. Each line sums the rooms in its group; percentages divide by the group&apos;s rooms open when selection began.
      </p>

      {/* Legend */}
      {series.length ? (
        <ul className="sim-legend-chips" aria-label="Series legend">
          {computed.map((s) => {
            const off = hidden.has(s.id);
            return (
              <li key={s.id} className={`sim-lchip ${off ? "sim-lchip-off" : ""}`.trim()}>
                <button type="button" className="sim-lchip-main" aria-pressed={!off} onClick={() => toggleHidden(s.id)} title={off ? "Show series" : "Hide series"}>
                  <svg width="30" height="10" aria-hidden="true">
                    <line x1="1" x2="29" y1="5" y2="5" stroke={COLORS[s.slot % COLORS.length]} strokeWidth="2.5" strokeDasharray={DASHES[s.slot % DASHES.length]} strokeLinecap="round" />
                  </svg>
                  <span className="sim-lchip-name">{s.name}</span>
                  <span className="sim-lchip-n">{s.totals.denom.toLocaleString("en-US")} rooms</span>
                </button>
                <button type="button" className="sim-lchip-x" aria-label={`Remove ${s.name}`} onClick={() => remove(s.id)}>×</button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {/* Chart or empty state */}
      {series.length === 0 ? (
        <div className="sim-empty">
          <p>No series to chart yet. Pick a preset above, or start with the default set.</p>
          <button type="button" className="quick-filter-btn sim-on" onClick={() => { setSeries(parseSeriesParam(DEFAULT_SERIES_PARAM)); setMessage(""); }}>
            Use default set (singles, doubles, apartments)
          </button>
        </div>
      ) : (
        <LineChart
          data={data}
          series={visible}
          allHidden={visible.length === 0}
          colorOf={(s) => COLORS[s.slot % COLORS.length]}
          dashOf={(s) => DASHES[s.slot % DASHES.length]}
          metric={metric}
          domain={domain}
          i0={i0}
          i1={i1}
          slotTime={slotTime}
        />
      )}
    </div>
  );
}

const truncate = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Hand-written SVG line chart. */
function LineChart({ data, series, allHidden, colorOf, dashOf, metric, domain, i0, i1, slotTime }) {
  const { meta } = data;
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState(null); // grid index

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const update = () => setWidth(Math.max(260, Math.floor(el.clientWidth)));
    update();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const narrow = width < 560;
  const H = narrow ? 360 : 520;
  const left = narrow ? 40 : 48;
  const right = width >= 760 ? 128 : 14;
  const top = 18;
  const xOf = (t) => left + ((t - domain[0]) / (domain[1] - domain[0])) * (width - left - right);

  const bands = windowBands(meta, domain);
  const labels = layoutWindowLabels(bands, xOf, { left, right: width - right, compact: narrow });
  const rowsUsed = labels.length ? Math.max(...labels.map((l) => l.row)) + 1 : 1;
  const bottom = 14 + rowsUsed * 26 + 8;
  const ih = H - top - bottom;
  const iw = width - left - right;
  const plotBottom = top + ih;

  const maxVal = Math.max(0, ...series.flatMap((s) => s.values.slice(i0, i1 + 1)));
  const axis = metric === "pct" ? { ticks: [0, 0.25, 0.5, 0.75, 1], max: 1 } : niceTicks(maxVal);
  const y = (v) => top + ih - (v / axis.max) * ih;

  const clampIdx = (i) => Math.max(i0, Math.min(i1, i));
  const idxAtPx = (px) => clampIdx(i0 + Math.round(((px - left) / iw) * (i1 - i0)));
  const xOfIdx = (i) => xOf(indexToTime(meta, i));

  function onMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    if (px < left - 4 || px > width - right + 4) return setHover(null);
    setHover(idxAtPx(px));
  }
  function onKey(e) {
    const big = e.shiftKey ? 8 : 1;
    const from = hover === null ? i1 : hover;
    let next = null;
    if (e.key === "ArrowRight") next = from + big;
    else if (e.key === "ArrowLeft") next = from - big;
    else if (e.key === "Home") next = i0;
    else if (e.key === "End") next = i1;
    else if (e.key === "Escape") {
      setHover(null);
      return;
    } else return;
    e.preventDefault();
    setHover(clampIdx(next));
  }

  // End-of-line labels, nudged apart vertically
  const endLabels = [];
  if (right >= 100 && !allHidden) {
    const items = series.map((s) => ({ s, y: y(s.values[i1]) })).sort((a, b) => a.y - b.y);
    let prev = -Infinity;
    for (const it of items) {
      const yy = Math.max(it.y, prev + 13);
      endLabels.push({ ...it, ly: yy });
      prev = yy;
    }
    // shift up if the stack ran past the plot bottom
    const over = (endLabels.length ? endLabels[endLabels.length - 1].ly : 0) - plotBottom;
    if (over > 0) endLabels.forEach((l) => (l.ly -= over));
  }

  const hoverTime = hover !== null ? indexToTime(meta, hover) : null;
  const hx = hover !== null ? xOfIdx(hover) : 0;
  const tipW = 220;
  const tipLeft = hover !== null ? (hx > width / 2 ? hx - tipW - 12 : hx + 12) : 0;
  const communityX = meta.communityOpensAt >= domain[0] && meta.communityOpensAt <= domain[1] ? xOf(meta.communityOpensAt) : null;
  const slotX = Number.isFinite(slotTime) && slotTime >= domain[0] && slotTime <= domain[1] ? xOf(slotTime) : null;

  return (
    <div className="sim-chart" ref={wrapRef} style={{ minHeight: 320 }}>
      <svg
        viewBox={`0 0 ${width} ${H}`}
        width={width}
        height={H}
        role="application"
        tabIndex={0}
        aria-label="Availability over time. Use left and right arrow keys to move the crosshair, shift for larger steps, Escape to clear."
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKey}
        className="sim-svg"
      >
        {/* window bands */}
        {bands.map((b, k) => (
          <rect
            key={b.key}
            x={xOf(b.start)}
            y={top}
            width={Math.max(1, xOf(b.end) - xOf(b.start))}
            height={ih}
            className={`sim-band sim-band-${b.phase}-${k % 2}`}
          />
        ))}
        {/* y grid + labels */}
        {axis.ticks.map((v) => (
          <g key={v}>
            <line x1={left} x2={width - right} y1={y(v)} y2={y(v)} className="sim-grid" />
            <text x={left - 6} y={y(v) + 4} textAnchor="end" className="sim-axis">{formatTick(metric, v)}</text>
          </g>
        ))}
        <line x1={left} x2={left} y1={top} y2={plotBottom} className="sim-axis-line" />
        <line x1={left} x2={width - right} y1={plotBottom} y2={plotBottom} className="sim-axis-line" />

        {/* window labels */}
        {labels.map((l, k) => (
          <g key={l.key}>
            <line x1={xOf(bands[k].start)} x2={xOf(bands[k].start)} y1={plotBottom} y2={plotBottom + 6 + l.row * 26} className="sim-window-line" />
            <text x={l.x + 2} y={plotBottom + 18 + l.row * 26} className="sim-axis sim-axis-win">{l.text}</text>
            <text x={l.x + 2} y={plotBottom + 29 + l.row * 26} className="sim-axis sim-axis-date">{l.date}</text>
          </g>
        ))}

        {/* markers */}
        {communityX !== null ? (
          <g>
            <line x1={communityX} x2={communityX} y1={top} y2={plotBottom} className="sim-community-line" />
            <text x={Math.min(communityX + 4, width - right - 84)} y={top + 11} className="sim-axis sim-axis-community">Community opens</text>
          </g>
        ) : null}
        {slotX !== null ? (
          <g>
            <line x1={slotX} x2={slotX} y1={top} y2={plotBottom} className="sim-slot-line" />
            <text x={Math.min(slotX + 4, width - right - 50)} y={top + 25} className="sim-axis sim-axis-slot">your slot</text>
          </g>
        ) : null}

        {/* lines */}
        {series.map((s) => {
          const pts = [];
          for (let i = i0; i <= i1; i++) pts.push(`${xOfIdx(i).toFixed(1)},${y(s.values[i]).toFixed(1)}`);
          return (
            <polyline
              key={s.id}
              fill="none"
              stroke={colorOf(s)}
              strokeWidth="2.4"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={dashOf(s)}
              points={pts.join(" ")}
            />
          );
        })}
        {endLabels.map((l) => (
          <text key={l.s.id} x={width - right + 6} y={l.ly + 4} className="sim-endlabel" fill={colorOf(l.s)}>
            <title>{l.s.name}</title>
            {truncate(l.s.name, 18)}
          </text>
        ))}

        {allHidden ? (
          <text x={left + iw / 2} y={top + ih / 2} textAnchor="middle" className="sim-axis sim-axis-slot">
            All series are hidden. Click a legend chip to show one.
          </text>
        ) : null}

        {/* crosshair */}
        {hover !== null && !allHidden ? (
          <g>
            <line x1={hx} x2={hx} y1={top} y2={plotBottom} className="sim-hover-line" />
            {series.map((s) => (
              <circle key={s.id} cx={hx} cy={y(s.values[hover])} r="4" fill="#fff" stroke={colorOf(s)} strokeWidth="2" />
            ))}
          </g>
        ) : null}
      </svg>

      {hover !== null && !allHidden ? (
        <div className="sim-tip" style={{ left: Math.max(4, Math.min(tipLeft, width - tipW - 4)), width: tipW }} aria-live="polite">
          <div className="sim-tip-time">{formatTime(hoverTime)}</div>
          <div className="sim-tip-win">{windowAt(meta, hoverTime)}</div>
          {series.map((s) => (
            <div key={s.id} className="sim-tip-row">
              <svg width="22" height="8" aria-hidden="true">
                <line x1="1" x2="21" y1="4" y2="4" stroke={colorOf(s)} strokeWidth="2.5" strokeDasharray={dashOf(s)} strokeLinecap="round" />
              </svg>
              <span className="sim-tip-name">{s.name}</span>
              <strong>{formatValue(metric, s.values[hover])}</strong>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
