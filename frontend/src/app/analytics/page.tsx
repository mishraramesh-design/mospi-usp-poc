"use client";
import AppShell from "@/components/layout/AppShell";
import { useQuery, useMutation } from "@tanstack/react-query";
import { statsApi, surveyApi } from "@/lib/api";
import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ErrorBar } from "recharts";
import { FlaskConical, Play, Code } from "lucide-react";

const DEFAULT_PLAN = {
  survey_code: "PLFS-2024-Q3",
  design: { id_var: "hh_id", strata_var: "nss_region", cluster_var: "fsu_code", weight_var: "wgt_multiplier" },
  estimator: "svymean",
  target_var: "unemployed_indicator",
  by_vars: ["state_code", "sector"],
  confidence_level: 0.95,
};

export default function AnalyticsPage() {
  const [request, setRequest] = useState(DEFAULT_PLAN);
  const [showCode, setShowCode] = useState(false);
  const [result, setResult] = useState<any>(null);

  const { data: surveys } = useQuery({ queryKey: ["surveys"], queryFn: () => surveyApi.list().then(r => r.data) });
  const { data: plans } = useQuery({ queryKey: ["stat-plans"], queryFn: () => statsApi.plans().then(r => r.data) });

  const tabMutation = useMutation({
    mutationFn: (req: any) => statsApi.tabulate(req).then(r => r.data),
    onSuccess: (data) => setResult(data)
  });

  const loadPlan = (plan: any) => {
    const p = plan.plan_json;
    setRequest({
      survey_code: p.survey_code || plan.survey_code,
      design: p.design || DEFAULT_PLAN.design,
      estimator: p.estimator || "svymean",
      target_var: p.target_var || "unemployed_indicator",
      by_vars: p.by_vars || ["state_code"],
      confidence_level: p.confidence_level || 0.95,
    });
  };

  const chartData = result?.rows?.filter((r: any) => r.sector === "Urban" || !r.sector)
    .map((r: any) => ({
      name: r.state_code || r.state_name,
      estimate: parseFloat(r.estimate || 0).toFixed(2),
      se: parseFloat(r.se || 0).toFixed(2),
    })) || [];

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <FlaskConical className="w-6 h-6 text-brand-primary" />
          <div>
            <h1 className="text-2xl font-bold text-brand-primary">Statistical Analysis</h1>
            <p className="text-sm text-gray-500">R `survey` package — complex survey estimation with DEFF, CI, CV</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Configuration panel */}
          <div className="card space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Tabulation Configuration</h2>

            {/* Saved plans */}
            {plans?.length > 0 && (
              <div>
                <label className="label">Saved Plans</label>
                <select className="input text-sm" onChange={e => {
                  const plan = plans.find((p: any) => p.id === e.target.value);
                  if (plan) loadPlan(plan);
                }}>
                  <option value="">— select a plan —</option>
                  {plans.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="label">Survey</label>
              <select className="input text-sm" value={request.survey_code}
                onChange={e => setRequest({ ...request, survey_code: e.target.value })}>
                {(surveys || []).map((s: any) => <option key={s.code} value={s.code}>{s.code}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Estimator</label>
              <select className="input text-sm" value={request.estimator}
                onChange={e => setRequest({ ...request, estimator: e.target.value })}>
                <option value="svymean">svymean — Weighted mean</option>
                <option value="svytotal">svytotal — Weighted total</option>
                <option value="svyratio">svyratio — Weighted ratio</option>
              </select>
            </div>
            <div>
              <label className="label">Target Variable</label>
              <select className="input text-sm" value={request.target_var}
                onChange={e => setRequest({ ...request, target_var: e.target.value })}>
                <option value="unemployed_indicator">Unemployment Rate</option>
                <option value="labour_force_indicator">LFPR</option>
                <option value="employed_indicator">WPR</option>
                <option value="mpce">MPCE</option>
              </select>
            </div>
            <div>
              <label className="label">Domain (By Variables)</label>
              <div className="flex gap-2 flex-wrap">
                {["state_code", "sector", "principal_earner_sex"].map(v => (
                  <label key={v} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="checkbox" className="rounded"
                      checked={request.by_vars.includes(v)}
                      onChange={e => setRequest({
                        ...request,
                        by_vars: e.target.checked
                          ? [...request.by_vars, v]
                          : request.by_vars.filter(x => x !== v)
                      })} />
                    {v}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Design Parameters</label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries(request.design).map(([k, v]) => (
                  <div key={k}>
                    <div className="text-gray-400 capitalize">{k.replace("_var","")}</div>
                    <input className="input text-xs py-1" value={v}
                      onChange={e => setRequest({ ...request, design: { ...request.design, [k]: e.target.value } })} />
                  </div>
                ))}
              </div>
            </div>
            <button onClick={() => tabMutation.mutate(request)}
              disabled={tabMutation.isPending}
              className="btn-primary w-full justify-center gap-2">
              <Play size={14} />
              {tabMutation.isPending ? "Running in R…" : "Run Tabulation"}
            </button>
          </div>

          {/* Results */}
          <div className="lg:col-span-2 space-y-4">
            {result && (
              <>
                <div className="card">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-sm font-semibold text-gray-700">Results — {result.target_var}</h2>
                      <p className="text-xs text-gray-400 mt-0.5">{result.n_records} records · {result.execution_ms}ms · {result.note}</p>
                    </div>
                    <button onClick={() => setShowCode(!showCode)} className="btn-ghost text-xs gap-1.5">
                      <Code size={14} />
                      {showCode ? "Hide R Code" : "Show R Code"}
                    </button>
                  </div>

                  {showCode && (
                    <pre className="bg-gray-900 text-green-300 rounded-lg p-4 text-xs overflow-x-auto mb-4 font-mono">
                      {result.r_code}
                    </pre>
                  )}

                  {/* Chart */}
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: any) => [`${parseFloat(v).toFixed(2)}%`, result.target_var]} />
                      <Bar dataKey="estimate" name="Estimate (%)" fill="#003366" radius={[3,3,0,0]}>
                        <ErrorBar dataKey="se" width={4} strokeWidth={2} stroke="#FF6600" />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Table */}
                <div className="card overflow-x-auto">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Detailed Results</h3>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-gray-500 text-left">
                        {result.by_vars?.map((v: string) => <th key={v} className="py-1.5 px-2 uppercase">{v}</th>)}
                        <th className="py-1.5 px-2 uppercase">Estimate</th>
                        <th className="py-1.5 px-2 uppercase">SE</th>
                        <th className="py-1.5 px-2 uppercase">CV%</th>
                        <th className="py-1.5 px-2 uppercase">95% CI</th>
                        <th className="py-1.5 px-2 uppercase">DEFF</th>
                        <th className="py-1.5 px-2 uppercase">n</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows?.map((row: any, i: number) => (
                        <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                          {result.by_vars?.map((v: string) => (
                            <td key={v} className="py-1.5 px-2 font-medium">{row[v]}</td>
                          ))}
                          <td className="py-1.5 px-2 font-bold text-brand-primary">{parseFloat(row.estimate).toFixed(2)}%</td>
                          <td className="py-1.5 px-2">{parseFloat(row.se).toFixed(3)}</td>
                          <td className="py-1.5 px-2">
                            <span className={`badge ${parseFloat(row.cv) > 25 ? "badge-fail" : parseFloat(row.cv) > 15 ? "badge-warn" : "badge-pass"}`}>
                              {parseFloat(row.cv).toFixed(1)}%
                            </span>
                          </td>
                          <td className="py-1.5 px-2">[{parseFloat(row.ci_lower).toFixed(2)}, {parseFloat(row.ci_upper).toFixed(2)}]</td>
                          <td className="py-1.5 px-2">{parseFloat(row.deff).toFixed(2)}</td>
                          <td className="py-1.5 px-2">{row.n}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {!result && (
              <div className="card flex items-center justify-center h-64 text-gray-400">
                <div className="text-center">
                  <FlaskConical className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Configure and run a tabulation to see results</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
