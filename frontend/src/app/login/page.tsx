"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authApi } from "@/lib/api";
import Cookies from "js-cookie";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@mospi.gov.in");
  const [password, setPassword] = useState("MoSPI@2024");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await authApi.login(email, password);
      const { access_token, user } = res.data;
      Cookies.set("token", access_token, { expires: 1 });
      localStorage.setItem("token", access_token);
      localStorage.setItem("user", JSON.stringify(user));
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-primary to-blue-800">
      {/* GoI Header Bar */}
      <div className="fixed top-0 left-0 right-0 bg-white border-b-4 border-brand-secondary py-2 px-6 flex items-center gap-4 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-brand-primary flex items-center justify-center text-white font-bold text-sm">IN</div>
          <div>
            <div className="text-xs text-gray-500 font-medium">GOVERNMENT OF INDIA</div>
            <div className="text-sm font-bold text-brand-primary leading-tight">Ministry of Statistics & Programme Implementation</div>
          </div>
        </div>
        <div className="ml-auto flex gap-6 text-xs text-gray-500">
          <span>Portal: mospi.gov.in</span>
          <span>|</span>
          <span>Skip to Main Content</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md mx-4 mt-16">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-brand-primary flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-brand-primary">Unified Survey Platform</h1>
          <p className="text-gray-500 text-sm mt-1">MoSPI — Government of India</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="label">Email Address</label>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="your.name@mospi.gov.in" />
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3 text-base mt-2">
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <p className="text-xs font-medium text-gray-500 mb-2">DEMO CREDENTIALS</p>
          <div className="space-y-1 text-xs text-gray-600">
            <div className="flex justify-between"><span className="font-medium">Admin:</span><span>admin@mospi.gov.in / MoSPI@2024</span></div>
            <div className="flex justify-between"><span className="font-medium">Supervisor:</span><span>supervisor@mospi.gov.in</span></div>
            <div className="flex justify-between"><span className="font-medium">Analyst:</span><span>analyst@mospi.gov.in</span></div>
            <div className="flex justify-between"><span className="font-medium">Enumerator:</span><span>enum1@mospi.gov.in</span></div>
          </div>
        </div>

        <div className="mt-4 flex justify-center">
          <div className="flex gap-4 text-xs text-gray-400">
            <span>Privacy Policy</span>
            <span>•</span>
            <span>Help</span>
            <span>•</span>
            <span>Accessibility</span>
          </div>
        </div>
      </div>
    </div>
  );
}
