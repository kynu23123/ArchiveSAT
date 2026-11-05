import React from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ordinal, percentile } from "./data.js";

export const num = (value) => value == null ? "—" : Number(value).toLocaleString("en-US");
export const bands = [
  { label: "Very low", min: 0, max: 5 },
  { label: "Below average", min: 5, max: 25 },
  { label: "Average", min: 25, max: 75 },
  { label: "Above average", min: 75, max: 95 },
  { label: "High", min: 95, max: 99 },
  { label: "Very high", min: 99, max: 100 },
];
const ticks = [5, 25, 50, 75, 95, 99];

function ScoreTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return <div className="chart-tip"><strong>{point.name}</strong>
    <span>Verbal <b className="mono">{num(point.verbal)}</b></span>
    <span>Math <b className="mono">{num(point.math)}</b></span>
    <span>Total <b className="mono">{num(point.total)}</b></span>
  </div>;
}

export function ScoreChart({ results }) {
  const points = [...results].reverse().filter((result) => result.total != null).map((result) => ({
    date: result.date, name: result.form.title, total: result.total,
    verbal: result.sections.find(({ name }) => name === "Verbal").scaled,
    math: result.sections.find(({ name }) => name === "Math").scaled,
  }));
  if (!points.length) return <div className="empty-chart">Complete a two-section test to plot your scores.</div>;
  return <>
    <div className="area-chart" role="img" aria-label={points.map((point) => point.date + " " + point.name + ", Verbal " + point.verbal + ", Math " + point.math + ", total " + point.total).join(". ")}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 12, right: 16, bottom: 1, left: -11 }}>
          <CartesianGrid vertical={false} stroke="#292929" strokeDasharray="3 4" />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={11} tick={{ fill: "#9d9d9d", fontSize: 10 }} padding={{ left: 5, right: 5 }} />
          <YAxis domain={[0, 1600]} ticks={[0, 400, 800, 1200, 1600]} tickLine={false} axisLine={false} tickMargin={8} tick={{ fill: "#9d9d9d", fontSize: 10 }} tickFormatter={num} />
          <Tooltip content={<ScoreTooltip />} cursor={{ stroke: "#696969", strokeDasharray: "3 4" }} />
          <Area dataKey="math" stackId="sat" type="monotone" stroke="#818181" strokeWidth={1.5} fill="#3b3b3b" fillOpacity={0.9} activeDot={{ r: 4, fill: "#a3a3a3", stroke: "#141414" }} dot={points.length === 1} isAnimationActive={false} />
          <Area dataKey="verbal" stackId="sat" type="monotone" stroke="#ededed" strokeWidth={2} fill="#777" fillOpacity={0.73} activeDot={{ r: 4, fill: "#fff", stroke: "#141414" }} dot={points.length === 1} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
    <div className="chart-legend"><span><i /> Verbal</span><span><i /> Math</span></div>
  </>;
}

const angle = (p) => Math.PI * (1 - p / 100);
function coordinates(p, r) {
  return [120 + Math.cos(angle(p)) * r, 119 - Math.sin(angle(p)) * r];
}
function arc(start, end, r) {
  const [sx, sy] = coordinates(start, r);
  const [ex, ey] = coordinates(end, r);
  return "M " + sx + " " + sy + " A " + r + " " + r + " 0 0 1 " + ex + " " + ey;
}

export function Gauge({ iq, rank }) {
  const percent = rank == null ? 0 : rank;
  const [x, y] = coordinates(percent, 82);
  return <div className="gauge">
    <svg viewBox="0 0 240 143" role="img" aria-label={rank == null ? "No percentile yet" : ordinal(rank) + " percentile"}>
      <path d={arc(0, 100, 82)} className="gauge-track" />
      {rank != null && <path d={arc(0, percent, 82)} className="gauge-fill" />}
      {ticks.map((tick) => {
        const [x1, y1] = coordinates(tick, 94);
        const [x2, y2] = coordinates(tick, 99);
        return <line key={tick} x1={x1} y1={y1} x2={x2} y2={y2} className="gauge-tick"><title>{tick}th percentile</title></line>;
      })}
      {rank != null && <circle cx={x} cy={y} r="4" fill="#fff" />}
      <text x="120" y="97" className="gauge-number" textAnchor="middle">{num(iq)}</text>
      <text x="120" y="116" className="gauge-caption" textAnchor="middle">{ordinal(rank)}{rank == null ? "" : " percentile"}</text>
      <text x="29" y="137" className="gauge-end">5th</text>
      <text x="201" y="137" className="gauge-end" textAnchor="end">99th</text>
    </svg>
  </div>;
}

export function Distribution({ iq }) {
  const rank = percentile(iq);
  const current = rank == null ? null : bands.find((band) => rank < band.max);
  const curve = Array.from({ length: 121 }, (_, i) => {
    const value = 55 + i * 0.75;
    const height = Math.exp(-0.5 * ((value - 100) / 15) ** 2);
    return [28 + i * 4.25, 148 - height * 114];
  });
  const outline = curve.map(([x, y], i) => (i ? "L" : "M") + x + "," + y).join(" ");
  const pin = iq == null ? null : 28 + (Math.min(145, Math.max(55, iq)) - 55) / 90 * 510;
  return <>
    <svg className="distribution mono" viewBox="0 0 566 184" role="img" aria-label={current ? ordinal(rank) + " percentile, " + current.label + " band" : "Illustrative normal distribution"}>
      <path d={outline + " L538,148 L28,148 Z"} fill="#242424" />
      <path d={outline} fill="none" stroke="#8f8f8f" strokeWidth="1.5" />
      <path d="M28 148 H538" stroke="#3d3d3d" />
      {[55, 70, 85, 100, 115, 130, 145].map((n, i) => <text key={n} x={28 + i * 85} y="172" textAnchor="middle" fill="#aaa" fontSize="11">{n}</text>)}
      {pin != null && <><path d={"M" + pin + " 30 V148"} stroke="#fff" strokeDasharray="4 4" /><circle cx={pin} cy="30" r="4" fill="#fff" /></>}
    </svg>
    <div className="band-bar" aria-hidden="true">{bands.map((band) => <span key={band.label} className={band === current ? "current" : ""} style={{ flexGrow: band.max - band.min }} />)}</div>
    <div className="band-list">{bands.map((band) => <div key={band.label} className={band === current ? "current" : ""}><span>{band.label}</span><span className="mono">{band.min}–{band.max}%</span></div>)}</div>
  </>;
}
