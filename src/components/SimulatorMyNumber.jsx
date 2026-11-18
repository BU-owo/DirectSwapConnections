/**
 * SimulatorMyNumber - the "My number" view for a slot at time t.
 * Headline: everything that was still open. Then the filters/table, the picking panel and three tabs that sort every
 * category with one rule: Plenty / A few left / Toss-up / Gone (see classifyRoom in lib/simulator.js).
 * Cards show rooms open at the slot, what was taken around it and what was left at the end, plus tag chips.
 */
import React, { useMemo, useState } from "react";
import SimulatorLookingFor from "./SimulatorLookingFor";
import {
  afterSlot,
  classifyCategories,
  bucketSummary,
  defaultBucketTab,
  filterBuckets,
  formatEndDay,
  openAtSlot,
  pickingAround,
  pickingWindow,
  cardInfo,
} from "../lib/simulator";

const fmt = (n) => Math.round(n).toLocaleString("en-US");
const BUCKETS = [
  {
    key: "plenty",
    title: "Plenty",
    hint: "10 or more open at your slot, and either at least half of them never got taken or they were not being drained fast.",
    cls: "plenty",
  },
  { key: "few", title: "A few left", hint: "1-9 open at your slot. Some are likely there, but too few to count on.", cls: "few" },
  { key: "toss", title: "Toss-up", hint: "Being drained: lots taken around your slot, or most of the open rooms got taken before selection ended.", cls: "some" },
  { key: "gone", title: "Gone", hint: "None open at your slot.", cls: "gone" },
];

