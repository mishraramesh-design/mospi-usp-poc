"use client";
import AppShell from "@/components/layout/AppShell";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authApi } from "@/lib/api";
import { useState } from "react";
import { UserPlus, Edit2, Shield } from "lucide-react";

const ROLES = ["admin", "supervisor", "enumerator", "analyst"];

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-100 text-red-700 border-red-200",
  supervisor: "bg-blue-100 text-blue-700 border-blue-200",
  enumerator: "bg-green-100 text-green-700 border-green-200",
  analyst: "bg-purple-100 text-purple-700 border-purple-200",
};

export default function UsersPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ username: "", full_name: "", email: "", password: "", role: "enumerator", state_code: "", phone: "" });

  const { data: users, isLoading } = useQuery({ queryKey: ["users"], queryFn: () => authApi.users().then(r => r.data) });

  const createMut = useMutation({
    mutationFn: () => authApi.createUser(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); setShowCreate(false); setForm({ username: "", full_name: "", email: "", password: "", role: "enumerator", state_code: "", phone: "" }); }
  });

  const updateMut = useMutation({
    mutationFn: (data: { id: string; payload: any }) => authApi.updateUser(data.id, data.payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); setEditingId(null); }
  });

  const roleCounts = ROLES.reduce((acc, r) => {
    acc[r] = (users || []).filter((u: any) => u.role === r).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-brand-primary" />
            <div>
              <h1 className="text-2xl font-bold text-brand-primary">User Management</h1>
              <p className="text-sm text-gray-500">Manage platform users, roles and state assignments</p>
            </div>
          </div>
          <button onClick={() => setShowCreate(true)} className="btn-primary text-xs gap-1.5">
            <UserPlus size={14} /> Add User
          </button>
        </div>

        {/* Role summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {ROLES.map(r => (
            <div key={r} className={`rounded-xl p-4 border-2 text-center ${ROLE_COLORS[r]}`}>
              <div className="text-2xl font-bold">{roleCounts[r] || 0}</div>
              <div className="text-xs font-semibold capitalize mt-1">{r}s</div>
            </div>
          ))}
        </div>

        {/* Create modal */}
        {showCreate && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg mx-4">
              <h2 className="text-lg font-bold text-brand-primary mb-4">New User</h2>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Username *</label>
                    <input className="input" value={form.username} onChange={e => setForm({...form, username: e.target.value})} />
                  </div>
                  <div>
                    <label className="label">Full Name *</label>
                    <input className="input" value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} />
                  </div>
                </div>
                <div>
                  <label className="label">Email *</label>
                  <input type="email" className="input" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
                </div>
                <div>
                  <label className="label">Password *</label>
                  <input type="password" className="input" placeholder="Min 8 chars" value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Role</label>
                    <select className="input" value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">State Code</label>
                    <input className="input" placeholder="MH, UP, TN…" value={form.state_code} onChange={e => setForm({...form, state_code: e.target.value})} />
                  </div>
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input className="input" placeholder="+91-XXXXXXXXXX" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <button onClick={() => createMut.mutate()}
                  disabled={!form.username || !form.email || !form.password || createMut.isPending}
                  className="btn-primary flex-1 justify-center">
                  {createMut.isPending ? "Creating…" : "Create User"}
                </button>
                <button onClick={() => setShowCreate(false)} className="btn-ghost">Cancel</button>
              </div>
              {createMut.isError && <p className="text-xs text-red-500 mt-2">Error creating user. Username or email may already exist.</p>}
            </div>
          </div>
        )}

        {/* Users table */}
        <div className="card overflow-x-auto">
          {isLoading ? (
            <div className="text-center py-8 text-gray-400">Loading…</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-gray-500 uppercase">
                  <th className="text-left py-2 px-3">User</th>
                  <th className="text-left py-2 px-3">Username</th>
                  <th className="text-left py-2 px-3">Role</th>
                  <th className="text-left py-2 px-3">State</th>
                  <th className="text-left py-2 px-3">Status</th>
                  <th className="text-left py-2 px-3">Last Login</th>
                  <th className="py-2 px-3" />
                </tr>
              </thead>
              <tbody>
                {(users || []).map((u: any) => (
                  editingId === u.id ? (
                    <tr key={u.id} className="border-b bg-blue-50">
                      <td colSpan={7} className="py-3 px-3">
                        <div className="flex gap-3 items-center flex-wrap">
                          <select className="input text-xs w-auto" defaultValue={u.role}
                            onChange={e => updateMut.mutate({ id: u.id, payload: { role: e.target.value } })}>
                            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                          <select className="input text-xs w-auto" defaultValue={u.is_active ? "active" : "inactive"}
                            onChange={e => updateMut.mutate({ id: u.id, payload: { is_active: e.target.value === "active" } })}>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                          <button onClick={() => setEditingId(null)} className="btn-ghost text-xs">Done</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3">
                        <div>
                          <div className="font-medium text-gray-800">{u.full_name}</div>
                          <div className="text-xs text-gray-400">{u.email}</div>
                        </div>
                      </td>
                      <td className="py-2 px-3 font-mono text-xs">{u.username}</td>
                      <td className="py-2 px-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${ROLE_COLORS[u.role] || "bg-gray-100"}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-xs">{u.state_code || "—"}</td>
                      <td className="py-2 px-3">
                        <span className={`badge ${u.is_active ? "badge-pass" : "badge-fail"}`}>
                          {u.is_active ? "active" : "inactive"}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-xs text-gray-500">
                        {u.last_login ? new Date(u.last_login).toLocaleDateString() : "—"}
                      </td>
                      <td className="py-2 px-3">
                        <button onClick={() => setEditingId(u.id)} className="text-gray-400 hover:text-brand-primary">
                          <Edit2 size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Default credentials info */}
        <div className="card border-l-4 border-brand-secondary bg-amber-50">
          <h3 className="text-sm font-semibold text-amber-800 mb-2">Demo Credentials</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
            {[
              { user: "admin", role: "admin" },
              { user: "supervisor_delhi", role: "supervisor" },
              { user: "enum_raj_001", role: "enumerator" },
              { user: "enum_mh_001", role: "enumerator" },
              { user: "analyst_hq", role: "analyst" },
            ].map(u => (
              <div key={u.user} className="bg-white rounded-lg p-2 border border-amber-200">
                <div className="font-mono font-medium">{u.user}</div>
                <div className="text-gray-500">pwd: <span className="font-mono">MoSPI@2024</span></div>
                <div className={`text-xs mt-0.5 inline-block px-1.5 rounded ${ROLE_COLORS[u.role]}`}>{u.role}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
