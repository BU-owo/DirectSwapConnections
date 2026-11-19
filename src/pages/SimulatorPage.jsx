/**
 * Simulator Page - Housing Selection Simulator
 * Three views: Plan ahead (how long each kind of room lasted, and what number it took), My number (what
 * was likely available at a slot) and Explore (availability over time for groups of categories).
 * Client-side only: fetches /data/availability.json at runtime; nothing is stored or sent anywhere.
 * Deep link: #/simulator?view=plan|number|explore&class=senior&phase=community&num=5018
 *   plan view: &plan=internal|community|both   filters (My number): &size=Single,Double&kind=Apt,Dorm&area=stuvi,brown&hide0=0   what people got: &pclass=senior|junior|soph (omit = All)&gview=bars|heatmap|trend (omit = Pies)&bld=1   explore: &series=...&metric=...&shown=0
 */
import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import SimulatorMyNumber from "../components/SimulatorMyNumber";
import SimulatorPicked from "../components/SimulatorPicked";
import SimulatorOverTime from "../components/SimulatorOverTime";
import SimulatorPlan from "../components/SimulatorPlan";
import {
  CLASSES,
  CLASS_LABELS,
  DEFAULT_SERIES_PARAM,
  METRICS,
  PHASES,
  PHASE_LABELS,
  PLAN_PHASES,
  classForNumber,
  knownSeriesValues,
  loadAvailability,
  metricAvailable,
  numberGroups,
  numberToTime,
  parseSeriesParam,
  serializeSeries,
  filtersActive,
  filtersFromParams,
  filtersToParams,
  formatSlot,
  validateNumber,
} from "../lib/simulator";

