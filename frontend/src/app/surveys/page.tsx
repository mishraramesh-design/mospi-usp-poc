"use client";
import AppShell from "@/components/layout/AppShell";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { surveyApi } from "@/lib/api";
import { useState } from "react";
import Link from "next/link";
import { Plus, ExternalLink } from "lucide-react";

const ODK_URL = process.env.NEXT_PUBLIC_ODK_URL || "http://localhost:8383";

export default function SurveysPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ code: "", title: "", description: "", survey_type: "CAPI" });

  const { data: surveys, isLoading } = useQuery({ queryKey: ["surveys"], queryFn: () => surveyApi.list().then(r => r.data) });

  const createMut = useMutation({
    mutationFn: () => surveyApi.create(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["surveys"] }); setShowCreate(false); setForm({ code: "", title: "", description: "", survey_type: "CAPI" }); }
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => surveyApi.updateStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["surveys"] })
  });

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-brand-primary">Survey Management</h1>
            <p className="text-sm text-gray-500 mt-0.5">Create, manage and deploy surveys to ODK Central</p>
          </div>
          <div className="flex gap-2">
            <a href={`${ODK_URL}/#/`} target="_blank" className="btn-outline text-xs gap-1.5">
              <ExternalLink size={14} /> ODK Central
            </a>
            <button onClick={() => setShowCreate(true)} className="btn-primary text-xs gap-1.5">
              <Plus size={14} /> New Survey
            </button>
          </div>
        </div>

        {/* Create modal */}
        {showCreate && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg mx-4">
              <h2 className="text-lg font-bold text-brand-primary mb-4">New Survey</h2>
              <div className="space-y-3">
                <div>
                  <label className="label">Survey Code *</label>
                  <input className="input" placeholder="PLFS-2024-Q4" value={form.code} onChange={e => setForm({...form, code: e.target.value})} />
                </div>
                <div>
                  <label className="label">Title *</label>
                  <input className="input" placeholder="Periodic Labour Force Survey Q4 2024" value={form.title} onChange={e => setForm({...form, title: e.target.value})} />
                </div>
                <div>
                  <label className="label">Description</label>
                  <textarea className="input h-20 resize-none" value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
                </div>
                <div>
                  <label className="label">Mode</label>
                  <select className="input" value={form.survey_type} onChange={e => setForm({...form, survey_type: e.target.value})}>
                    <option value="CAPI">CAPI — Android tablet / ODK Collect</option>
                    <option value="CAWI">CAWI — Browser / Enketo</option>
                    <option value="MIXED">MIXED — Both modes</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <button onClick={() => createMut.mutate()} disabled={!form.code || !form.title || createMut.isPending} className="btn-primary flex-1 justify-center">
                  {createMut.isPending ? "Creating…" : "Create Survey"}
                </button>
                <button onClick={() => setShowCreate(false)} className="btn-ghost">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Surveys grid */}
        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Loading…</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {(surveys || []).map((s: any) => (
              <div key={s.id} className="card-hover space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="badge-bronze mb-1">{s.code}</span>
                    <h3 className="text-sm font-semibold text-gray-800 mt-1">{s.title}</h3>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{s.description}</p>
                  </div>
                  <span className={`badge ${s.status === "active" ? "badge-pass" : s.status === "closed" ? "badge-fail" : "badge-pending"}`}>
                    {s.status}
                  </span>
                </div>

                <div className="flex gap-3 text-xs text-gray-500 border-t pt-3">
                  <span><strong className="text-gray-700">{s.bronze_count}</strong> raw</span>
                  <span><strong className="text-gray-700">{s.silver_count}</strong> clean</span>
                  <span className="ml-auto">{s.survey_type}</span>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <Link href={`/forms?survey=${s.id}`} className="btn-ghost text-xs py-1 px-2">Upload Form</Link>
                  <Link href={`/pipeline?survey=${s.id}`} className="btn-ghost text-xs py-1 px-2">Pipeline</Link>
                  {s.odk_form_id && (
                    <a href={`${ODK_URL}/#/projects/${s.odk_project_id}/forms/${s.odk_form_id}`} target="_blank"
                      className="btn-ghost text-xs py-1 px-2">ODK ↗</a>
                  )}
                  {s.status === "draft" && (
                    <button onClick={() => statusMut.mutate({ id: s.id, status: "active" })}
                      className="btn-primary text-xs py-1 px-2">Activate</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
