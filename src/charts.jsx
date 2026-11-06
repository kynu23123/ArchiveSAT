import React, { useEffect, useState } from "react";
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

export function CountingNumber({ value, format = num, svg = false }) {
  const [number, setNumber] = useState(value);
  useEffect(() => {
    if (value == null || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setNumber(value);
      return;
    }
    const start = performance.now();
    let frame;
    const tick = (time) => {
      const progress = Math.min((time - start) / 760, 1);
      setNumber(value * (1 - (1 - progress) ** 3));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    setNumber(0);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  if (svg) return <tspan>{format(number == null ? null : Math.round(number))}</tspan>;
  return <><span className="sr-only">{format(value)}</span><span aria-hidden="true">{format(number)}</span></>;
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

export function Gauge({ iq, rank, animate = false }) {
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
      {rank != null && <circle cx={x} cy={y} r="4" fill="var(--accent)" />}
      <text x="120" y="97" className="gauge-number" textAnchor="middle">{animate ? <CountingNumber value={iq} svg /> : num(iq)}</text>
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
    const value = 55 + i;
    const height = Math.exp(-0.5 * ((value - 100) / 15) ** 2);
    return [28 + i * 4.25, 148 - height * 114];
  });
  const outline = curve.map(([x, y], i) => (i ? "L" : "M") + x + "," + y).join(" ");
  const pin = iq == null ? null : 28 + (Math.min(175, Math.max(55, iq)) - 55) / 120 * 510;
  return <>
    <svg className="distribution mono" viewBox="0 0 566 184" role="img" aria-label={current ? ordinal(rank) + " percentile, " + current.label + " band" : "Illustrative normal distribution"}>
      <path d={outline + " L538,148 L28,148 Z"} fill="var(--shade-3)" />
      <path d={outline} fill="none" stroke="var(--muted)" strokeWidth="1.5" />
      <path d="M28 148 H538" stroke="var(--line)" />
      {[55, 70, 85, 100, 115, 130, 145, 160, 175].map((n, i) => <text key={n} x={28 + i * 63.75} y="172" textAnchor="middle" fill="var(--muted)" fontSize="11">{n}</text>)}
      {pin != null && <><path d={"M" + pin + " 30 V148"} stroke="var(--accent)" strokeDasharray="4 4" /><circle cx={pin} cy={30} r="4" fill="var(--accent)" /></>}
    </svg>
    <div className="band-bar" aria-hidden="true">{bands.map((band) => <span key={band.label} className={band === current ? "current" : ""} style={{ flexGrow: band.max - band.min }} />)}</div>
    <div className="band-list">{bands.map((band) => <div key={band.label} className={band === current ? "current" : ""}><span>{band.label}</span><span className="mono">{band.min}–{band.max}%</span></div>)}</div>
  </>;
}