/** Segmented tabs (Likely available / Hit or miss / Probably gone) with count badges and the cards for the active one. */
function BucketTabs({ items }) {
  const counts = Object.fromEntries(BUCKETS.map((x) => [x.key, items[x.key].length]));
  const auto = defaultBucketTab(items);
  const [chosen, setChosen] = useState(null);
  const tab = chosen || auto;
  const b = BUCKETS.find((x) => x.key === tab);
  const list = items[tab];
  return (
    <section className="sim-tabsec" aria-label="Room types by how likely they were available">
      <p className="sim-tabsummary" role="status">{bucketSummary(items)}</p>
      <p className="sim-note sim-define">
        Rooms nobody took by the end of selection count as &lsquo;still open at the end&rsquo;.
      </p>
      <div className="sim-segtabs" role="tablist" aria-label="Availability buckets">
        {BUCKETS.map((x) => (
          <button
            key={x.key}
            type="button"
            role="tab"
            id={`sim-segtab-${x.key}`}
            aria-selected={tab === x.key}
            aria-controls="sim-segpanel"
            className={`sim-segtab sim-segtab-${x.cls} ${tab === x.key ? "sim-segtab-on" : ""}`.trim()}
            onClick={() => setChosen(x.key)}
          >
            {x.title} <span className="sim-bucket-n">{counts[x.key]}</span>
          </button>
        ))}
      </div>
      <div id="sim-segpanel" role="tabpanel" aria-labelledby={`sim-segtab-${tab}`} className={`sim-segpanel sim-segpanel-${b.cls}`}>
        <p className="sim-bucket-hint">{b.hint}</p>
        {list.length === 0 ? (
          <p className="sim-bucket-none">None at this number.</p>
        ) : (
          <ul className="sim-cards">
            {list.map((it) => {
              const info = cardInfo(it);
              return (
                <li key={it.cat.name} className={`sim-card2 ${tab === "plenty" ? "sim-card2-likely" : ""}`.trim()}>
                  <span className="sim-card2-name">{it.cat.name}</span>
                  <span className="sim-card2-x">{info.x}</span>
                  <span className="sim-card2-line">{info.taken}</span>
                  <span className="sim-card2-line">{info.left}</span>
                  {info.tags.length ? (
                    <span className="sim-tags">
                      {info.tags.map((tg) => (
                        <span key={tg.label} className={`sim-tag sim-tag-${tg.cls}`}>{tg.label}</span>
                      ))}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="sim-note sim-info">
        Rooms nobody took, especially singles, may be reserved or limited to certain groups. This data can&apos;t confirm eligibility.
      </p>
    </section>
  );
}

/** Top-10 list with bars scaled to the top row. */
function PickList({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.taken));
  return (
    <ol className="sim-picklist">
      {rows.map((r) => (
        <li key={r.cat.name}>
          <span className="sim-pick-name">{r.cat.name}</span>
          <span className="sim-pick-bar" aria-hidden="true">
            <i style={{ width: `${(r.taken / max) * 100}%` }} />
          </span>
          <strong>{fmt(r.taken)}</strong>
        </li>
      ))}
    </ol>
  );
}

/** "What people were picking around your slot": +/-1 hour, or the whole window. */
function Picking({ data, t, phase, cls }) {
  const [mode, setMode] = useState("around");
  const around = useMemo(() => pickingAround(data, t, phase), [data, t, phase]);
  const whole = useMemo(() => pickingWindow(data, `${phase}_${cls}`), [data, phase, cls]);
  const cur = mode === "around" ? around : whole;
  return (
    <section className="sim-picking" aria-label="What people were picking around your slot">
      <h3 className="sim-bucket-title">What people were picking around your slot</h3>
      <div className="sim-toggle sim-picking-toggle" role="group" aria-label="Time span">
        <button type="button" className={`sim-chip-btn ${mode === "around" ? "sim-chip-btn-on" : ""}`.trim()} aria-pressed={mode === "around"} onClick={() => setMode("around")}>
          Around your slot (+/-1 hour)
        </button>
        <button type="button" className={`sim-chip-btn ${mode === "window" ? "sim-chip-btn-on" : ""}`.trim()} aria-pressed={mode === "window"} onClick={() => setMode("window")}>
          Whole window
        </button>
      </div>
      {cur.total < 20 ? <p className="sim-bucket-hint"><strong>Very little was taken around this slot.</strong></p> : null}
      {cur.rows.length ? <PickList rows={cur.rows} /> : null}
      <p className="sim-note">Net spaces that disappeared. Includes picks by other numbers in the same stretch. Estimate.</p>
    </section>
  );
}

export default function SimulatorMyNumber({ data, t, phase, cls, num, filters, setFilters }) {
  const result = useMemo(() => classifyCategories(data, t, phase), [data, t, phase]);
  const open = useMemo(() => openAtSlot(data, t), [data, t]);
  const after = useMemo(() => afterSlot(data, t), [data, t]);
  const neverTotal = result.never.reduce((a, r) => a + r.L, 0);
  const endLabel = formatEndDay(data.meta);

  // Filters (size / kind / area) narrow the tab contents and counts too
  const items = useMemo(() => filterBuckets(data, result, filters), [data, result, filters]);

  return (
    <div className="sim-mynum">
      <div className="sim-headline" role="status">
        <div className="sim-headline-main">
          At this slot last year: <strong>{fmt(open.rooms)}</strong> rooms (<strong>{fmt(open.spaces)}</strong> spaces) were still open.
        </div>
        {open.top.length ? (
          <ol className="sim-top5" aria-label="Categories with the most open rooms">
            {open.top.map((r) => (
              <li key={r.cat.name}>
                <span>{r.cat.name}</span> <strong>{fmt(r.open)}</strong>
              </li>
            ))}
          </ol>
        ) : null}
      </div>

      <SimulatorLookingFor data={data} t={t} phase={phase} cls={cls} num={num} filters={filters} setFilters={setFilters} />

      <Picking data={data} t={t} phase={phase} cls={cls} />

      <BucketTabs items={items} />

      <details className="sim-after" aria-label="Over the next 24 hours">
        <summary>Over the next 24 hours</summary>
        {after.total < 1 ? (
          <p className="sim-bucket-hint">No more spaces were taken after this slot in the data.</p>
        ) : (
          <>
            <p className="sim-bucket-hint">
              About <strong>{fmt(after.total)}</strong> net spaces were taken in the 24 hours after this slot. Top categories:
            </p>
            <ol className="sim-top5 sim-top10">
              {after.rows.map((r) => (
                <li key={r.cat.name}>
                  <span>{r.cat.name}</span> <strong>{fmt(r.taken)}</strong>
                </li>
              ))}
            </ol>
          </>
        )}
        <p className="sim-note">Includes late picks from earlier numbers; estimate.</p>
      </details>

      <details className="sim-never-section">
        <summary>
          Never filled last year <span className="sim-bucket-n">{result.never.length}</span>
        </summary>
        <p className="sim-bucket-hint">
          Still open on {endLabel} ({fmt(neverTotal)} rooms). Some rooms may have eligibility limits not visible in this data. They are not
          counted in the groups above.
        </p>
        <ul className="sim-never-list">
          {result.never.map((r) => (
            <li key={r.cat.name}>
              <span>{r.cat.name}</span>
              <strong>{r.L}</strong>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
