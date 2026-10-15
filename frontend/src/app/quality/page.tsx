"use client";
import AppShell from "@/components/layout/AppShell";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dqApi, surveyApi } from "@/lib/api";
import { useState } from "react";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
         BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { Shield, Play } from "lucide-react";

export default function QualityPage() {
  const qc = useQueryClient();
  const [surveyFilter, setSurveyFilter] = useState("");

  const { data: surveys } = useQuery({ queryKey: ["surveys"], queryFn: () => surveyApi.list().then(r => r.data) });
  const { data: runs } = useQuery({ queryKey: ["dq-runs", surveyFilter], queryFn: () => dqApi.runs(surveyFilter || undefined).then(r => r.data) });
  const { data: scorecard } = useQuery({ queryKey: ["scorecard", surveyFilter], queryFn: () => dqApi.scorecard(surveyFilter || undefined).then(r => r.data) });
  const { data: rules } = useQuery({ queryKey: ["dq-rules", surveyFilter], queryFn: () => dqApi.rules(surveyFilter || undefined).then(r => r.data) });

  const runDq = useMutation({
    mutationFn: () => dqApi.runDq(surveyFilter || surveys?.[0]?.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dq-runs"] })
  });

  const radarData = (scorecard || []).map((s: any) => ({
    dimension: s.dimension,
    score: parseFloat(s.score || 0)
  }));

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-brand-primary" />
            <div>
              <h1 className="text-2xl font-bold text-brand-primary">Data Quality Engine</h1>
              <p className="text-sm text-gray-500">Great Expectations · 5 DQ dimensions · per-record audit trail</p>
            </div>
          </div>
          <div className="flex gap-2">
            <select className="input w-auto text-sm" value={surveyFilter} onChange={e => setSurveyFilter(e.target.value)}>
              <option value="">All Surveys</option>
              {(surveys || []).map((s: any) => <option key={s.id} value={s.id}>{s.code}</option>)}
            </select>
            <button onClick={() => runDq.mutate()} disabled={runDq.isPending || !surveyFilter} className="btn-primary text-xs gap-1.5">
              <Play size={14} />
              {runDq.isPending ? "Running…" : "Run DQ"}
            </button>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">DQ Dimension Scores — Radar</h2>
            <ResponsiveContainer width="100%" height={250}>
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 10 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9 }} />
                <Radar name="Score" dataKey="score" stroke="#003366" fill="#003366" fillOpacity={0.2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Top Failing Rules</h2>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={(rules || []).slice(0, 8)} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 9 }} />
                <YAxis type="category" dataKey="check_name" tick={{ fontSize: 9 }} width={140} />
                <Tooltip />
                <Bar dataKey="failures" name="Failures" fill="#EF4444" radius={[0,3,3,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Scorecard table */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Dimension Scorecard</h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {(scorecard || []).map((s: any) => (
              <div key={s.dimension} className={`rounded-xl p-4 text-center border-2 ${
                parseFloat(s.score) >= 90 ? "bg-green-50 border-green-200" :
                parseFloat(s.score) >= 70 ? "bg-amber-50 border-amber-200" :
                "bg-red-50 border-red-200"
              }`}>
                <div className={`text-2xl font-bold ${
                  parseFloat(s.score) >= 90 ? "text-green-700" :
                  parseFloat(s.score) >= 70 ? "text-amber-700" : "text-red-700"
                }`}>{parseFloat(s.score).toFixed(0)}%</div>
                <div className="text-xs font-semibold capitalize mt-1 text-gray-600">{s.dimension}</div>
                <div className="text-xs text-gray-400 mt-1">{s.passed} / {s.total}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent DQ runs */}
        <div className="card overflow-x-auto">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">DQ Run History</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-gray-500 uppercase">
                <th className="text-left py-2 px-3">Survey</th>
                <th className="text-left py-2 px-3">Type</th>
                <th className="text-left py-2 px-3">Total</th>
                <th className="text-left py-2 px-3">Pass</th>
                <th className="text-left py-2 px-3">Warn</th>
                <th className="text-left py-2 px-3">Fail</th>
                <th className="text-left py-2 px-3">Pass%</th>
                <th className="text-left py-2 px-3">Started</th>
              </tr>
            </thead>
            <tbody>
              {(runs || []).map((run: any) => (
                <tr key={run.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 px-3"><span className="badge-bronze">{run.survey_code}</span></td>
                  <td className="py-2 px-3 text-xs">{run.run_type}</td>
                  <td className="py-2 px-3 font-medium">{run.total_records}</td>
                  <td className="py-2 px-3 text-green-600 font-medium">{run.passed}</td>
                  <td className="py-2 px-3 text-amber-600">{run.warned}</td>
                  <td className="py-2 px-3 text-red-600">{run.failed}</td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden w-20">
                        <div className="h-full bg-green-500 rounded-full" style={{ width: `${run.pass_pct}%` }} />
                      </div>
                      <span className="text-xs font-medium">{run.pass_pct}%</span>
                    </div>
                  </td>
                  <td className="py-2 px-3 text-xs text-gray-500">{new Date(run.started_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
