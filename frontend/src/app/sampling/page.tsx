"use client";
import AppShell from "@/components/layout/AppShell";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { surveyApi, samplingApi } from "@/lib/api";
import { useState, useRef } from "react";
import { Upload, Play, Map } from "lucide-react";
import api from "@/lib/api";

export default function SamplingPage() {
  const qc = useQueryClient();
  const [surveyId, setSurveyId] = useState("");
  const [frameId, setFrameId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [allocConfig, setAllocConfig] = useState({ method: "proportional", total_sample: 1000 });
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: surveys } = useQuery({ queryKey: ["surveys"], queryFn: () => surveyApi.list().then(r => r.data) });
  const { data: frames } = useQuery({
    queryKey: ["frames", surveyId],
    queryFn: () => surveyId ? samplingApi.frames(surveyId).then(r => r.data) : Promise.resolve([]),
    enabled: !!surveyId
  });
  const { data: units } = useQuery({
    queryKey: ["units", frameId],
    queryFn: () => frameId ? samplingApi.units(frameId).then(r => r.data) : Promise.resolve([]),
    enabled: !!frameId
  });
  const { data: states } = useQuery({ queryKey: ["states"], queryFn: () => samplingApi.states().then(r => r.data) });

  const uploadMut = useMutation({
    mutationFn: async () => {
      if (!file || !surveyId) return;
      const fd = new FormData();
      fd.append("file", file);
      return api.post(`/sampling/frames/${surveyId}/upload`, fd, { headers: { "Content-Type": "multipart/form-data" } }).then(r => r.data);
    },
    onSuccess: (data: any) => {
      setFile(null);
      qc.invalidateQueries({ queryKey: ["frames"] });
      if (data?.frame_id) setFrameId(data.frame_id);
    }
  });

  const allocMut = useMutation({
    mutationFn: () => api.post(`/sampling/frames/${frameId}/allocate`, allocConfig).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["units"] })
  });

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Map className="w-6 h-6 text-brand-primary" />
          <div>
            <h1 className="text-2xl font-bold text-brand-primary">Sampling Management</h1>
            <p className="text-sm text-gray-500">Upload sampling frames and allocate units using stratified/PPS methods</p>
          </div>
        </div>

        {/* Survey filter */}
        <div className="flex gap-3 flex-wrap items-center">
          <select className="input w-auto text-sm" value={surveyId} onChange={e => { setSurveyId(e.target.value); setFrameId(""); }}>
            <option value="">— select survey —</option>
            {(surveys || []).map((s: any) => <option key={s.id} value={s.id}>{s.code} — {s.title}</option>)}
          </select>
          {frames?.length > 0 && (
            <select className="input w-auto text-sm" value={frameId} onChange={e => setFrameId(e.target.value)}>
              <option value="">— select frame —</option>
              {(frames || []).map((f: any) => <option key={f.id} value={f.id}>{f.name} ({f.total_population?.toLocaleString()} pop)</option>)}
            </select>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Upload panel */}
          <div className="space-y-4">
            <div className="card space-y-4">
              <h2 className="text-sm font-semibold text-gray-700">Upload Sampling Frame</h2>
              <p className="text-xs text-gray-500">CSV with columns: state_code, district_code, fsu_code, stratum, population, households</p>
              <div onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-brand-primary hover:bg-blue-50 transition-colors">
                <Upload className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                {file ? (
                  <p className="text-xs font-medium text-brand-primary">{file.name}</p>
                ) : (
                  <p className="text-xs text-gray-500">Click to select CSV</p>
                )}
              </div>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
              <button onClick={() => uploadMut.mutate()} disabled={!file || !surveyId || uploadMut.isPending} className="btn-primary w-full justify-center gap-1.5 text-xs">
                <Upload size={13} /> {uploadMut.isPending ? "Uploading…" : "Upload Frame"}
              </button>
              {uploadMut.isSuccess && <p className="text-xs text-green-600">✓ Frame uploaded</p>}
            </div>

            {frameId && (
              <div className="card space-y-3">
                <h2 className="text-sm font-semibold text-gray-700">Sample Allocation</h2>
                <div>
                  <label className="label">Method</label>
                  <select className="input text-sm" value={allocConfig.method} onChange={e => setAllocConfig({ ...allocConfig, method: e.target.value })}>
                    <option value="proportional">Proportional Stratified</option>
                    <option value="equal">Equal Allocation</option>
                    <option value="pps">PPS Sampling</option>
                  </select>
                </div>
                <div>
                  <label className="label">Total Sample Size</label>
                  <input type="number" className="input text-sm" value={allocConfig.total_sample}
                    onChange={e => setAllocConfig({ ...allocConfig, total_sample: parseInt(e.target.value) || 0 })} />
                </div>
                <button onClick={() => allocMut.mutate()} disabled={allocMut.isPending} className="btn-primary w-full justify-center gap-1.5 text-xs">
                  <Play size={13} /> {allocMut.isPending ? "Allocating…" : "Run Allocation"}
                </button>
                {allocMut.isSuccess && <p className="text-xs text-green-600">✓ Allocation complete</p>}
              </div>
            )}
          </div>

          {/* States overview */}
          <div className="lg:col-span-2 space-y-4">
            <div className="card overflow-x-auto">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">State Coverage</h2>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-gray-500 text-left uppercase">
                    <th className="py-1.5 px-2">State</th>
                    <th className="py-1.5 px-2">Code</th>
                    <th className="py-1.5 px-2">FSUs</th>
                    <th className="py-1.5 px-2">Allocated</th>
                    <th className="py-1.5 px-2">Coverage</th>
                  </tr>
                </thead>
                <tbody>
                  {(states || []).map((s: any) => (
                    <tr key={s.state_code} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-1.5 px-2 font-medium">{s.state_name}</td>
                      <td className="py-1.5 px-2 font-mono">{s.state_code}</td>
                      <td className="py-1.5 px-2">{s.fsu_count ?? "—"}</td>
                      <td className="py-1.5 px-2">{s.allocated ?? "—"}</td>
                      <td className="py-1.5 px-2">
                        {s.coverage_pct != null ? (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden w-16">
                              <div className="h-full bg-brand-primary rounded-full" style={{ width: `${s.coverage_pct}%` }} />
                            </div>
                            <span>{s.coverage_pct}%</span>
                          </div>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Sampling units */}
            {units?.length > 0 && (
              <div className="card overflow-x-auto">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">
                  Sampling Units
                  <span className="ml-2 text-xs text-gray-400 font-normal">{units.length} units</span>
                </h2>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-gray-500 text-left uppercase">
                      <th className="py-1.5 px-2">FSU</th>
                      <th className="py-1.5 px-2">State</th>
                      <th className="py-1.5 px-2">Stratum</th>
                      <th className="py-1.5 px-2">HH Count</th>
                      <th className="py-1.5 px-2">Allocation</th>
                      <th className="py-1.5 px-2">Weight</th>
                      <th className="py-1.5 px-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(units || []).slice(0, 50).map((u: any) => (
                      <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-1.5 px-2 font-mono">{u.fsu_code}</td>
                        <td className="py-1.5 px-2">{u.state_code}</td>
                        <td className="py-1.5 px-2">{u.stratum}</td>
                        <td className="py-1.5 px-2">{u.hh_count}</td>
                        <td className="py-1.5 px-2 font-medium">{u.allocation}</td>
                        <td className="py-1.5 px-2">{u.weight_multiplier?.toFixed(2)}</td>
                        <td className="py-1.5 px-2">
                          <span className={`badge ${u.status === "sampled" ? "badge-pass" : u.status === "visited" ? "badge-bronze" : "badge-pending"}`}>
                            {u.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
