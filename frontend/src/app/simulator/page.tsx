"use client";
import { useState, useEffect, useCallback } from "react";
import AppShell from "@/components/layout/AppShell";
import {
  TestTube2, Play, BarChart2, AlertTriangle,
  CheckCircle, ChevronDown, ChevronUp, Download,
  Zap, Users, TrendingUp, ShieldAlert, Globe
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Survey { id: string; name: string; }

type SimMode = "volume" | "edgecases" | "review";

const MODES = [
  {
    id: "volume" as SimMode,
    label: "Volume Simulation",
    icon: Users,
    color: "blue",
    desc: "Generate N statistically shaped household records using numpy/scipy distributions calibrated to HCES 2022-23 reference data.",
    badge: "numpy · scipy",
  },
  {
    id: "edgecases" as SimMode,
    label: "Edge Case Generator",
    icon: ShieldAlert,
    color: "amber",
    desc: "Generate outlier and adversarial records — missing values, implausible ages, cross-field inconsistencies — to test DQ validation rules.",
    badge: "DQ testing",
  },
  {
    id: "review" as SimMode,
    label: "Questionnaire Review",
    icon: AlertTriangle,
    color: "rose",
    desc: "AI-style questionnaire design review: double-barreled questions, missing units, ambiguous text, too many choices — before field deployment.",
    badge: "SME rules",
  },
];

const STATES = ["UP","MH","RJ","TN","WB","MP","GJ","KA","AP","TG","BR","OD","JH","AS","CG","HP","UK","PB","HR","DL"];
const EDGE_TYPES = ["outlier_income","missing_critical","invalid_age","inconsistent"];

export default function SimulatorPage() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [surveyId, setSurveyId] = useState("");
  const [mode, setMode] = useState<SimMode>("volume");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  // Volume params
  const [nHouseholds, setNHouseholds] = useState(500);
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [sector, setSector] = useState("Both");

  // Edge params
  const [nEdge, setNEdge] = useState(50);
  const [edgeTypes, setEdgeTypes] = useState<string[]>(["outlier_income","missing_critical","invalid_age","inconsistent"]);

  // Report display
  const [activeTab, setActiveTab] = useState("summary");
  const [expandedFlaw, setExpandedFlaw] = useState<number | null>(null);

  const token = () => localStorage.getItem("token") || "";

  useEffect(() => {
    fetch(`${API}/surveys`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json())
      .then(d => {
        const list = Array.isArray(d) ? d : (d.surveys || []);
        setSurveys(list);
        if (list.length > 0) setSurveyId(list[0].id);
      })
      .catch(() => {});
  }, []);

  const run = async () => {
    if (!surveyId) { setError("Select a survey first"); return; }
    setRunning(true);
    setResult(null);
    setError("");

    try {
      let endpoint = `/simulator/${mode}`;
      let body: any = { survey_id: surveyId };

      if (mode === "volume") {
        body = { ...body, n_households: nHouseholds, sector, state_codes: selectedStates.length ? selectedStates : null };
      } else if (mode === "edgecases") {
        body = { ...body, n_households: nEdge, edge_types: edgeTypes };
      } else {
        // review — use sample questions for demo
        body = {
          survey_id: surveyId,
          questions: [
            { name: "age_years", label: "What is the age of the person (in completed years)?", type: "integer" },
            { name: "sex", label: "What is the sex and also the marital status of the person?", type: "select_one", choices: "Male,Female" },
            { name: "exp_total", label: "What is the total expenditure?", type: "decimal" },
            { name: "sector", label: "Sector", type: "select_one", choices: "Rural,Urban" },
            { name: "education level", label: "Highest level of general education attained?", type: "select_one", choices: "Not literate,Primary,Secondary,Graduate" },
            { name: "gps_location", label: "GPS coordinates of the household", type: "geopoint" },
            { name: "interview_date", label: "Date of survey/interview", type: "date" },
            { name: "mpce_total", label: "What is the total monthly per capita expenditure of the household (Rs.)?", type: "decimal" },
          ]
        };
      }

      const res = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Simulation failed");
      }

      const data = await res.json();
      setResult(data);
      setActiveTab("summary");
    } catch (e: any) {
      setError(e.message || "Unknown error");
    } finally {
      setRunning(false);
    }
  };

  const toggleState = (st: string) => {
    setSelectedStates(prev => prev.includes(st) ? prev.filter(s => s !== st) : [...prev, st]);
  };

  const toggleEdgeType = (et: string) => {
    setEdgeTypes(prev => prev.includes(et) ? prev.filter(e => e !== et) : [...prev, et]);
  };

  const downloadCSV = () => {
    if (!result?.sample_records && !result?.records) return;
    const records = result.sample_records || result.records || [];
    if (!records.length) return;
    const headers = Object.keys(records[0]).join(",");
    const rows = records.map((r: any) => Object.values(r).map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([headers + "\n" + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `simulator_${mode}_${Date.now()}.csv`; a.click();
  };

  const modeConfig = MODES.find(m => m.id === mode)!;

  const severityColor = (s: string) => ({
    high: "bg-red-100 text-red-700 border-red-200",
    medium: "bg-amber-100 text-amber-700 border-amber-200",
    low: "bg-blue-100 text-blue-700 border-blue-200",
    info: "bg-gray-100 text-gray-600 border-gray-200",
  }[s] || "bg-gray-100 text-gray-600");

  return (
    <AppShell>
      <div className="p-6 max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <TestTube2 className="text-brand-primary" size={24} />
            <h1 className="text-2xl font-bold text-gray-900">Synthetic Ground Truth Preview — Simulator</h1>
            <span className="text-xs font-bold bg-amber-400 text-amber-900 rounded px-2 py-1">WoW Feature</span>
          </div>
          <p className="text-sm text-gray-500 ml-9">
            See the value of your survey before a single interview. Statistical distributions from HCES/PLFS reference data.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-6">

          {/* Left: config panel */}
          <div className="col-span-1 space-y-4">

            {/* Survey selector */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Survey</label>
              <select
                value={surveyId}
                onChange={e => setSurveyId(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-brand-primary outline-none"
              >
                {surveys.length === 0 && <option value="">No surveys yet</option>}
                {surveys.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            {/* Mode picker */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 block">Simulation Mode</label>
              <div className="space-y-2">
                {MODES.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    className={`w-full text-left px-3 py-3 rounded-lg border transition-all ${
                      mode === m.id
                        ? "border-brand-primary bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <m.icon size={14} className={mode === m.id ? "text-brand-primary" : "text-gray-400"} />
                      <span className="text-sm font-medium text-gray-900">{m.label}</span>
                    </div>
                    <p className="text-xs text-gray-500 leading-snug pl-5">{m.desc.slice(0, 80)}…</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Mode-specific params */}
            {mode === "volume" && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
                    Households: <span className="text-brand-primary">{nHouseholds.toLocaleString()}</span>
                  </label>
                  <input
                    type="range" min={100} max={5000} step={100}
                    value={nHouseholds}
                    onChange={e => setNHouseholds(Number(e.target.value))}
                    className="w-full accent-brand-primary"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>100</span><span>5,000</span>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Sector</label>
                  <div className="flex gap-2">
                    {["Rural", "Urban", "Both"].map(s => (
                      <button key={s} onClick={() => setSector(s)}
                        className={`text-xs px-3 py-1.5 rounded-full border font-medium ${
                          sector === s ? "bg-brand-primary text-white border-brand-primary" : "border-gray-200 text-gray-600"
                        }`}>{s}</button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
                    States <span className="text-gray-400 font-normal">(leave blank for All India)</span>
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {STATES.map(st => (
                      <button key={st} onClick={() => toggleState(st)}
                        className={`text-xs px-2 py-0.5 rounded border ${
                          selectedStates.includes(st)
                            ? "bg-blue-600 text-white border-blue-600"
                            : "border-gray-200 text-gray-600 hover:border-gray-300"
                        }`}>{st}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {mode === "edgecases" && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
                    Edge records: <span className="text-brand-primary">{nEdge}</span>
                  </label>
                  <input type="range" min={10} max={200} step={10}
                    value={nEdge} onChange={e => setNEdge(Number(e.target.value))}
                    className="w-full accent-brand-primary" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Edge Types</label>
                  {EDGE_TYPES.map(et => (
                    <label key={et} className="flex items-center gap-2 text-xs text-gray-700 py-1 cursor-pointer">
                      <input type="checkbox" checked={edgeTypes.includes(et)} onChange={() => toggleEdgeType(et)}
                        className="accent-brand-primary" />
                      {et.replace(/_/g, " ")}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {mode === "review" && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <p className="text-xs text-gray-500">
                  Reviews a sample questionnaire with 8 real MoSPI-style questions for the demo.
                  In production, connect to your live form builder questions.
                </p>
              </div>
            )}

            {/* Run button */}
            <button
              onClick={run}
              disabled={running || !surveyId}
              className="w-full flex items-center justify-center gap-2 py-3 bg-brand-primary text-white rounded-xl font-semibold hover:bg-brand-dark disabled:opacity-50 transition-colors shadow-sm"
            >
              {running ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Simulating…
                </>
              ) : (
                <>
                  <Play size={16} />
                  Run Simulation
                </>
              )}
            </button>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>

          {/* Right: results */}
          <div className="col-span-2">
            {!result && !running && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm h-full flex flex-col items-center justify-center py-24 text-gray-400">
                <TestTube2 size={48} className="mb-4 opacity-20" />
                <p className="text-sm font-medium">Configure and run a simulation</p>
                <p className="text-xs mt-1">Results will appear here with tabulation tables and insights</p>
              </div>
            )}

            {running && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm h-full flex flex-col items-center justify-center py-24">
                <div className="w-16 h-16 rounded-full border-4 border-brand-primary border-t-transparent animate-spin mb-4" />
                <p className="text-sm font-medium text-gray-700">Generating synthetic households…</p>
                <p className="text-xs text-gray-400 mt-1">scipy statistical distributions · MoSPI reference data</p>
              </div>
            )}

            {result && !running && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Result header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle size={20} className="text-emerald-500" />
                    <div>
                      <p className="text-sm font-bold text-gray-900">
                        {mode === "volume" && `${result.n_records?.toLocaleString()} synthetic households generated`}
                        {mode === "edgecases" && `${result.n_records} edge case records generated`}
                        {mode === "review" && `Questionnaire review complete — ${result.summary?.total_issues || 0} issues found`}
                      </p>
                      <p className="text-xs text-gray-400">Run ID: {result.run_id?.slice(0, 8)}…</p>
                    </div>
                  </div>
                  {(result.sample_records || result.records) && (
                    <button onClick={downloadCSV}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
                      <Download size={13} />
                      Download CSV
                    </button>
                  )}
                </div>

                {/* Tabs */}
                {mode === "volume" && result.report && (
                  <>
                    <div className="flex gap-0 border-b border-gray-100">
                      {["summary", "quintiles", "states", "sample"].map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)}
                          className={`px-5 py-3 text-xs font-semibold capitalize border-b-2 transition-colors ${
                            activeTab === tab
                              ? "border-brand-primary text-brand-primary"
                              : "border-transparent text-gray-500 hover:text-gray-700"
                          }`}>{tab}</button>
                      ))}
                    </div>

                    <div className="p-6">
                      {activeTab === "summary" && (
                        <div>
                          {/* Key metrics */}
                          <div className="grid grid-cols-4 gap-4 mb-6">
                            {[
                              { label: "Mean MPCE", value: `₹${result.report.mean_mpce?.toLocaleString()}`, sub: "per month" },
                              { label: "Median MPCE", value: `₹${result.report.median_mpce?.toLocaleString()}`, sub: "per month" },
                              { label: "Gini Coefficient", value: result.report.gini_coefficient?.toFixed(3), sub: "inequality" },
                              { label: "Avg Food Share", value: `${result.report.avg_food_share_pct}%`, sub: "of MPCE" },
                            ].map(m => (
                              <div key={m.label} className="bg-gray-50 rounded-lg p-3 text-center">
                                <p className="text-lg font-bold text-brand-primary">{m.value}</p>
                                <p className="text-xs font-medium text-gray-700">{m.label}</p>
                                <p className="text-xs text-gray-400">{m.sub}</p>
                              </div>
                            ))}
                          </div>

                          {/* Sector & Social */}
                          <div className="grid grid-cols-2 gap-6">
                            <div>
                              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Sector Distribution</h3>
                              {result.report.sector_distribution?.map((s: any) => (
                                <div key={s.sector} className="mb-2">
                                  <div className="flex justify-between text-xs mb-1">
                                    <span className="text-gray-700">{s.sector}</span>
                                    <span className="font-semibold">{s.pct}%</span>
                                  </div>
                                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full ${s.sector === "Rural" ? "bg-emerald-500" : "bg-blue-500"}`}
                                      style={{ width: `${s.pct}%` }} />
                                  </div>
                                </div>
                              ))}
                            </div>

                            <div>
                              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Social Group</h3>
                              {result.report.social_group_distribution?.map((s: any) => (
                                <div key={s.group} className="mb-2">
                                  <div className="flex justify-between text-xs mb-1">
                                    <span className="text-gray-700">{s.group}</span>
                                    <span className="font-semibold">{s.pct}%</span>
                                  </div>
                                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full bg-purple-500" style={{ width: `${s.pct}%` }} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {activeTab === "quintiles" && result.report.mpce_quintiles && (
                        <div>
                          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">MPCE Quintiles (Monthly Per Capita Expenditure)</h3>
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-gray-50">
                                {["Quintile","Min (₹)","Max (₹)","Mean (₹)","Households"].map(h => (
                                  <th key={h} className="text-left px-3 py-2 font-semibold text-gray-600">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {result.report.mpce_quintiles.map((q: any) => (
                                <tr key={q.quintile} className="border-t border-gray-100 hover:bg-gray-50">
                                  <td className="px-3 py-2 font-bold text-brand-primary">{q.quintile}</td>
                                  <td className="px-3 py-2">₹{q.min?.toLocaleString()}</td>
                                  <td className="px-3 py-2">₹{q.max?.toLocaleString()}</td>
                                  <td className="px-3 py-2 font-semibold">₹{q.mean?.toLocaleString()}</td>
                                  <td className="px-3 py-2">{q.count}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {activeTab === "states" && result.report.state_summary && (
                        <div>
                          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">State-wise Summary</h3>
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-gray-50">
                                {["State","N","Mean MPCE","Rural %"].map(h => (
                                  <th key={h} className="text-left px-3 py-2 font-semibold text-gray-600">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {result.report.state_summary.map((s: any) => (
                                <tr key={s.state} className="border-t border-gray-100 hover:bg-gray-50">
                                  <td className="px-3 py-2 font-bold">{s.state}</td>
                                  <td className="px-3 py-2">{s.n}</td>
                                  <td className="px-3 py-2">₹{s.mean_mpce?.toLocaleString()}</td>
                                  <td className="px-3 py-2">{s.rural_pct}%</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {activeTab === "sample" && (
                        <div>
                          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">Sample Records (first 10)</h3>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-gray-50">
                                  {result.sample_records?.[0] && Object.keys(result.sample_records[0]).slice(0, 8).map((k: string) => (
                                    <th key={k} className="text-left px-2 py-2 font-semibold text-gray-600 whitespace-nowrap">{k}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {result.sample_records?.slice(0, 10).map((r: any, i: number) => (
                                  <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                                    {Object.values(r).slice(0, 8).map((v: any, j: number) => (
                                      <td key={j} className="px-2 py-1.5 whitespace-nowrap">{String(v)}</td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Edge cases results */}
                {mode === "edgecases" && result.records && (
                  <div className="p-6">
                    <div className="flex gap-4 mb-6">
                      {Object.entries(result.edge_type_summary || {}).map(([type, count]: any) => (
                        <div key={type} className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-center">
                          <p className="text-lg font-bold text-amber-700">{count}</p>
                          <p className="text-xs text-amber-600">{type.replace(/_/g, " ")}</p>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2">
                      {result.descriptions?.map((d: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-sm text-gray-700 bg-amber-50 rounded-lg px-4 py-3">
                          <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                          {d}
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50">
                            {["hh_id","edge_type","flag","hh_size","mpce_total","sector"].map(h => (
                              <th key={h} className="text-left px-2 py-2 font-semibold text-gray-600">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {result.records?.slice(0, 20).map((r: any, i: number) => (
                            <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                              <td className="px-2 py-1.5 font-mono">{r.hh_id}</td>
                              <td className="px-2 py-1.5"><span className="bg-amber-100 text-amber-700 rounded px-1.5 text-xs">{r.edge_type}</span></td>
                              <td className="px-2 py-1.5 text-gray-500 max-w-xs truncate">{r.flag}</td>
                              <td className="px-2 py-1.5">{r.hh_size ?? "—"}</td>
                              <td className="px-2 py-1.5">{r.mpce_total?.toLocaleString() ?? "—"}</td>
                              <td className="px-2 py-1.5">{r.sector ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Questionnaire review results */}
                {mode === "review" && (
                  <div className="p-6">
                    <div className="flex gap-4 mb-6">
                      <div className={`flex-1 rounded-lg px-4 py-3 text-center border ${result.summary?.high > 0 ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-200"}`}>
                        <p className={`text-2xl font-bold ${result.summary?.high > 0 ? "text-red-600" : "text-gray-400"}`}>{result.summary?.high || 0}</p>
                        <p className="text-xs font-semibold text-gray-600">High</p>
                      </div>
                      <div className={`flex-1 rounded-lg px-4 py-3 text-center border ${result.summary?.medium > 0 ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-200"}`}>
                        <p className={`text-2xl font-bold ${result.summary?.medium > 0 ? "text-amber-600" : "text-gray-400"}`}>{result.summary?.medium || 0}</p>
                        <p className="text-xs font-semibold text-gray-600">Medium</p>
                      </div>
                      <div className={`flex-1 rounded-lg px-4 py-3 text-center border ${result.summary?.low > 0 ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-200"}`}>
                        <p className={`text-2xl font-bold ${result.summary?.low > 0 ? "text-blue-600" : "text-gray-400"}`}>{result.summary?.low || 0}</p>
                        <p className="text-xs font-semibold text-gray-600">Low</p>
                      </div>
                      <div className="flex-1 rounded-lg px-4 py-3 text-center border bg-gray-50 border-gray-200">
                        <p className={`text-lg font-bold ${result.verdict?.includes("PASS") ? "text-emerald-600" : result.verdict?.includes("NEEDS") ? "text-red-600" : "text-amber-600"}`}>
                          {result.verdict}
                        </p>
                        <p className="text-xs font-semibold text-gray-600">Verdict</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {result.flaws?.map((f: any, i: number) => (
                        <div key={i} className={`rounded-lg border overflow-hidden ${severityColor(f.severity)}`}>
                          <button
                            className="w-full flex items-start gap-3 px-4 py-3 text-left"
                            onClick={() => setExpandedFlaw(expandedFlaw === i ? null : i)}
                          >
                            <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase flex-shrink-0 mt-0.5 ${severityColor(f.severity)}`}>
                              {f.severity}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold">{f.type}</p>
                              {f.field_name && <code className="text-xs opacity-70">{f.field_name}</code>}
                            </div>
                            {expandedFlaw === i ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                          {expandedFlaw === i && (
                            <div className="px-4 pb-4 pt-0 bg-white bg-opacity-60">
                              <p className="text-xs text-gray-700 mb-2">{f.description}</p>
                              {f.suggestion && (
                                <div className="flex items-start gap-2">
                                  <Zap size={12} className="text-amber-500 flex-shrink-0 mt-0.5" />
                                  <p className="text-xs text-gray-600 font-medium">{f.suggestion}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}

                      {result.suggestions?.length > 0 && (
                        <div className="mt-4">
                          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Suggestions</h3>
                          {result.suggestions.map((s: any, i: number) => (
                            <div key={i} className="flex items-start gap-2 text-xs text-gray-600 bg-gray-50 rounded-lg px-4 py-2 mb-1.5">
                              <Zap size={12} className="text-blue-500 flex-shrink-0 mt-0.5" />
                              <span><strong>{s.type}:</strong> {s.description}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