const VIEWS = [
  { key: "plan", label: "Plan ahead" },
  { key: "number", label: "My number" },
  { key: "explore", label: "Explore" },
  { key: "got", label: "What people got" },
];
// Links from earlier versions of the page
const PHASE_HELP = {
  internal: "Students picking within their current building or group.",
  community: "Open to everyone, across all buildings.",
};
const LEGACY_VIEW = { class: "plan", slot: "number", community: "number", time: "explore" };
export default function SimulatorPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");

  // Inputs (prefilled from the deep link)
  const [phase, setPhase] = useState(searchParams.get("phase") === "internal" ? "internal" : "community");
  const [numStr, setNumStr] = useState(searchParams.get("num") || "");
  const [cls, setCls] = useState(CLASSES.includes(searchParams.get("class")) ? searchParams.get("class") : "");
  // Plan ahead is the default; a link that carries a number (and no view) opens My number.
  const rawView = searchParams.get("view");
  const [view, setView] = useState(() => {
    const v = LEGACY_VIEW[rawView] || rawView;
    if (VIEWS.some((x) => x.key === v)) return v;
    return searchParams.get("num") ? "number" : "plan";
  });
  const [planPhase, setPlanPhase] = useState(PLAN_PHASES.includes(searchParams.get("plan")) ? searchParams.get("plan") : "both");
  // "What people got": which rooms disappeared as each number range came up (derived from availability.json)
  const [pcls, setPcls] = useState(CLASSES.includes(searchParams.get("pclass")) ? searchParams.get("pclass") : "all");
  // Pies (default), Bars, Heatmap or Trend; kept in the URL as gview=bars|heatmap|trend (Pies = no parameter) so each can be linked
  const [gview, setGview] = useState(["bars", "heatmap", "trend"].includes(searchParams.get("gview")) ? searchParams.get("gview") : "pies");
  // What got picked: the collapsible Buildings section (shared by every view; bld=1 when open)
  const [bld, setBld] = useState(searchParams.get("bld") === "1");
  // My number: "What are you looking for?" filters (kept in the URL)
  const [filters, setFilters] = useState(() => filtersFromParams((k) => searchParams.get(k)));
  // Explore: show never-filled rooms (default on; off subtracts the leftover L from numerator and denominator)
  const [showNever, setShowNever] = useState(searchParams.get("shown") !== "0");
  const excludeNever = !showNever;

  // Explore chart state (lives in the URL: series=size:Single,kind:Apt,building:StuVi1+StuVi2&metric=pct)
  // Parsed once data is in (needs known values to repair a literal "+" the URL decoded into a space).
  const [rawSeries] = useState(() => (searchParams.has("series") ? searchParams.get("series") : DEFAULT_SERIES_PARAM));
  const [series, setSeries] = useState(null);
  const [metric, setMetric] = useState(METRICS.some((m) => m.key === searchParams.get("metric")) ? searchParams.get("metric") : "pct");

  useEffect(() => {
    let cancelled = false;
    loadAvailability()
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setLoadError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (data && series === null) setSeries(parseSeriesParam(rawSeries, knownSeriesValues(data)));
  }, [data, series, rawSeries]);

  // Link without a class: infer it from the number once data is in.
  useEffect(() => {
    if (data && !cls) {
      const n = Number(numStr);
      setCls(classForNumber(data.meta, n) || "senior");
    }
  }, [data, cls, numStr]);

  // Keep the URL shareable (local only; replaces history entry)
  useEffect(() => {
    const next = new URLSearchParams();
    next.set("view", view);
    next.set("phase", phase);
    if (cls) next.set("class", cls);
    if (numStr) next.set("num", numStr);
    if (view === "plan") next.set("plan", planPhase);
    if (view === "got") {
      if (pcls !== "all") next.set("pclass", pcls);
      if (gview !== "pies") next.set("gview", gview);
      if (bld) next.set("bld", "1");
    }
    if (view === "number") filtersToParams(filters, (k, v) => next.set(k, v));
    if (view === "explore") {
      next.set("series", series === null ? rawSeries : serializeSeries(series));
      next.set("metric", metric);
      if (!showNever) next.set("shown", "0");
    }
    setSearchParams(next, { replace: true });
  }, [phase, cls, numStr, view, planPhase, pcls, gview, bld, filters, series, rawSeries, metric, showNever, setSearchParams]);

  // Metrics that need every room are unavailable while never-filled rooms are hidden.
  useEffect(() => {
    if (!metricAvailable(metric, excludeNever)) setMetric("pct");
  }, [metric, excludeNever]);

  const meta = data ? data.meta : null;
  const numError = data && cls && numStr !== "" ? validateNumber(meta, cls, numStr) : "";
  const num = data && cls && numStr !== "" && !numError ? Number(numStr) : null;
  const numberTime = num ? numberToTime(data.anchors, phase, num) : NaN;
  const slotTime = numberTime;
  const hasSlot = Number.isFinite(slotTime);
  const lowConfidence = phase === "internal";
  const groups = useMemo(() => (data && cls ? numberGroups(meta, cls) : []), [data, meta, cls]);
  const currentGroup = num ? groups.find((g) => num >= g.lo && num <= g.hi) : null;

  function chooseGroup(e) {
    const g = groups.find((x) => x.label === e.target.value);
    if (g) setNumStr(String(g.mid));
  }

  return (
    <>
    <header className="sim-banner">
      <div className="sim-banner-inner">
        <div className="sim-kicker">BU HOUSING</div>
        <h1 className="sim-banner-title">Selection Simulator</h1>
        <p className="sim-banner-sub">
          See how long each kind of room lasted last year, and what was still open when your housing number came up.
        </p>
      </div>
    </header>
    <section className="panel sim-page">
      <div className="msg sim-disclaimer">
        Based on last year&apos;s (Spring 2026) selection data. It is not a prediction of this year.
      </div>

      {loadError ? <div className="msg msg-error" role="alert">{loadError}</div> : null}
      {!data && !loadError ? <p className="sim-status">Loading availability data…</p> : null}

      {data && cls ? (
        <>
          {/* View tabs */}
          <div className="sim-tabs" role="tablist" aria-label="Views">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                role="tab"
                aria-selected={view === v.key}
                className={`sim-tab ${view === v.key ? "sim-tab-on" : ""}`.trim()}
                onClick={() => setView(v.key)}
              >
                {v.label}
              </button>
            ))}
          </div>

          {view === "plan" ? (
            <SimulatorPlan
              data={data}
              cls={cls}
              setCls={setCls}
              planPhase={planPhase}
              setPlanPhase={setPlanPhase}
              onJump={(g) => {
                setSeries([g]);
                setView("explore");
              }}
            />
          ) : null}

          {view === "number" ? (
            <>
              {/* Inputs */}
              <div className="sim-card">
                <div className="sim-row">
                  <div className="filter-group">
                    <span className="filter-group-label">Phase</span>
                    <div className="sim-toggle" role="group" aria-label="Selection phase">
                      {PHASES.map((p) => (
                        <button key={p} type="button" className={`quick-filter-btn ${phase === p ? "sim-on" : ""}`.trim()} aria-pressed={phase === p} onClick={() => setPhase(p)}>
                          {PHASE_LABELS[p]}
                        </button>
                      ))}
                    </div>
                    <span className="sim-helper">{PHASE_HELP[phase]}</span>
                  </div>

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
                    <label className="filter-group-label" htmlFor="sim-num">
                      Housing number ({meta.classRanges[cls][0]}-{meta.classRanges[cls][1]})
                    </label>
                    <input
                      id="sim-num"
                      className="sim-input"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder={`e.g. ${Math.round((meta.classRanges[cls][0] + meta.classRanges[cls][1]) / 2)}`}
                      value={numStr}
                      onChange={(e) => setNumStr(e.target.value.trim())}
                      aria-invalid={Boolean(numError)}
                      aria-describedby={numError ? "sim-num-err" : undefined}
                    />
                  </div>

                  <div className="filter-group">
                    <label className="filter-group-label" htmlFor="sim-group">Or pick a 1000-group</label>
                    <select id="sim-group" className="sim-select" value={currentGroup ? currentGroup.label : ""} onChange={chooseGroup}>
                      <option value="">Choose a range…</option>
                      {groups.map((g) => <option key={g.label} value={g.label}>{g.label}</option>)}
                    </select>
                  </div>
                </div>

                {/* Your slot: one line */}
                <div className="sim-time">
                  {numError ? (
                    <div id="sim-num-err" className="sim-field-error sim-slot-error" role="alert">{numError}</div>
                  ) : hasSlot ? (
                    <div className="sim-time-sub sim-slot-line-text">
                      Your slot last year: about <strong>{formatSlot(slotTime)}</strong> (number {num}). Dates will shift next year.
                      {lowConfidence ? <span className="sim-badge sim-badge-warn">low confidence</span> : null}
                    </div>
                  ) : (
                    <div className="sim-time-sub">Enter a housing number or pick a group to see your slot.</div>
                  )}
                </div>
              </div>

              {hasSlot ? (
                <SimulatorMyNumber data={data} t={slotTime} phase={phase} cls={cls} num={num} filters={filters} setFilters={setFilters} />
              ) : (
                <p className="sim-status">Enter a valid housing number above to see what was likely available at your slot.</p>
              )}
            </>
          ) : null}

          {view === "explore" && series ? (
            <>
              <div className="sim-toolbar">
                <label className="sim-check">
                  <input type="checkbox" checked={showNever} onChange={(e) => setShowNever(e.target.checked)} /> Show never-filled rooms
                </label>
              </div>
              <p className="sim-note">
                Percentages are rooms open divided by the rooms open when selection began, so every line starts at 100%.{" "}
                {showNever
                  ? "Rooms that never filled are included, so lines level off above zero."
                  : "Never-filled rooms are removed from both the count and the baseline, so lines fall to zero."}
              </p>
              <SimulatorOverTime
                data={data}
                excludeNever={excludeNever}
                slotTime={Number.isFinite(numberTime) ? numberTime : NaN}
                series={series}
                setSeries={setSeries}
                metric={metric}
                setMetric={setMetric}
              />
            </>
          ) : null}

          {view === "got" ? (
            <SimulatorPicked data={data} phase={phase} setPhase={setPhase} pcls={pcls} setPcls={setPcls} gview={gview} setGview={setGview} bld={bld} setBld={setBld} />
          ) : null}
        </>
      ) : null}

      <p className="sim-swaplink">
        Looking to swap rooms? <Link to="/browse">Browse listings</Link>
      </p>
    </section>
    </>
  );
}
