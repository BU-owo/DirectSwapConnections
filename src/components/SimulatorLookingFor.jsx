/**
 * SimulatorLookingFor - "What are you looking for?" in My number.
 * Chip filters (size, kind, area; AND across rows, OR within a row) narrow the categories, then a table shows
 * what was open at the slot and how fast it went: +1 h, +6 h, +24 h, end of selection, a plain-English "gone by"
 * and a verdict chip. All numbers come from the interpolated openRooms series (t + delta clamped to the data's end).
 * Filters live in the URL (owned by the page). No export; category-level numbers only.
 */
import React, { useMemo, useState } from "react";
import {
  KIND_CHIPS,
  SIZE_CHIPS,
  VERDICTS,
  areaChips,
  buildingRollup,
  emptyState,
  formatClockDay,
  filtersActive,
  filterCategories,
  goneByText,
  lookingSummary,
  remainingKey,
  slotTable,
  sortSlotRows,
} from "../lib/simulator";

const fmt = (n) => Math.round(n).toLocaleString("en-US");
const KIND_LABEL = Object.fromEntries(KIND_CHIPS.map((k) => [k.key, k.label]));

/** One chip row: "Any" plus multi-select options. */
function ChipRow({ label, options, selected, onChange }) {
  const toggle = (key) => onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  return (
    <div className="sim-lf-row" role="group" aria-label={label}>
      <span className="filter-group-label sim-lf-label">{label}</span>
      <div className="sim-chips">
        <button type="button" className={`sim-preset ${selected.length === 0 ? "sim-preset-on" : ""}`.trim()} aria-pressed={selected.length === 0} onClick={() => onChange([])}>
          Any
        </button>
        {options.map((o) => {
          const on = selected.includes(o.key);
          return (
            <button key={o.key} type="button" className={`sim-preset ${on ? "sim-preset-on" : ""}`.trim()} aria-pressed={on} onClick={() => toggle(o.key)}>
              {on ? "✓ " : ""}{o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Empty-state card: none left (0 rooms) or basically none left (1-5 rooms; the rooms are listed beneath). */
function EmptyCard({ state, active, onClear, onApply }) {
  const { level, R, num, desc, lastSlot, wasOpen, closest } = state;
  const few = level === "few";
  return (
    <div className={`sim-emptycard ${few ? "sim-emptycard-few" : ""}`.trim()} role="status">
      <div className="sim-emptycard-title">{few ? "Basically none left." : "None left. Sorry."}</div>
      <p className="sim-emptycard-sub">
        {few
          ? `Last year, only ${R} ${desc.adj ? `${desc.adj} ` : ""}room${R === 1 ? " was" : "s were"}${desc.area ? ` in ${desc.area}` : ""} left by number ${num}.`
          : `Last year, no ${desc.adjArea} were open by number ${num}.`}
      </p>
      {level === "none" ? (
        <p className="sim-emptycard-when">
          {lastSlot
            ? `They were gone by about ${formatClockDay(lastSlot.t)} (around number ${lastSlot.n}).`
            : "None were open at any point in this window."}
        </p>
      ) : null}

      {wasOpen.length ? (
        <div className="sim-emptycard-sec">
          <div className="sim-emptycard-h">What WAS still open at your number</div>
          <ul className="sim-cards sim-cards-small">
            {wasOpen.map((r) => (
              <li key={r.cat.name} className="sim-card2">
                <span className="sim-card2-name">{r.cat.name}</span>
                <span className="sim-card2-line">{fmt(r.open)} open at your slot</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {closest ? (
        <div className="sim-emptycard-sec">
          <div className="sim-emptycard-h">Closest match</div>
          <p className="sim-emptycard-line">{closest.line}</p>
          <button type="button" className="quick-filter-btn sim-on" onClick={() => onApply(closest.filters)}>{closest.button}</button>
        </div>
      ) : null}

      {active ? (
        <div className="sim-emptycard-sec">
          <button type="button" className="btn-ghost-xs" onClick={onClear}>Clear filters</button>
        </div>
      ) : null}
    </div>
  );
}

const COLUMNS = [
  { key: "name", label: "Category" },
  { key: "open", label: "Open at your slot" },
  { key: "h1", label: "+1 hour" },
  { key: "h6", label: "+6 hours" },
  { key: "h24", label: "+24 hours" },
  { key: "end", label: "End of selection" },
  { key: "gone", label: "Gone by" },
  { key: "verdict", label: "Verdict" },
];

export default function SimulatorLookingFor({ data, t, phase, cls, num, filters, setFilters }) {
  const [sort, setSort] = useState({ key: "open", dir: "desc" });
  const chips = useMemo(() => areaChips(data), [data]);
  const areaOptions = chips.map((c) => ({ key: c.key, label: c.label }));
  const sizeOptions = SIZE_CHIPS.map((s) => ({ key: s, label: s }));

  const cats = useMemo(() => filterCategories(data, filters), [data, filters]);
  const all = useMemo(() => slotTable(data, t, cats, phase), [data, t, cats, phase]);
  const summary = lookingSummary(all);
  const rows = useMemo(() => {
    const shown = filters.hideZero ? all.filter((r) => r.open > 0) : all;
    return sortSlotRows(shown, sort.key, sort.dir);
  }, [all, filters.hideZero, sort]);
  const rollup = useMemo(() => buildingRollup(all), [all]);
  const empty = useMemo(
    () => (summary.R <= 5 && num ? emptyState(data, t, phase, cls, num, filters) : null),
    [summary.R, data, t, phase, cls, num, filters]
  );

  const set = (patch) => setFilters({ ...filters, ...patch });
  const clickHeader = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: key === "name" || key === "gone" ? "asc" : "desc" }));
  const ariaSort = (key) => (sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none");

  return (
    <section className="sim-lf" aria-label="What are you looking for?">
      <h3 className="sim-bucket-title">What are you looking for?</h3>
      <ChipRow label="Room size" options={sizeOptions} selected={filters.sizes} onChange={(sizes) => set({ sizes })} />
      <ChipRow label="Room kind" options={KIND_CHIPS} selected={filters.kinds} onChange={(kinds) => set({ kinds })} />
      <ChipRow label="Area" options={areaOptions} selected={filters.areas} onChange={(areas) => set({ areas })} />
      <label className="sim-check sim-lf-hide">
        <input type="checkbox" checked={filters.hideZero} onChange={(e) => set({ hideZero: e.target.checked })} />
        <span>Hide rows with 0 open at my slot</span>
      </label>

      {empty ? (
        <EmptyCard state={empty} active={filtersActive(filters)} onClear={() => set({ sizes: [], kinds: [], areas: [] })} onApply={(f) => set(f)} />
      ) : (
        <p className="sim-lf-summary" role="status">
          <strong>{fmt(summary.R)}</strong> rooms (<strong>{fmt(summary.S)}</strong> spaces) matching your filters were open at your slot,
          across <strong>{summary.B}</strong> building{summary.B === 1 ? "" : "s"}.
        </p>
      )}

      {rollup.length && rows.length ? (
        <details className="sim-rollup">
          <summary>By building</summary>
          <div className="sim-chips">
            {rollup.map((b) => (
              <span key={b.building} className="sim-rollchip">
                {b.building} <strong>{fmt(b.open)}</strong>
              </span>
            ))}
          </div>
        </details>
      ) : null}

      {rows.length && (summary.R > 0 || !filters.hideZero) ? (
        <div className="sim-scroll" tabIndex={0} role="region" aria-label="Matching categories, scrolls sideways">
          <table className="sim-table sim-lf-table">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.key} scope="col" className={c.key === "name" ? "sim-sticky" : ""} aria-sort={ariaSort(c.key)}>
                    <button type="button" className="sim-sortbtn" onClick={() => clickHeader(c.key)}>
                      {c.label}
                      <span aria-hidden="true">{sort.key === c.key ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const share = (v) => (r.raw.open0 > 0 ? v / r.raw.open0 : 0);
                const cell = (key, v, raw) => (
                  <td className={r.open > 0 ? `sim-cell sim-cell-${remainingKey(share(raw))}` : "sim-lf-zero"} title={r.open > 0 ? `${Math.round(share(raw) * 100)}% of the rooms open at your slot` : undefined}>
                    {fmt(v)}
                  </td>
                );
                return (
                  <tr key={r.cat.name}>
                    <th scope="row" className="sim-sticky">
                      <span className="sim-lf-name">{r.cat.name}</span>
                      <span className="sim-rowbtn-sub">
                        {r.cat.building} · {r.cat.size}, {KIND_LABEL[r.cat.kind] || r.cat.kind}
                        {r.cat.small ? <span className="sim-badge sim-badge-gray sim-lf-small">small sample</span> : null}
                      </span>
                    </th>
                    <td className="sim-lf-open">{fmt(r.open)}</td>
                    {cell("h1", r.h1, r.raw.h1)}
                    {cell("h6", r.h6, r.raw.h6)}
                    {cell("h24", r.h24, r.raw.h24)}
                    {cell("end", r.end, r.raw.end)}
                    <td className="sim-gone-text sim-lf-gone">{goneByText(r)}</td>
                    <td>
                      {r.verdict ? (
                        <span className={`sim-verdict sim-verdict-${r.verdict}`} title={VERDICTS[r.verdict].hint}>
                          {VERDICTS[r.verdict].label}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      <p className="sim-note">Based on last year&apos;s selection. Numbers and room supply will differ.</p>
    </section>
  );
}
