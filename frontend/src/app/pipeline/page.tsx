"use client";
import AppShell from "@/components/layout/AppShell";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pipelineApi, surveyApi } from "@/lib/api";
import { useState } from "react";
import { Play, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";

export default function PipelinePage() {
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [surveyFilter, setSurveyFilter] = useState("");
  const [dqFilter, setDqFilter] = useState("");

  const { data: overview } = useQuery({ queryKey: ["pipeline-overview"], queryFn: () => pipelineApi.overview().then(r => r.data) });
  const { data: bronzeData } = useQuery({
    queryKey: ["bronze", surveyFilter],
    queryFn: () => pipelineApi.bronze(surveyFilter ? { survey_id: surveyFilter } : {}).then(r => r.data)
  });
  const { data: silverData } = useQuery({
    queryKey: ["silver", surveyFilter, dqFilter],
    queryFn: () => pipelineApi.silver({ ...(surveyFilter ? { survey_id: surveyFilter } : {}), ...(dqFilter ? { dq_status: dqFilter } : {}) }).then(r => r.data)
  });
  const { data: surveys } = useQuery({ queryKey: ["surveys"], queryFn: () => surveyApi.list().then(r => r.data) });

  const triggerB2S = useMutation({
    mutationFn: () => pipelineApi.triggerBronzeToSilver(surveyFilter || undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bronze"] })
  });
  const triggerS2G = useMutation({
    mutationFn: () => pipelineApi.triggerSilverToGold(surveyFilter || undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["silver"] })
  });

  const { data: detail } = useQuery({
    queryKey: ["bronze-detail", expandedId],
    queryFn: () => expandedId ? pipelineApi.bronzeDetail(expandedId).then(r => r.data) : null,
    enabled: !!expandedId
  });

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-brand-primary">DI Pipeline</h1>
            <p className="text-sm text-gray-500 mt-0.5">Bronze → Silver → Gold medallion architecture</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => triggerB2S.mutate()}
              disabled={triggerB2S.isPending}
              className="btn-outline text-xs gap-1.5">
              <Play size={14} />
              Run B→S
            </button>
            <button onClick={() => triggerS2G.mutate()}
              disabled={triggerS2G.isPending}
              className="btn-primary text-xs gap-1.5">
              <Play size={14} />
              Run S→G
            </button>
          </div>
        </div>

        {/* Summary Tiles */}
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: "Bronze Total", value: overview?.bronze_total, color: "text-amber-700", bg: "bg-amber-50" },
            { label: "Silver Total", value: overview?.silver_total, color: "text-gray-700", bg: "bg-gray-50" },
            { label: "Pass", value: overview?.silver_pass, color: "text-green-700", bg: "bg-green-50" },
            { label: "Warn", value: overview?.silver_warn, color: "text-amber-700", bg: "bg-amber-50" },
            { label: "Fail", value: overview?.silver_fail, color: "text-red-700", bg: "bg-red-50" },
          ].map(t => (
            <div key={t.label} className={`rounded-xl ${t.bg} p-4 text-center`}>
              <div className={`text-2xl font-bold ${t.color}`}>{t.value ?? "—"}</div>
              <div className="text-xs text-gray-500 mt-1">{t.label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <select className="input w-auto text-sm" value={surveyFilter} onChange={e => setSurveyFilter(e.target.value)}>
            <option value="">All Surveys</option>
            {(surveys || []).map((s: any) => <option key={s.id} value={s.id}>{s.code}</option>)}
          </select>
          <select className="input w-auto text-sm" value={dqFilter} onChange={e => setDqFilter(e.target.value)}>
            <option value="">All DQ Status</option>
            <option value="pass">Pass</option>
            <option value="warn">Warn</option>
            <option value="fail">Fail</option>
            <option value="pending">Pending</option>
          </select>
        </div>

        {/* Bronze table */}
        <div className="card overflow-x-auto">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Bronze Layer — Raw Submissions
            <span className="ml-2 badge-bronze">{bronzeData?.total ?? 0} total</span>
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase">
                <th className="text-left py-2 px-3">Instance ID</th>
                <th className="text-left py-2 px-3">Survey</th>
                <th className="text-left py-2 px-3">Source</th>
                <th className="text-left py-2 px-3">State</th>
                <th className="text-left py-2 px-3">Submitted</th>
                <th className="text-left py-2 px-3">Silver</th>
                <th className="py-2 px-3" />
              </tr>
            </thead>
            <tbody>
              {(bronzeData?.items || []).map((row: any) => (
                <>
                  <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-3 font-mono text-xs truncate max-w-xs">{row.odk_instance_id?.slice(-20)}</td>
                    <td className="py-2 px-3"><span className="badge-bronze">{row.survey_code}</span></td>
                    <td className="py-2 px-3 text-xs">{row.source}</td>
                    <td className="py-2 px-3 text-xs">{row.state_code}</td>
                    <td className="py-2 px-3 text-xs">{new Date(row.submitted_at).toLocaleString()}</td>
                    <td className="py-2 px-3">{row.promoted ? <span className="badge-pass">✓</span> : <span className="badge-pending">pending</span>}</td>
                    <td className="py-2 px-3">
                      <button onClick={() => setExpandedId(expandedId === row.id ? null : row.id)} className="text-gray-400 hover:text-brand-primary">
                        {expandedId === row.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    </td>
                  </tr>
                  {expandedId === row.id && detail && (
                    <tr key={row.id + "-detail"}>
                      <td colSpan={7} className="bg-gray-50 px-4 py-3">
                        <div className="grid grid-cols-2 gap-4 text-xs">
                          <div>
                            <div className="font-semibold text-gray-600 mb-2">Raw Data (JSONB)</div>
                            <pre className="bg-white border rounded p-2 text-xs overflow-x-auto max-h-32">
                              {JSON.stringify(detail.raw_data, null, 2)}
                            </pre>
                          </div>
                          {detail.silver && (
                            <div>
                              <div className="font-semibold text-gray-600 mb-2">Silver Record</div>
                              <div className="space-y-1">
                                <div>DQ Status: <span className={`badge-${detail.silver.dq_status}`}>{detail.silver.dq_status}</span></div>
                                <div>DQ Score: <strong>{detail.silver.dq_score?.toFixed(1)}</strong></div>
                                <div>Cleaned: {new Date(detail.silver.cleaned_at).toLocaleString()}</div>
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
