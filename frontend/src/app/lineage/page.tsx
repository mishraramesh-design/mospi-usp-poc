"use client";
import AppShell from "@/components/layout/AppShell";
import { useQuery } from "@tanstack/react-query";
import { lineageApi } from "@/lib/api";
import { useState } from "react";
import { GitBranch, Search } from "lucide-react";

const STAGE_COLORS: Record<string, string> = {
  bronze_ingestion: "bg-amber-100 text-amber-800 border-amber-200",
  silver_promotion: "bg-gray-100 text-gray-700 border-gray-200",
  dq_check: "bg-blue-100 text-blue-800 border-blue-200",
  gold_aggregation: "bg-yellow-100 text-yellow-700 border-yellow-200",
  tabulation: "bg-purple-100 text-purple-800 border-purple-200",
};

export default function LineagePage() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: feed } = useQuery({ queryKey: ["lineage-feed"], queryFn: () => lineageApi.feed().then(r => r.data) });
  const { data: stats } = useQuery({ queryKey: ["lineage-stats"], queryFn: () => lineageApi.stats().then(r => r.data) });
  const { data: trail } = useQuery({
    queryKey: ["lineage-trail", selectedId],
    queryFn: () => selectedId ? lineageApi.trail(selectedId).then(r => r.data) : null,
    enabled: !!selectedId
  });

  const filteredFeed = (feed || []).filter((e: any) =>
    !search || e.record_id?.includes(search) || e.stage?.includes(search) || e.survey_code?.includes(search)
  );

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <GitBranch className="w-6 h-6 text-brand-primary" />
          <div>
            <h1 className="text-2xl font-bold text-brand-primary">Data Lineage</h1>
            <p className="text-sm text-gray-500">Full audit trail — track every record from Bronze submission to Gold aggregate</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total Events", value: stats?.total_events, color: "text-brand-primary" },
            { label: "Bronze Ingested", value: stats?.bronze_events, color: "text-amber-700" },
            { label: "Silver Promoted", value: stats?.silver_events, color: "text-gray-700" },
            { label: "Gold Aggregated", value: stats?.gold_events, color: "text-yellow-600" },
          ].map(s => (
            <div key={s.label} className="card text-center">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value ?? "—"}</div>
              <div className="text-xs text-gray-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Event feed */}
          <div className="card space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-700 flex-1">Lineage Event Feed</h2>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input className="input pl-7 text-xs py-1 w-48" placeholder="Search record / stage…"
                  value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5 max-h-96 overflow-y-auto">
              {filteredFeed.map((e: any) => (
                <div key={e.id}
                  onClick={() => setSelectedId(e.record_id)}
                  className={`flex items-start gap-3 p-2.5 rounded-lg cursor-pointer hover:bg-gray-50 border transition-colors ${selectedId === e.record_id ? "border-brand-primary bg-blue-50" : "border-transparent"}`}>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium whitespace-nowrap ${STAGE_COLORS[e.stage] || "bg-gray-100 text-gray-700"}`}>
                    {e.stage?.replace(/_/g, " ")}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-600 truncate">{e.record_id?.slice(-16)}</span>
                      {e.survey_code && <span className="badge-bronze text-[10px]">{e.survey_code}</span>}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{new Date(e.event_time).toLocaleString()}</p>
                  </div>
                </div>
              ))}
              {filteredFeed.length === 0 && (
                <div className="text-center py-8 text-gray-400 text-sm">No events found</div>
              )}
            </div>
          </div>

          {/* Trail detail */}
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">
              {selectedId ? `Trail for …${selectedId.slice(-20)}` : "Select a record to view its trail"}
            </h2>
            {trail ? (
              <div className="space-y-0">
                {(trail.events || []).map((e: any, i: number) => (
                  <div key={e.id} className="flex gap-3">
                    {/* Timeline spine */}
                    <div className="flex flex-col items-center">
                      <div className={`w-3 h-3 rounded-full border-2 mt-1 flex-shrink-0 ${
                        e.stage === "bronze_ingestion" ? "border-amber-500 bg-amber-100" :
                        e.stage === "silver_promotion" ? "border-gray-400 bg-gray-100" :
                        e.stage === "gold_aggregation" ? "border-yellow-500 bg-yellow-100" :
                        "border-blue-400 bg-blue-100"
                      }`} />
                      {i < (trail.events.length - 1) && <div className="w-0.5 h-full bg-gray-200 mt-1" />}
                    </div>
                    <div className="pb-4 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STAGE_COLORS[e.stage] || "bg-gray-100 text-gray-700"}`}>
                          {e.stage?.replace(/_/g, " ")}
                        </span>
                        <span className="text-xs text-gray-400">{new Date(e.event_time).toLocaleString()}</span>
                      </div>
                      {e.actor && <p className="text-xs text-gray-500">Actor: {e.actor}</p>}
                      {e.metadata && (
                        <pre className="text-xs bg-gray-50 rounded p-2 mt-1 overflow-x-auto max-h-24 text-gray-600">
                          {JSON.stringify(e.metadata, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-48 text-gray-400">
                <div className="text-center">
                  <GitBranch className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Click a record in the feed to see its full lineage trail</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
