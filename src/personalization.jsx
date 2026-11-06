import React, { useLayoutEffect } from "react";
import { Button, Card } from "./ui.jsx";
import "@fontsource-variable/inter";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/nunito-sans";
import "@fontsource-variable/roboto";
import "@fontsource-variable/source-serif-4";
import "@fontsource/atkinson-hyperlegible/latin-400.css";
import "@fontsource/atkinson-hyperlegible/latin-700.css";

const fonts = {
  "System font": "system-ui", Inter: '"Inter Variable"', "DM Sans": '"DM Sans Variable"',
  Manrope: '"Manrope Variable"', "Nunito Sans": '"Nunito Sans Variable"', Roboto: '"Roboto Variable"',
  "Source Serif 4": '"Source Serif 4 Variable"', "Atkinson Hyperlegible": '"Atkinson Hyperlegible"',
};
const palettes = {
  dark: { background: "#0c0c0c", foreground: "#f5f5f5", accent: "#ededed", header: "#171717" },
  light: { background: "#f8f8f8", foreground: "#171717", accent: "#242424", header: "#ececec" },
};
const defaults = {
  mode: "dark", font: "Manrope", contrast: 50, ui: 100, heading: 100, headerEnabled: false, palettes,
};
const storage = "sat-archive-appearance-v1";
const hex = /^#[0-9a-f]{6}$/i;
const range = (value, min, max, fallback) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;

export function readPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(storage)) ?? {};
    const mode = saved.mode === "light" ? "light" : "dark";
    const validated = Object.fromEntries(Object.entries(palettes).map(([mode, colors]) => [
      mode, Object.fromEntries(Object.entries(colors).map(([key, fallback]) => [key, hex.test(saved.palettes?.[mode]?.[key]) ? saved.palettes[mode][key] : fallback])),
    ]));
    return {
      ...defaults, mode, palettes: validated,
      font: Object.hasOwn(fonts, saved.font) ? saved.font : defaults.font,
      contrast: range(saved.contrast, 0, 100, 50), ui: range(saved.ui, 85, 140, 100),
      heading: range(saved.heading, 85, 155, 100),
      headerEnabled: saved.headerEnabled === true,
    };
  } catch { return defaults; }
}

function onColor(color) {
  const [r, g, b] = color.slice(1).match(/../g).map((byte) => {
    const n = parseInt(byte, 16) / 255;
    return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4;
  });
  return .2126 * r + .7152 * g + .0722 * b > .179 ? "#111111" : "#ffffff";
}

export function usePreferences(preferences) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const colors = preferences.palettes[preferences.mode];
    const set = (name, value) => root.style.setProperty("--" + name, value);
    root.dataset.theme = preferences.mode;
    set("ui-font", fonts[preferences.font] + ", sans-serif");
    set("background", colors.background);
    set("ink", colors.foreground);
    set("accent", colors.accent);
    set("on-accent", onColor(colors.accent));
    set("muted-strength", 52 + .42 * preferences.contrast + "%");
    set("border-strength", 12 + .32 * preferences.contrast + "%");
    set("ui-scale", preferences.ui / 100);
    set("heading-scale", preferences.heading / 100);
    set("dashboard-header", preferences.headerEnabled ? colors.header : "transparent");
    set("dashboard-ink", preferences.headerEnabled ? onColor(colors.header) : colors.foreground);
    root.dataset.dashboardHeader = String(preferences.headerEnabled);
    try { localStorage.setItem(storage, JSON.stringify(preferences)); } catch {}
  }, [preferences]);
}

function Slider({ label, value, min, max, onChange }) {
  return <label className="preference-slider"><span>{label}</span><output className="mono">{value}%</output>
    <input aria-label={label} type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} />
  </label>;
}

function Color({ label, value, onChange }) {
  return <label className="preference-color"><span>{label}</span><span className="mono">{value.toUpperCase()}</span>
    <input aria-label={label} type="color" value={value} onChange={(event) => onChange(event.target.value)} />
  </label>;
}

export function Personalization({ preferences: settings, onChange }) {
  const colors = settings.palettes[settings.mode];
  const set = (key, value) => onChange((old) => ({ ...old, [key]: value }));
  const color = (key, value) => onChange((old) => ({
    ...old, palettes: { ...old.palettes, [old.mode]: { ...old.palettes[old.mode], [key]: value } },
  }));
  const palette = (label, key) => <Color label={label} value={colors[key]} onChange={(value) => color(key, value)} />;
  return <Card className="panel personalization">
    <div className="panel-head"><div><h3>Personalization</h3><p>Adjust the appearance of this workspace.</p></div>
      <Button onClick={() => onChange(defaults)}>Restore appearance defaults</Button></div>
    <div className="preference-grid">
      <fieldset><legend>Theme and colors</legend>
        <div className="segmented theme-switch" aria-label="Color mode">{["dark", "light"].map((mode) =>
          <Button key={mode} variant="ghost" aria-pressed={settings.mode === mode} onClick={() => set("mode", mode)}>{mode === "dark" ? "Dark" : "Light"}</Button>)}</div>
        {palette("Background", "background")}{palette("Foreground", "foreground")}{palette("Accent", "accent")}
        <Slider label="Contrast" min={0} max={100} value={settings.contrast} onChange={(value) => set("contrast", value)} />
      </fieldset>
      <fieldset><legend>Typography</legend>
        <label className="field"><span>UI font</span><select aria-label="UI font" value={settings.font} onChange={(event) => set("font", event.target.value)}>{Object.keys(fonts).map((name) => <option key={name}>{name}</option>)}</select></label>
        <Slider label="UI font size" min={85} max={140} value={settings.ui} onChange={(value) => set("ui", value)} />
        <Slider label="Header font size" min={85} max={155} value={settings.heading} onChange={(value) => set("heading", value)} />
      </fieldset>
      <fieldset><legend>Dashboard header</legend>
        <label className="preference-check"><input type="checkbox" checked={settings.headerEnabled} onChange={(event) => set("headerEnabled", event.target.checked)} /> Custom background</label>
        {settings.headerEnabled && palette("Dashboard header background", "header")}
      </fieldset>
    </div>
  </Card>;
}
