"use client";
import AppShell from "@/components/layout/AppShell";
import { BarChart2, ExternalLink, Map } from "lucide-react";

const SUPERSET_URL = process.env.NEXT_PUBLIC_SUPERSET_URL || "http://93.127.194.188:8088";
const AIRFLOW_URL = process.env.NEXT_PUBLIC_AIRFLOW_URL || "http://93.127.194.188:8080";

const DASHBOARDS = [
  { id: 1, name: "PLFS — Unemployment Rates", desc: "State-wise unemployment by sector, gender and age group", icon: "📊", tag: "Labour" },
  { id: 2, name: "HCES — MPCE Distribution", desc: "Monthly per-capita expenditure decile analysis", icon: "💰", tag: "Expenditure" },
  { id: 3, name: "GIS Choropleth — District Level", desc: "PostGIS-powered spatial choropleth maps with Deck.gl", icon: "🗺️", tag: "GIS" },
  { id: 4, name: "Pipeline Monitoring", desc: "Real-time Bronze→Silver→Gold medallion flow", icon: "🔄", tag: "Ops" },
  { id: 5, name: "DQ Scorecard", desc: "Data quality dimension trends over survey rounds", icon: "🛡️", tag: "Quality" },
];

export default function ReportingPage() {
  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart2 className="w-6 h-6 text-brand-primary" />
            <div>
              <h1 className="text-2xl font-bold text-brand-primary">Reporting & Visualisation</h1>
              <p className="text-sm text-gray-500">Apache Superset · PostGIS GIS · Apache Airflow · Grafana</p>
            </div>
          </div>
          <a href={`${SUPERSET_URL}/superset/welcome`} target="_blank" className="btn-outline text-xs gap-1.5">
            <ExternalLink size={14} /> Open Superset
          </a>
        </div>

        {/* Quick access tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Superset", desc: "BI & Analytics", href: SUPERSET_URL, icon: "📊", color: "bg-blue-50 border-blue-200" },
            { label: "Airflow", desc: "DAG Monitoring", href: AIRFLOW_URL, icon: "🔄", color: "bg-green-50 border-green-200" },
            { label: "Grafana", desc: "Infrastructure", href: "http://93.127.194.188:3001", icon: "📈", color: "bg-orange-50 border-orange-200" },
            { label: "R-API Docs", desc: "Statistical Engine", href: "http://93.127.194.188:8686/__docs__", icon: "🔬", color: "bg-purple-50 border-purple-200" },
          ].map(t => (
            <a key={t.label} href={t.href} target="_blank"
              className={`card border-2 ${t.color} hover:shadow-md transition-shadow flex items-center gap-3 no-underline`}>
              <span className="text-2xl">{t.icon}</span>
              <div>
                <div className="text-sm font-semibold text-gray-800">{t.label}</div>
                <div className="text-xs text-gray-500">{t.desc}</div>
              </div>
              <ExternalLink size={12} className="ml-auto text-gray-400" />
            </a>
          ))}
        </div>

        {/* Superset embed */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Superset Dashboard — PLFS Overview</h2>
            <a href={`${SUPERSET_URL}/superset/dashboard/1`} target="_blank" className="btn-ghost text-xs gap-1.5">
              <ExternalLink size={13} /> Full screen
            </a>
          </div>
          <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
            <iframe
              src={`${SUPERSET_URL}/superset/dashboard/1/?standalone=1`}
              className="w-full h-96"
              title="Superset PLFS Dashboard"
              onError={() => {}}
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none" id="iframe-overlay">
              {/* Fallback shown when iframe is blocked */}
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">Note: If the dashboard doesn't load, open Superset directly and sign in first (admin/admin), then return here.</p>
        </div>

        {/* Dashboard gallery */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Available Dashboards</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {DASHBOARDS.map(d => (
              <a key={d.id} href={`${SUPERSET_URL}/superset/dashboard/${d.id}`} target="_blank"
                className="flex items-start gap-3 p-3 rounded-xl border hover:border-brand-primary hover:bg-blue-50 transition-colors no-underline group">
                <span className="text-2xl">{d.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-semibold text-gray-800 truncate">{d.name}</span>
                    <span className="badge-bronze text-[10px] shrink-0">{d.tag}</span>
                  </div>
                  <p className="text-xs text-gray-500 line-clamp-2">{d.desc}</p>
                </div>
                <ExternalLink size={12} className="text-gray-300 group-hover:text-brand-primary mt-1 shrink-0" />
              </a>
            ))}
          </div>
        </div>

        {/* GIS Preview */}
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <Map className="w-4 h-4 text-brand-primary" />
            <h2 className="text-sm font-semibold text-gray-700">GIS Choropleth Maps</h2>
          </div>
          <div className="bg-gradient-to-br from-blue-900 via-blue-700 to-blue-500 rounded-xl h-64 flex items-center justify-center relative overflow-hidden">
            {/* India map SVG placeholder */}
            <div className="absolute inset-0 opacity-10">
              <div className="grid grid-cols-8 gap-1 p-4 h-full">
                {Array.from({ length: 32 }).map((_, i) => (
                  <div key={i} className="bg-white rounded" style={{ opacity: 0.2 + Math.random() * 0.8 }} />
                ))}
              </div>
            </div>
            <div className="text-center z-10">
              <Map className="w-12 h-12 mx-auto mb-3 text-white opacity-70" />
              <p className="text-white font-medium text-sm">District-level PostGIS Choropleth</p>
              <p className="text-blue-200 text-xs mt-1">Unemployment Rate · MPCE · WPR by sector</p>
              <a href={`${SUPERSET_URL}/superset/dashboard/3`} target="_blank"
                className="mt-3 inline-flex items-center gap-1.5 bg-white text-brand-primary px-4 py-1.5 rounded-full text-xs font-medium hover:bg-blue-50 transition-colors">
                <ExternalLink size={12} /> Open GIS Dashboard
              </a>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Powered by PostGIS geometry columns in bronze_submissions + Deck.gl ScatterplotLayer in Superset.
            State boundaries from GADM India GeoJSON loaded in 02_seed.sql.
          </p>
        </div>

        {/* Airflow DAG status */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Airflow DAG Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { id: "bronze_to_silver", name: "Bronze → Silver", schedule: "Every 15 min", desc: "Promotes raw submissions, runs basic DQ rules", status: "active" },
              { id: "silver_to_gold", name: "Silver → Gold", schedule: "Daily 02:00 UTC", desc: "Aggregates to state×sector gold layer", status: "active" },
            ].map(dag => (
              <a key={dag.id} href={`${AIRFLOW_URL}/dags/${dag.id}`} target="_blank"
                className="flex items-start gap-3 p-3 rounded-xl border hover:border-brand-primary transition-colors no-underline">
                <div className="w-2.5 h-2.5 rounded-full bg-green-400 mt-1 shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-800">{dag.name}</span>
                    <span className="badge-pass text-[10px]">{dag.status}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{dag.desc}</p>
                  <p className="text-xs text-gray-400 mt-0.5">⏱ {dag.schedule}</p>
                </div>
                <ExternalLink size={12} className="text-gray-300 mt-1" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
