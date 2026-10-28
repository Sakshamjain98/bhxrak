import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, AlertTriangle, CalendarDays, CheckCircle2, RefreshCw, Wind } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import "./styles.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const fmt = (n) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(n);
const shortDate = (value) => new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

function Metric({ label, value, suffix, tone = "" }) {
  return <div className={`metric ${tone}`}><span>{label}</span><strong>{value}{suffix}</strong></div>;
}

function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`${API}/api/analysis?start=2026-01-01&end=2026-01-31`);
      if (!response.ok) throw new Error(await response.text());
      const payload = await response.json();
      setData(payload); setLastUpdated(new Date());
    } catch (e) { setError("Could not load Elexon data. Check that the API is running and try again."); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const daily = useMemo(() => {
    if (!data) return [];
    const groups = {};
    data.points.forEach((point) => {
      const key = point.startTime.slice(0, 10);
      groups[key] ||= { date: key, actual: 0, forecast: 0, count: 0 };
      groups[key].actual += point.actual; groups[key].forecast += point.forecast; groups[key].count += 1;
    });
    return Object.values(groups).map((d) => ({ ...d, actual: d.actual / d.count, forecast: d.forecast / d.count }));
  }, [data]);

  return <div className="app">
    <header className="topbar"><div className="brand"><div className="brandmark"><Wind size={20}/></div><div><b>WINDLENS</b><small>DAY-AHEAD INTELLIGENCE</small></div></div><div className="topmeta"><span className="live-dot"/> ELEXON BMRS <button onClick={load} aria-label="Refresh data"><RefreshCw size={16}/></button></div></header>
    <main>
      <section className="hero"><div><p className="eyebrow">PORTFOLIO CONTROL ROOM / JANUARY 2026</p><h1>Renewable generation,<br/><em>made actionable.</em></h1><p className="lede">A decision-ready view of UK national wind generation forecasts and their measured accuracy.</p></div><div className="status-card"><div className="status-icon"><CheckCircle2/></div><div><b>Decision window open</b><span>Latest forecast cut-off · 18:00 UTC prior day</span></div></div></section>
      {loading && <div className="loading">Loading January 2026 from Elexon BMRS…</div>}
      {error && <div className="error"><AlertTriangle size={18}/>{error}<button onClick={load}>Retry</button></div>}
      {data && <><section className="metrics"><Metric label="Mean absolute error" value={fmt(data.metrics.mae)} suffix=" MW"/><Metric label="RMSE" value={fmt(data.metrics.rmse)} suffix=" MW"/><Metric label="Forecast bias" value={`${data.metrics.bias > 0 ? "+" : ""}${fmt(data.metrics.bias)}`} suffix=" MW" tone={data.metrics.bias > 0 ? "warning" : ""}/><Metric label="Data coverage" value={data.metrics.coverage} suffix="%"/></section>
      <section className="panel chart-panel"><div className="panel-head"><div><p className="eyebrow">DELIVERY PROFILE</p><h2>Forecast vs actual generation</h2></div><div className="date-pill"><CalendarDays size={15}/> 01 Jan — 31 Jan 2026</div></div><div className="chart-wrap"><ResponsiveContainer width="100%" height={330}><AreaChart data={daily}><defs><linearGradient id="actual" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#52d6a5" stopOpacity=".35"/><stop offset="100%" stopColor="#52d6a5" stopOpacity="0"/></linearGradient><linearGradient id="forecast" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7d8cff" stopOpacity=".2"/><stop offset="100%" stopColor="#7d8cff" stopOpacity="0"/></linearGradient></defs><CartesianGrid stroke="#24304b" vertical={false}/><XAxis dataKey="date" tickFormatter={shortDate} stroke="#71809d" tickLine={false} axisLine={false} minTickGap={30}/><YAxis stroke="#71809d" tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v/1000)}k`}/><Tooltip labelFormatter={(v) => new Date(v).toLocaleDateString("en-GB",{dateStyle:"medium"})} formatter={(v) => [`${fmt(v)} MW`]} contentStyle={{background:"#151e33",border:"1px solid #2b3a5a",borderRadius:8}}/><Legend/><Area type="monotone" dataKey="actual" name="Actual wind" stroke="#52d6a5" fill="url(#actual)" strokeWidth={2}/><Area type="monotone" dataKey="forecast" name="Day-ahead forecast" stroke="#7d8cff" fill="url(#forecast)" strokeWidth={2}/></AreaChart></ResponsiveContainer></div></section>
      <section className="lower"><div className="panel insight"><p className="eyebrow">PROCUREMENT SIGNAL</p><h2>Plan with a <em>{fmt(data.metrics.recommendedBuffer)} MW</em> confidence buffer</h2><p>January's mean absolute error is the recommended upward planning allowance when wind output is used to offset demand. Recalibrate this buffer as more delivery data arrives.</p><div className="insight-foot"><Activity size={18}/> Based on {fmt(data.metadata.intervals)} matched delivery intervals</div></div><div className="panel methodology"><p className="eyebrow">METHODOLOGY</p><h2>Transparent by design</h2><dl><div><dt>Actuals</dt><dd>FUELHH · WIND only</dd></div><div><dt>Forecast</dt><dd>WINDFOR · latest by 18:00 UTC</dd></div><div><dt>Accuracy</dt><dd>MAE, RMSE, bias & MAPE</dd></div></dl><a href="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream" target="_blank" rel="noreferrer">View source dataset ↗</a></div></section>
      <footer><span>WindLens pilot · Data supplied by Elexon BMRS</span>{lastUpdated && <span>Refreshed {lastUpdated.toLocaleTimeString("en-GB")}</span>}</footer></>}
    </main>
  </div>;
}
createRoot(document.getElementById("root")).render(<App />);
