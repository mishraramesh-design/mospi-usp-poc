"use client";
import AppShell from "@/components/layout/AppShell";
import { useQuery } from "@tanstack/react-query";
import { pipelineApi, surveyApi, dqApi, lineageApi } from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from "recharts";
import { Database, Shield, FlaskConical, Activity, TrendingUp, AlertTriangle, CheckCircle, Clock } from "lucide-react";

const TIER_COLORS = { bronze: "#CD7F32", silver: "#9CA3AF", gold: "#F59E0B" };

export default function DashboardPage() {
  const { data: overview } = useQuery({ queryKey: ["pipeline-overview"], queryFn: () => pipelineApi.overview().then(r => r.data) });
  const { data: surveys } = useQuery({ queryKey: ["surveys"], queryFn: () => surveyApi.list().then(r => r.data) });
  const { data: trend } = useQuery({ queryKey: ["trend"], queryFn: () => pipelineApi.trend().then(r => r.data) });
  const { data: scorecard } = useQuery({ queryKey: ["scorecard"], queryFn: () => dqApi.scorecard().then(r => r.data) });
  const { data: lineage } = useQuery({ queryKey: ["lineage-feed"], queryFn: () => lineageApi.feed({ limit: 8 }).then(r => r.data) });

  const kpis = [
    { label: "Bronze (Raw)", value: overview?.bronze_total ?? "—", icon: Database, color: "text-amber-700", bg: "bg-amber-50", badge: "bronze" },
    { label: "Silver (Clean)", value: overview?.silver_total ?? "—", icon: Shield, color: "text-gray-600", bg: "bg-gray-50", badge: "silver" },
    { label: "DQ Pass Rate", value: overview?.silver_total ? `${Math.round(overview.silver_pass / overview.silver_total * 100)}%` : "—", icon: CheckCircle, color: "text-green-700", bg: "bg-green-50" },
    { label: "Avg DQ Score", value: overview?.avg_dq_score ? `${parseFloat(overview.avg_dq_score).toFixed(1)}` : "—", icon: TrendingUp, color: "text-brand-primary", bg: "bg-brand-light" },
    { label: "Submissions (24h)", value: overview?.bronze_24h ?? "—", icon: Activity, color: "text-brand-secondary", bg: "bg-orange-50" },
    { label: "Active Surveys", value: surveys?.filter((s: any) => s.status === "active").length ?? "—", icon: FlaskConical, color: "text-purple-700", bg: "bg-purple-50" },
  ];

  const dqPieData = overview ? [
    { name: "Pass", value: overview.silver_pass || 0 },
    { name: "Warn", value: overview.silver_warn || 0 },
    { name: "Fail", value: overview.silver_fail || 0 },
  ] : [];
  const PIE_COLORS = ["#00843D", "#F59E0B", "#EF4444"];

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-brand-primary">Command Dashboard</h1>
            <p className="text-sm text-gray-500 mt-0.5">Unified Survey Platform — Real-time pipeline & quality overview</p>
          </div>
          <div className="text-xs text-gray-400 bg-gray-100 rounded-full px-3 py-1">
            Last refreshed: {new Date().toLocaleTimeString()}
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <div key={kpi.label} className={`card-hover ${kpi.bg} border-0`}>
                <div className={`p-2 rounded-lg ${kpi.bg} inline-flex mb-3`}>
                  <Icon className={`w-5 h-5 ${kpi.color}`} />
                </div>
                <div className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</div>
                <div className="text-xs text-gray-500 mt-1">{kpi.label}</div>
              </div>
            );
          })}
        </div>

        {/* Medallion Pipeline Visual */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Medallion Architecture Pipeline</h2>
          <div className="flex items-center gap-3">
            {[
              { tier: "BRONZE", count: overview?.bronze_total, color: "bg-amber-100 border-amber-400 text-amber-800", dot: "bg-amber-500", desc: "Raw JSONB submissions" },
              { tier: "SILVER", count: overview?.silver_total, color: "bg-gray-100 border-gray-400 text-gray-700", dot: "bg-gray-500", desc: "Cleaned & validated" },
              { tier: "GOLD", count: (overview?.gold_plfs_records || 0), color: "bg-yellow-100 border-yellow-400 text-yellow-800", dot: "bg-yellow-500", desc: "OLAP aggregates" },
            ].map((t, i) => (
              <div key={t.tier} className="flex items-center flex-1">
                <div className={`flex-1 rounded-xl border-2 ${t.color} p-4 text-center`}>
                  <div className="flex justify-center mb-2"><div className={`w-3 h-3 rounded-full ${t.dot}`} /></div>
                  <div className="text-lg font-bold">{t.count ?? "—"}</div>
                  <div className="text-xs font-semibold mt-0.5">{t.tier}</div>
                  <div className="text-xs opacity-70 mt-1">{t.desc}</div>
                </div>
                {i < 2 && (
                  <div className="px-2 text-gray-400 pipeline-flow">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
          {overview && (
            <div className="mt-4 flex gap-4 text-xs text-gray-500">
              <span className="text-green-600 font-medium">✓ {overview.silver_pass} pass</span>
              <span className="text-amber-600 font-medium">⚠ {overview.silver_warn} warn</span>
              <span className="text-red-600 font-medium">✗ {overview.silver_fail} fail</span>
            </div>
          )}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Ingestion trend */}
          <div className="card lg:col-span-2">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Submissions — Last 14 Days</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={trend || []} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={v => v?.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="capi" name="CAPI" fill="#003366" radius={[2,2,0,0]} />
                <Bar dataKey="cawi" name="CAWI" fill="#FF6600" radius={[2,2,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* DQ Distribution */}
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">DQ Status Distribution</h2>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={dqPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                     dataKey="value" nameKey="name" paddingAngle={3}>
                  {dqPieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                </Pie>
                <Tooltip formatter={(v: any) => [v, ""]} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Active surveys + Recent events */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Active surveys */}
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Active Surveys</h2>
            <div className="space-y-2">
              {(surveys || []).slice(0, 5).map((s: any) => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-brand-light transition-colors">
                  <div>
                    <div className="text-sm font-medium text-gray-800">{s.title}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{s.code}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{s.bronze_count} rec</span>
                    <span className={`badge ${s.status === "active" ? "badge-pass" : "badge-pending"}`}>{s.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent lineage events */}
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Recent Lineage Events</h2>
            <div className="space-y-2">
              {(lineage || []).slice(0, 8).map((ev: any, i: number) => (
                <div key={i} className="flex items-center gap-3 text-xs">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    ev.event_type === "submitted" ? "bg-blue-400" :
                    ev.event_type === "cleaned" ? "bg-green-400" :
                    ev.event_type === "aggregated" ? "bg-yellow-400" : "bg-gray-400"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <span className="text-gray-700 font-medium capitalize">{ev.event_type}</span>
                    <span className="text-gray-400 mx-1">·</span>
                    <span className="text-gray-500">{ev.odk_instance_id?.slice(0, 25)}</span>
                  </div>
                  <span className="text-gray-400 flex-shrink-0">{new Date(ev.occurred_at).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
