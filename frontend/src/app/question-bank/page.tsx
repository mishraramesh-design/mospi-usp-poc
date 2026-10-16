"use client";
import { useEffect, useState, useCallback } from "react";
import AppShell from "@/components/layout/AppShell";
import {
  Search, BookOpen, Plus, ChevronDown, ChevronUp,
  Copy, CheckCheck, Zap, Filter, RefreshCw, X
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Question {
  id: string;
  question_text: string;
  field_name: string;
  question_type: string;
  choices: string | null;
  source_survey: string;
  source_round: string | null;
  section: string | null;
  tags: string[];
  usage_count: number;
  score: number;
}

const TYPE_COLORS: Record<string, string> = {
  select_one:      "bg-purple-100 text-purple-700",
  select_multiple: "bg-indigo-100 text-indigo-700",
  integer:         "bg-blue-100 text-blue-700",
  decimal:         "bg-cyan-100 text-cyan-700",
  text:            "bg-gray-100 text-gray-700",
  date:            "bg-green-100 text-green-700",
  geopoint:        "bg-rose-100 text-rose-700",
  image:           "bg-orange-100 text-orange-700",
};

const SOURCE_COLORS: Record<string, string> = {
  PLFS:    "border-l-4 border-l-blue-500",
  HCES:    "border-l-4 border-l-emerald-500",
  ASI:     "border-l-4 border-l-purple-500",
  NSS:     "border-l-4 border-l-amber-500",
  CAPEX:   "border-l-4 border-l-rose-500",
  CENSUS:  "border-l-4 border-l-gray-500",
};

export default function QuestionBankPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [sources, setSources]     = useState<{source: string; count: number}[]>([]);
  const [sections, setSections]   = useState<string[]>([]);
  const [loading, setLoading]     = useState(false);

  // Filters
  const [query, setQuery]         = useState("");
  const [selSource, setSelSource] = useState("");
  const [selSection, setSelSection] = useState("");
  const [selType, setSelType]     = useState("");

  // UI state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId]   = useState<string | null>(null);
  const [addedToast, setAddedToast] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const token = () =>
    typeof window !== "undefined"
      ? localStorage.getItem("token") || ""
      : "";

  const fetchMeta = useCallback(async () => {
    const headers = { Authorization: `Bearer ${token()}` };
    const [src, sec] = await Promise.all([
      fetch(`${API}/question-bank/sources`, { headers }).then(r => r.json()),
      fetch(`${API}/question-bank/sections`, { headers }).then(r => r.json()),
    ]);
    setSources(src || []);
    setSections(sec || []);
  }, []);

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query)      params.set("q", query);
      if (selSource)  params.set("source", selSource);
      if (selSection) params.set("section", selSection);
      if (selType)    params.set("q_type", selType);
      params.set("limit", "40");

      const res = await fetch(`${API}/question-bank?${params}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const data = await res.json();
      setQuestions(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [query, selSource, selSection, selType]);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(fetchQuestions, 300);
    return () => clearTimeout(t);
  }, [fetchQuestions]);

  const copyFieldName = async (q: Question) => {
    await navigator.clipboard.writeText(q.field_name);
    setCopiedId(q.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const addToForm = async (q: Question) => {
    // Increment usage in backend
    fetch(`${API}/question-bank/${q.id}/use`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token()}` },
    });

    // Copy XLSForm snippet to clipboard
    const snippet = [
      `type\tname\tlabel`,
      `${q.question_type}\t${q.field_name}\t${q.question_text}`,
      q.choices ? `\n# Choices for ${q.field_name}:\n${q.choices.split(",").map(c => `\t${c.trim()}\t${c.trim()}`).join("\n")}` : "",
    ].join("\n");
    await navigator.clipboard.writeText(snippet);

    setAddedToast(q.field_name);
    setTimeout(() => setAddedToast(null), 2500);
  };

  const clearFilters = () => {
    setQuery("");
    setSelSource("");
    setSelSection("");
    setSelType("");
  };

  const hasFilters = query || selSource || selSection || selType;

  return (
    <AppShell>
      <div className="p-6 max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <BookOpen className="text-brand-primary" size={24} />
            <h1 className="text-2xl font-bold text-gray-900">Institutional Memory — Question Bank</h1>
            <span className="text-xs font-bold bg-amber-400 text-amber-900 rounded px-2 py-1">WoW Feature</span>
          </div>
          <p className="text-sm text-gray-500 ml-9">
            Reuse proven questions from PLFS · HCES · ASI · NSS · CAPEX.
            pg_trgm semantic search — no AI model needed.
          </p>
        </div>

        {/* Search bar */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search questions… e.g. 'monthly expenditure', 'employment status', 'toilet'"
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-primary focus:border-transparent outline-none"
              />
              {query && (
                <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                showFilters || hasFilters
                  ? "bg-brand-primary text-white border-brand-primary"
                  : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              <Filter size={14} />
              Filters
              {hasFilters && !showFilters && (
                <span className="w-2 h-2 rounded-full bg-amber-400" />
              )}
            </button>
            <button onClick={fetchQuestions} className="p-2.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50" title="Refresh">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>

          {/* Filter row */}
          {showFilters && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-3 items-center">
              <select
                value={selSource}
                onChange={e => setSelSource(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-700 focus:ring-2 focus:ring-brand-primary outline-none"
              >
                <option value="">All Surveys</option>
                {sources.map(s => (
                  <option key={s.source} value={s.source}>{s.source} ({s.count})</option>
                ))}
              </select>

              <select
                value={selSection}
                onChange={e => setSelSection(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-700 focus:ring-2 focus:ring-brand-primary outline-none"
              >
                <option value="">All Sections</option>
                {sections.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>

              <select
                value={selType}
                onChange={e => setSelType(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-700 focus:ring-2 focus:ring-brand-primary outline-none"
              >
                <option value="">All Types</option>
                {["select_one", "select_multiple", "integer", "decimal", "text", "date", "geopoint", "image"].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>

              {hasFilters && (
                <button onClick={clearFilters} className="text-sm text-red-500 hover:text-red-700 flex items-center gap-1">
                  <X size={13} /> Clear filters
                </button>
              )}
            </div>
          )}
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex gap-3 flex-wrap">
            {sources.map(s => (
              <button
                key={s.source}
                onClick={() => setSelSource(selSource === s.source ? "" : s.source)}
                className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                  selSource === s.source
                    ? "bg-brand-primary text-white border-brand-primary"
                    : "border-gray-200 text-gray-600 hover:border-gray-300 bg-white"
                }`}
              >
                {s.source} · {s.count}
              </button>
            ))}
          </div>
          <div className="ml-auto text-xs text-gray-400">
            {loading ? "Searching…" : `${questions.length} question${questions.length !== 1 ? "s" : ""} found`}
          </div>
        </div>

        {/* Question list */}
        <div className="space-y-2">
          {questions.length === 0 && !loading && (
            <div className="text-center py-16 text-gray-400">
              <BookOpen size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No questions found. Try a different search term.</p>
            </div>
          )}

          {questions.map(q => {
            const expanded = expandedId === q.id;
            const sourceBorder = SOURCE_COLORS[q.source_survey] || "border-l-4 border-l-gray-300";

            return (
              <div
                key={q.id}
                className={`bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow ${sourceBorder} overflow-hidden`}
              >
                <div
                  className="px-5 py-4 cursor-pointer flex items-start gap-4"
                  onClick={() => setExpandedId(expanded ? null : q.id)}
                >
                  {/* Type badge */}
                  <span className={`mt-0.5 text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${TYPE_COLORS[q.question_type] || "bg-gray-100 text-gray-600"}`}>
                    {q.question_type}
                  </span>

                  {/* Question text */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 leading-snug">{q.question_text}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <code className="text-xs text-brand-primary bg-blue-50 rounded px-1.5 py-0.5 font-mono">{q.field_name}</code>
                      <span className="text-xs text-gray-400">{q.source_survey} {q.source_round && `· ${q.source_round}`}</span>
                      {q.section && <span className="text-xs text-gray-400">· {q.section}</span>}
                      {q.usage_count > 0 && (
                        <span className="text-xs text-emerald-600 font-medium">Used {q.usage_count}×</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => copyFieldName(q)}
                      className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50 transition-colors"
                      title="Copy field name"
                    >
                      {copiedId === q.id ? <CheckCheck size={14} className="text-green-500" /> : <Copy size={14} />}
                    </button>
                    <button
                      onClick={() => addToForm(q)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-primary text-white rounded-lg text-xs font-medium hover:bg-brand-dark transition-colors"
                      title="Copy XLSForm snippet to clipboard"
                    >
                      <Plus size={13} />
                      Add to Form
                    </button>
                  </div>

                  <button className="text-gray-400 flex-shrink-0">
                    {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>

                {/* Expanded detail */}
                {expanded && (
                  <div className="px-5 pb-5 pt-0 border-t border-gray-100 bg-gray-50">
                    <div className="grid grid-cols-2 gap-4 mt-3">
                      {q.choices && (
                        <div className="col-span-2">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Response Options</p>
                          <div className="flex flex-wrap gap-1.5">
                            {q.choices.split(",").map(c => (
                              <span key={c.trim()} className="text-xs bg-white border border-gray-200 rounded-full px-2.5 py-0.5 text-gray-700">
                                {c.trim()}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {q.tags.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tags</p>
                          <div className="flex flex-wrap gap-1">
                            {q.tags.map(t => (
                              <span key={t} className="text-xs bg-blue-50 text-blue-600 rounded px-2 py-0.5">{t}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">XLSForm row</p>
                        <pre className="text-xs bg-gray-900 text-green-400 rounded-lg p-3 overflow-x-auto font-mono">
{`type: ${q.question_type}
name: ${q.field_name}
label: ${q.question_text.slice(0, 60)}${q.question_text.length > 60 ? "…" : ""}`}
                        </pre>
                      </div>

                      <div className="flex items-start gap-2 col-span-2 mt-1">
                        <Zap size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-gray-500">
                          This question is from <strong>{q.source_survey} {q.source_round}</strong> — a tested, nationally standardized wording.
                          Reusing it ensures inter-survey comparability and saves field piloting time.
                          {q.usage_count > 0 && ` Already reused ${q.usage_count} time${q.usage_count > 1 ? "s" : ""} in this platform.`}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Toast notification */}
        {addedToast && (
          <div className="fixed bottom-6 right-6 bg-gray-900 text-white rounded-xl px-5 py-3 shadow-2xl flex items-center gap-3 text-sm z-50 animate-in fade-in slide-in-from-bottom-2">
            <CheckCheck size={16} className="text-green-400" />
            <span><code className="text-green-300">{addedToast}</code> — XLSForm snippet copied to clipboard</span>
          </div>
        )}
      </div>
    </AppShell>
  );
}
