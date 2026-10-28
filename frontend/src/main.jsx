import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, AlertTriangle, CalendarDays, Clock, RefreshCw, Wind } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import "./styles.css";

// Same-origin by default: Vite proxy in dev, nginx in Docker, rewrites on Vercel.
const API = import.meta.env.VITE_API_URL || "";
const fmt = (n) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(n);
const signed = (n) => `${n > 0 ? "+" : ""}${fmt(n)}`;
const utc = (value, opts) => new Date(value).toLocaleString("en-GB", { timeZone: "UTC", ...opts });
const shortDate = (v) => utc(v, { day: "2-digit", month: "short" });
const hhmm = (v) => utc(v, { hour: "2-digit", minute: "2-digit" });
const kw = (v) => `${v / 1000}k`;
const axis = { stroke: "#71809d", tickLine: false, axisLine: false };
const tooltipStyle = { contentStyle: { background: "#151e33", border: "1px solid #2b3a5a", borderRadius: 8 }, formatter: (v) => [`${fmt(v)} MW`] };

function Metric({ label, value, suffix, hint, tone = "" }) {
  return <div className={`metric ${tone}`}><span>{label}</span><strong>{value}{suffix}</strong>{hint && <small>{hint}</small>}</div>;
}

function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [cutoff, setCutoff] = useState(9);
  const [day, setDay] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`${API}/api/analysis?start=2026-01-01&end=2026-01-31&cutoff_hour=${cutoff}`);
      if (!response.ok) throw new Error(await response.text());
      setData(await response.json());
    } catch { setError("Could not load Elexon data. Check that the API is running and try again."); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [cutoff]);

  const days = useMemo(() => [...new Set((data?.points || []).map((p) => p.decisionDate))], [data]);
  const selected = day && days.includes(day) ? day : days[days.length - 1];
  const dayPoints = useMemo(() => (data?.points || []).filter((p) => p.decisionDate === selected), [data, selected]);
  const dayMae = dayPoints.length ? dayPoints.reduce((s, p) => s + Math.abs(p.error), 0) / dayPoints.length : 0;
  const m = data?.metrics;

  return <div className="app">
    <header className="topbar"><div className="brand"><div className="brandmark"><Wind size={20}/></div><div><b>WINDLENS</b><small>DAY-AHEAD INTELLIGENCE</small></div></div><div className="topmeta"><span className="live-dot"/> ELEXON BMRS <button onClick={load} aria-label="Refresh data"><RefreshCw size={16}/></button></div></header>
    <main>
      <section className="hero">
        <div><p className="eyebrow">DAY-AHEAD DESK / DECISIONS IN JANUARY 2026</p><h1>Renewable generation,<br/><em>made actionable.</em></h1><p className="lede">The wind forecast your desk actually had at decision time, set against what the wind actually did — and what that error means for your day-ahead purchase.</p></div>
        <label className="status-card"><div className="status-icon"><Clock/></div><div><b>Decision cutoff (UK time, day before delivery)</b>
          <select value={cutoff} onChange={(e) => setCutoff(Number(e.target.value))} aria-label="Decision cutoff hour">
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00{h === 9 ? " · before auction gate closure" : ""}</option>)}
          </select></div></label>
      </section>
      {loading && <div className="loading">Loading January 2026 from Elexon BMRS…</div>}
      {error && <div className="error"><AlertTriangle size={18}/>{error}<button onClick={load}>Retry</button></div>}
      {data && <>
        <section className="metrics">
          <Metric label="Mean absolute error" value={fmt(m.mae)} suffix=" MW" hint={`${m.nmae}% of mean wind output`}/>
          <Metric label="RMSE" value={fmt(m.rmse)} suffix=" MW" hint="Penalises large misses"/>
          <Metric label="Forecast bias" value={signed(m.bias)} suffix=" MW" tone={m.bias > 0 ? "warning" : ""} hint={m.bias > 0 ? "Forecast runs high: wind under-delivers" : "Forecast runs low"}/>
          <Metric label="P10 / P90 error" value={`${signed(m.p10)} / ${signed(m.p90)}`} suffix="" hint="80% of hours fall in this band"/>
        </section>

        <section className="panel">
          <div className="panel-head"><div><p className="eyebrow">DECISION DAY EXPLORER</p><h2>What you knew vs what happened</h2></div>
            <label className="date-pill"><CalendarDays size={15}/> Decision on
              <select value={selected} onChange={(e) => setDay(e.target.value)} aria-label="Decision date">{days.map((d) => <option key={d} value={d}>{shortDate(d)}</option>)}</select>
            </label></div>
          <p className="sub">Delivery day {dayPoints[0] && shortDate(dayPoints[0].startTime)} · forecast published {dayPoints[0] && `${shortDate(dayPoints[0].publishTime)} ${hhmm(dayPoints[0].publishTime)}`} · day MAE {fmt(dayMae)} MW</p>
          <div className="chart-wrap"><ResponsiveContainer width="100%" height={300}><LineChart data={dayPoints}><CartesianGrid stroke="#24304b" vertical={false}/><XAxis dataKey="startTime" tickFormatter={hhmm} {...axis} minTickGap={20}/><YAxis {...axis} tickFormatter={kw}/><Tooltip labelFormatter={(v) => `${shortDate(v)} ${hhmm(v)} UTC`} {...tooltipStyle}/><Legend/><Line dataKey="actual" name="Actual wind" stroke="#52d6a5" strokeWidth={2} dot={false} isAnimationActive={false}/><Line dataKey="forecast" name="Forecast at decision time" stroke="#7d8cff" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false}/></LineChart></ResponsiveContainer></div>
        </section>

        <section className="panel chart-panel">
          <div className="panel-head"><div><p className="eyebrow">DELIVERY PROFILE · HOURLY</p><h2>Forecast vs actual generation</h2></div><div className="date-pill"><CalendarDays size={15}/> {shortDate(data.metadata.deliveryStart)} — {shortDate(data.metadata.deliveryEnd)} 2026</div></div>
          <div className="chart-wrap"><ResponsiveContainer width="100%" height={330}><LineChart data={data.points}><CartesianGrid stroke="#24304b" vertical={false}/><XAxis dataKey="startTime" tickFormatter={shortDate} {...axis} minTickGap={40}/><YAxis {...axis} tickFormatter={kw}/><Tooltip labelFormatter={(v) => `${shortDate(v)} ${hhmm(v)} UTC`} {...tooltipStyle}/><Legend/><Line dataKey="actual" name="Actual wind" stroke="#52d6a5" strokeWidth={1.5} dot={false} isAnimationActive={false}/><Line dataKey="forecast" name="Day-ahead forecast" stroke="#7d8cff" strokeWidth={1.5} dot={false} isAnimationActive={false}/></LineChart></ResponsiveContainer></div>
        </section>

        <section className="lower">
          <div className="panel insight"><p className="eyebrow">PROCUREMENT SIGNAL</p><h2>Hold a <em>{fmt(m.recommendedBuffer)} MW</em> wind shortfall buffer</h2>
            <p>In 9 of 10 delivery hours, wind fell short of the decision-time forecast by no more than this. Procure it on top of (demand − forecast wind) to avoid buying the gap back at imbalance prices. The forecast ran {fmt(Math.abs(m.bias))} MW {m.bias > 0 ? "high" : "low"} on average.</p>
            <div className="insight-foot"><Activity size={18}/> {fmt(data.metadata.intervals)} matched delivery hours · {m.coverage}% coverage</div></div>
          <div className="panel"><p className="eyebrow">WHEN IS IT WORST?</p><h2>MAE by delivery hour (UTC)</h2>
            <ResponsiveContainer width="100%" height={220}><BarChart data={data.byHour}><XAxis dataKey="hour" {...axis} interval={3}/><YAxis {...axis} tickFormatter={kw}/><Tooltip labelFormatter={(h) => `${String(h).padStart(2, "0")}:00`} {...tooltipStyle} cursor={{ fill: "#1c2842" }}/><Bar dataKey="mae" fill="#7d8cff" radius={[3, 3, 0, 0]}/></BarChart></ResponsiveContainer></div>
        </section>

        <section className="panel methodology"><p className="eyebrow">METHODOLOGY</p><h2>Transparent by design</h2><dl>
          <div><dt>Actuals</dt><dd>Elexon FUELHH · fuelType WIND · half-hourly, matched on the hour</dd></div>
          <div><dt>Forecast</dt><dd>Elexon WINDFOR · latest publish at or before {String(data.metadata.cutoffHour).padStart(2, "0")}:00 on D-1 (no look-ahead)</dd></div>
          <div><dt>Window</dt><dd>Decisions 1–31 Jan 2026 → delivery 2 Jan – 1 Feb 2026</dd></div>
          <div><dt>Error</dt><dd>forecast − actual · MAE, RMSE, bias, P10/P90</dd></div></dl>
          <a href="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream" target="_blank" rel="noreferrer">View source dataset ↗</a></section>
        <footer><span>WindLens pilot · Data supplied by Elexon BMRS</span><span>All times UTC (= UK time in January)</span></footer>
      </>}
    </main>
  </div>;
}
createRoot(document.getElementById("root")).render(<App />);
