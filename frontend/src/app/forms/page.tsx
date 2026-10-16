"use client";
import AppShell from "@/components/layout/AppShell";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { surveyApi } from "@/lib/api";
import { useState, useRef, Suspense, useCallback, useEffect } from "react";
import {
  Upload, Plus, Trash2, ChevronDown, ChevronUp,
  BookOpen, X, Search, Zap, CheckCheck, GitBranch,
  Sparkles, ChevronRight
} from "lucide-react";
import api from "@/lib/api";
import { useSearchParams } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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

const DEFAULT_QUESTION = { type: "text", name: "", label: "", required: false, choices: "", skip_logic: "" };

const TYPE_COLORS: Record<string, string> = {
  select_one: "bg-purple-100 text-purple-700",
  select_multiple: "bg-indigo-100 text-indigo-700",
  integer: "bg-blue-100 text-blue-700",
  decimal: "bg-cyan-100 text-cyan-700",
  text: "bg-gray-100 text-gray-700",
  date: "bg-green-100 text-green-700",
  geopoint: "bg-rose-100 text-rose-700",
  image: "bg-orange-100 text-orange-700",
};

// ── Question Bank Sidebar ────────────────────────────────────────────────────
function QuestionBankSidebar({
  onAdd,
  onClose,
}: {
  onAdd: (q: any) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [addedId, setAddedId] = useState<string | null>(null);

  const token = () => localStorage.getItem("token") || "";

  const search = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "15" });
      if (q) params.set("q", q);
      const res = await fetch(`${API}/question-bank?${params}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    search("");
  }, [search]);

  useEffect(() => {
    const t = setTimeout(() => search(query), 300);
    return () => clearTimeout(t);
  }, [query, search]);

  const handleAdd = (q: any) => {
    onAdd({
      type: q.question_type,
      name: q.field_name,
      label: q.question_text,
      required: false,
      choices: q.choices || "",
      skip_logic: "",
    });
    // Record usage
    fetch(`${API}/question-bank/${q.id}/use`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token()}` },
    });
    setAddedId(q.id);
    setTimeout(() => setAddedId(null), 1500);
  };

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-blue-50">
        <div className="flex items-center gap-2">
          <BookOpen size={16} className="text-brand-primary" />
          <span className="text-sm font-bold text-gray-900">Question Bank</span>
          <span className="text-[10px] font-bold bg-amber-400 text-amber-900 rounded px-1.5 py-0.5">WoW</span>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400">
          <X size={16} />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-3 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={13} />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search questions…"
            className="w-full pl-8 pr-3 py-2 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-primary outline-none"
          />
        </div>
        <p className="text-xs text-gray-400 mt-1.5 text-center">
          {loading ? "Searching…" : `${results.length} questions · PLFS · HCES · ASI · NSS`}
        </p>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto py-2">
        {results.map(q => (
          <div key={q.id}
            className="mx-2 mb-2 px-3 py-2.5 rounded-lg border border-gray-100 hover:border-brand-primary hover:bg-blue-50 transition-colors group cursor-pointer"
            onClick={() => handleAdd(q)}
          >
            <div className="flex items-start gap-2">
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${TYPE_COLORS[q.question_type] || "bg-gray-100 text-gray-600"}`}>
                {q.question_type}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-800 leading-snug line-clamp-2">{q.question_text}</p>
                <div className="flex items-center gap-2 mt-1">
                  <code className="text-[10px] text-brand-primary font-mono">{q.field_name}</code>
                  <span className="text-[10px] text-gray-400">{q.source_survey}</span>
                </div>
              </div>
              <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                {addedId === q.id
                  ? <CheckCheck size={14} className="text-green-500" />
                  : <Plus size={14} className="text-brand-primary" />
                }
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="px-3 py-3 border-t border-gray-100 text-center">
        <p className="text-xs text-gray-400">Click any question to add it to your form</p>
      </div>
    </div>
  );
}

// ── Skip Logic Widget ────────────────────────────────────────────────────────
function SkipLogicWidget({
  value,
  onChange,
  questionIndex,
  allQuestions,
}: {
  value: string;
  onChange: (v: string) => void;
  questionIndex: number;
  allQuestions: any[];
}) {
  const [plainText, setPlainText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [showWidget, setShowWidget] = useState(false);

  const token = () => localStorage.getItem("token") || "";

  const generate = async () => {
    if (!plainText.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/simulator/skip-logic`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          plain_english: plainText,
          available_fields: allQuestions.slice(0, questionIndex).map(q => ({
            name: q.name, type: q.type, choices: q.choices
          })),
        }),
      });
      const data = await res.json();
      setResult(data);
    } finally {
      setLoading(false);
    }
  };

  const apply = () => {
    if (result?.xlsform_expression) {
      onChange(result.xlsform_expression);
      setShowWidget(false);
      setResult(null);
      setPlainText("");
    }
  };

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
          Skip Logic (relevant)
        </label>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="e.g. ${sector}='Rural'"
          className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 font-mono focus:ring-1 focus:ring-brand-primary outline-none"
        />
        <button
          onClick={() => setShowWidget(!showWidget)}
          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-purple-200 text-purple-700 hover:bg-purple-50 whitespace-nowrap"
          title="AI Skip Logic Assistant"
        >
          <Sparkles size={11} />
          SLM Assist
        </button>
      </div>

      {showWidget && (
        <div className="mt-2 bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-2">
          <p className="text-xs font-medium text-purple-800 flex items-center gap-1">
            <Zap size={12} />
            Describe in plain English — get XLSForm expression
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={plainText}
              onChange={e => setPlainText(e.target.value)}
              onKeyDown={e => e.key === "Enter" && generate()}
              placeholder="e.g. Show only if age >= 15 and sector is Rural"
              className="flex-1 text-xs border border-purple-200 rounded px-2 py-1.5 bg-white focus:ring-1 focus:ring-purple-400 outline-none"
            />
            <button
              onClick={generate}
              disabled={loading || !plainText.trim()}
              className="text-xs px-3 py-1.5 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
            >
              {loading ? "…" : "Generate"}
            </button>
          </div>

          {result && (
            <div className="bg-white rounded border border-purple-200 p-2 space-y-1">
              <code className="text-xs font-mono text-brand-primary block">{result.xlsform_expression}</code>
              <p className="text-[11px] text-gray-500">{result.explanation}</p>
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-medium rounded px-1.5 py-0.5 ${
                  result.confidence === "high" ? "bg-green-100 text-green-700"
                  : result.confidence === "medium" ? "bg-amber-100 text-amber-700"
                  : "bg-gray-100 text-gray-600"
                }`}>{result.confidence} confidence</span>
                <button onClick={apply}
                  className="text-xs px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1">
                  <CheckCheck size={11} /> Apply
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main forms content ───────────────────────────────────────────────────────
function FormsContent() {
  const qc = useQueryClient();
  const params = useSearchParams();
  const defaultSurvey = params.get("survey") || "";

  const [tab, setTab] = useState<"upload" | "builder">("upload");
  const [surveyId, setSurveyId] = useState(defaultSurvey);
  const [file, setFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [questions, setQuestions] = useState([
    { ...DEFAULT_QUESTION, name: "hh_id", label: "Household ID", required: true },
  ]);
  const [showQBank, setShowQBank] = useState(false);
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
  const addFromBank = (q: any) => setQuestions(qs => [...qs, q]);
  const removeQuestion = (i: number) => setQuestions(qs => qs.filter((_, idx) => idx !== i));
  const moveUp = (i: number) => { if (i === 0) return; const qs = [...questions]; [qs[i-1], qs[i]] = [qs[i], qs[i-1]]; setQuestions(qs); };
  const moveDown = (i: number) => { if (i === questions.length-1) return; const qs = [...questions]; [qs[i], qs[i+1]] = [qs[i+1], qs[i]]; setQuestions(qs); };
  const updateQ = (i: number, field: string, val: any) =>
    setQuestions(qs => qs.map((q, idx) => idx === i ? { ...q, [field]: val } : q));

  const hasSkipLogic = questions.some(q => q.skip_logic);

  return (
    <div className="flex h-full">
      {/* Main panel */}
      <div className="flex-1 p-6 space-y-6 overflow-y-auto">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-brand-primary">Form Management</h1>
            {tab === "builder" && (
              <button
                onClick={() => setShowQBank(!showQBank)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                  showQBank
                    ? "bg-brand-primary text-white border-brand-primary"
                    : "border-gray-200 text-gray-600 hover:border-brand-primary hover:text-brand-primary"
                }`}
              >
                <BookOpen size={13} />
                Question Bank
                <span className="text-[10px] bg-amber-400 text-amber-900 rounded px-1">WoW</span>
              </button>
            )}
          </div>
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

            <div className="card">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">XLSForm Structure Guide</h3>
              <div className="overflow-x-auto text-xs font-mono bg-gray-50 rounded-lg p-3 space-y-1">
                <div className="font-bold text-gray-600 mb-2">survey sheet:</div>
                <div className="grid grid-cols-5 gap-2 text-gray-500 border-b pb-1 mb-1">
                  <span>type</span><span>name</span><span>label</span><span>required</span><span>relevant</span>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  <span>text</span><span>hh_id</span><span>Household ID</span><span>yes</span><span></span>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  <span>select_one sector</span><span>sector</span><span>Sector</span><span>yes</span><span></span>
                </div>
                <div className="grid grid-cols-5 gap-2 text-purple-600">
                  <span>integer</span><span>hh_size</span><span>HH Size</span><span>yes</span><span className="text-[10px]">{"${sector}='Rural'"}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "builder" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Visual form builder — questions exported as XLSForm and deployed to ODK Central.</p>
                {hasSkipLogic && (
                  <p className="text-xs text-purple-600 mt-0.5 flex items-center gap-1">
                    <GitBranch size={11} />
                    {questions.filter(q => q.skip_logic).length} question{questions.filter(q => q.skip_logic).length > 1 ? "s" : ""} have skip logic
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={addQuestion} className="btn-primary text-xs gap-1.5">
                  <Plus size={14} /> Add Question
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {questions.map((q, i) => (
                <div key={i} className={`card border-l-4 space-y-3 ${q.skip_logic ? "border-l-purple-500" : "border-l-brand-primary"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-400">Q{i + 1}</span>
                      {q.skip_logic && (
                        <span className="text-[10px] flex items-center gap-1 text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
                          <GitBranch size={9} />
                          skip logic
                        </span>
                      )}
                    </div>
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
                      <input className="input text-xs font-mono" placeholder="hh_id" value={q.name} onChange={e => updateQ(i, "name", e.target.value)} />
                    </div>
                    <div className="md:col-span-1">
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

                  {/* Skip Logic Widget */}
                  {i > 0 && (
                    <SkipLogicWidget
                      value={q.skip_logic}
                      onChange={v => updateQ(i, "skip_logic", v)}
                      questionIndex={i}
                      allQuestions={questions}
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-3 flex-wrap">
              <button onClick={() => saveMut.mutate()} disabled={!surveyId || saveMut.isPending} className="btn-primary gap-2">
                {saveMut.isPending ? "Saving & deploying…" : "💾 Save & Deploy to ODK"}
              </button>
              {saveMut.isSuccess && <span className="text-sm text-green-600 self-center">✓ Form deployed successfully</span>}

              <a href="/simulator" className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:border-brand-primary hover:text-brand-primary transition-colors">
                <Sparkles size={14} />
                Preview in Simulator
                <ChevronRight size={14} />
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Question Bank sidebar */}
      {tab === "builder" && showQBank && (
        <QuestionBankSidebar onAdd={addFromBank} onClose={() => setShowQBank(false)} />
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
