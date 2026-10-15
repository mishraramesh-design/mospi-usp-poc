"use client";
import AppShell from "@/components/layout/AppShell";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { surveyApi } from "@/lib/api";
import { useState, useRef, Suspense } from "react";
import { Upload, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import api from "@/lib/api";
import { useSearchParams } from "next/navigation";

const QUESTION_TYPES = [
  { value: "text", label: "Short Text" },
  { value: "integer", label: "Integer" },
  { value: "decimal", label: "Decimal" },
  { value: "select_one", label: "Single Choice" },
  { value: "select_multiple", label: "Multi Choice" },
  { value: "date", label: "Date" },
  { value: "geopoint", label: "GPS Location" },
  { value: "image", label: "Photo" },
];

const DEFAULT_QUESTION = { type: "text", name: "", label: "", required: false, choices: "" };

function FormsContent() {
  const qc = useQueryClient();
  const params = useSearchParams();
  const defaultSurvey = params.get("survey") || "";

  const [tab, setTab] = useState<"upload" | "builder">("upload");
  const [surveyId, setSurveyId] = useState(defaultSurvey);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [questions, setQuestions] = useState([{ ...DEFAULT_QUESTION, name: "hh_id", label: "Household ID", required: true, choices: "" }]);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: surveys } = useQuery({ queryKey: ["surveys"], queryFn: () => surveyApi.list().then(r => r.data) });

  const uploadMut = useMutation({
    mutationFn: async () => {
      if (!file || !surveyId) return;
      const fd = new FormData();
      fd.append("file", file);
      return api.post(`/forms/${surveyId}/upload-xlsform`, fd, { headers: { "Content-Type": "multipart/form-data" } }).then(r => r.data);
    },
    onSuccess: (data) => { setUploadResult(data); setFile(null); if (fileRef.current) fileRef.current.value = ""; }
  });

  const saveMut = useMutation({
    mutationFn: () => api.post("/forms/builder/save", { survey_id: surveyId, questions }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["surveys"] })
  });

  const addQuestion = () => setQuestions(qs => [...qs, { ...DEFAULT_QUESTION }]);
  const removeQuestion = (i: number) => setQuestions(qs => qs.filter((_, idx) => idx !== i));
  const moveUp = (i: number) => { if (i === 0) return; const qs = [...questions]; [qs[i-1], qs[i]] = [qs[i], qs[i-1]]; setQuestions(qs); };
  const moveDown = (i: number) => { if (i === questions.length-1) return; const qs = [...questions]; [qs[i], qs[i+1]] = [qs[i+1], qs[i]]; setQuestions(qs); };
  const updateQ = (i: number, field: string, val: any) => {
    setQuestions(qs => qs.map((q, idx) => idx === i ? { ...q, [field]: val } : q));
  };

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-primary">Form Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Upload XLSForm or use the visual builder to create ODK-compatible survey forms</p>
        </div>

        {/* Survey selector */}
        <div className="flex gap-3 items-center">
          <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Survey:</label>
          <select className="input w-auto text-sm" value={surveyId} onChange={e => setSurveyId(e.target.value)}>
            <option value="">— select survey —</option>
            {(surveys || []).map((s: any) => <option key={s.id} value={s.id}>{s.code} — {s.title}</option>)}
          </select>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b">
          {(["upload", "builder"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-6 py-2.5 text-sm font-medium capitalize transition-colors ${tab === t ? "border-b-2 border-brand-primary text-brand-primary" : "text-gray-500 hover:text-gray-700"}`}>
              {t === "upload" ? "📤 XLSForm Upload" : "🎨 Visual Builder"}
            </button>
          ))}
        </div>

        {tab === "upload" && (
          <div className="max-w-2xl space-y-5">
            <div className="card space-y-4">
              <h2 className="text-sm font-semibold text-gray-700">Upload XLSForm (.xlsx)</h2>
              <p className="text-xs text-gray-500">Upload a standard XLSForm Excel file. It will be converted to XForm XML and deployed to ODK Central automatically.</p>

              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-brand-primary hover:bg-blue-50 transition-colors">
                <Upload className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                {file ? (
                  <div>
                    <p className="text-sm font-medium text-brand-primary">{file.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-gray-500">Click to select an XLSForm file</p>
                    <p className="text-xs text-gray-400 mt-1">.xlsx format required</p>
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />

              <button
                onClick={() => uploadMut.mutate()}
                disabled={!file || !surveyId || uploadMut.isPending}
                className="btn-primary w-full justify-center gap-2">
                <Upload size={14} />
                {uploadMut.isPending ? "Uploading & deploying…" : "Upload & Deploy to ODK"}
              </button>

              {uploadResult && (
                <div className={`rounded-xl p-4 ${uploadResult.success ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                  <p className={`text-sm font-medium ${uploadResult.success ? "text-green-700" : "text-red-700"}`}>
                    {uploadResult.success ? "✓ " : "✗ "}{uploadResult.message || "Upload complete"}
                  </p>
                  {uploadResult.form_id && <p className="text-xs text-gray-500 mt-1">Form ID: {uploadResult.form_id}</p>}
                </div>
              )}
            </div>

            {/* Sample XLSForm format */}
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">XLSForm Structure Guide</h3>
              <div className="overflow-x-auto text-xs font-mono bg-gray-50 rounded-lg p-3 space-y-1">
                <div className="font-bold text-gray-600 mb-2">survey sheet:</div>
                <div className="grid grid-cols-4 gap-2 text-gray-500 border-b pb-1 mb-1">
                  <span>type</span><span>name</span><span>label</span><span>required</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <span>text</span><span>hh_id</span><span>Household ID</span><span>yes</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <span>select_one sector</span><span>sector</span><span>Sector</span><span>yes</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <span>integer</span><span>hh_size</span><span>HH Size</span><span>yes</span>
                </div>
                <div className="font-bold text-gray-600 mt-3 mb-2">choices sheet:</div>
                <div className="grid grid-cols-3 gap-2 text-gray-500 border-b pb-1 mb-1">
                  <span>list_name</span><span>name</span><span>label</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span>sector</span><span>rural</span><span>Rural</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span>sector</span><span>urban</span><span>Urban</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "builder" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">Drag-and-drop style visual form builder. Questions are exported as XLSForm and deployed to ODK Central.</p>
              <button onClick={addQuestion} className="btn-primary text-xs gap-1.5">
                <Plus size={14} /> Add Question
              </button>
            </div>

            <div className="space-y-3">
              {questions.map((q, i) => (
                <div key={i} className="card border-l-4 border-brand-primary space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-400">Question {i + 1}</span>
                    <div className="flex gap-1">
                      <button onClick={() => moveUp(i)} className="p-1 text-gray-400 hover:text-gray-600"><ChevronUp size={14} /></button>
                      <button onClick={() => moveDown(i)} className="p-1 text-gray-400 hover:text-gray-600"><ChevronDown size={14} /></button>
                      <button onClick={() => removeQuestion(i)} className="p-1 text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="label">Type</label>
                      <select className="input text-xs" value={q.type} onChange={e => updateQ(i, "type", e.target.value)}>
                        {QUESTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Field Name</label>
                      <input className="input text-xs" placeholder="hh_id" value={q.name} onChange={e => updateQ(i, "name", e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Label</label>
                      <input className="input text-xs" placeholder="Household ID" value={q.label} onChange={e => updateQ(i, "label", e.target.value)} />
                    </div>
                    <div className="flex items-end pb-1">
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input type="checkbox" checked={q.required} onChange={e => updateQ(i, "required", e.target.checked)} className="rounded" />
                        Required
                      </label>
                    </div>
                  </div>
                  {(q.type === "select_one" || q.type === "select_multiple") && (
                    <div>
                      <label className="label">Choices (comma-separated)</label>
                      <input className="input text-xs" placeholder="Rural, Urban, Semi-Urban" value={q.choices} onChange={e => updateQ(i, "choices", e.target.value)} />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button onClick={() => saveMut.mutate()} disabled={!surveyId || saveMut.isPending} className="btn-primary gap-2">
                {saveMut.isPending ? "Saving & deploying…" : "💾 Save & Deploy to ODK"}
              </button>
              {saveMut.isSuccess && <span className="text-sm text-green-600 self-center">✓ Form deployed successfully</span>}
            </div>
          </div>
        )}
      </div>
  );
}

export default function FormsPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="p-6 text-gray-400">Loading…</div>}>
        <FormsContent />
      </Suspense>
    </AppShell>
  );
}
