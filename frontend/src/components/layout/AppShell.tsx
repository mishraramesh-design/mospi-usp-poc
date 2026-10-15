"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Cookies from "js-cookie";
import {
  LayoutDashboard, ClipboardList, Database, Shield, BarChart3,
  GitBranch, Map, Users, Settings, LogOut, ChevronDown,
  Activity, Upload, FlaskConical
} from "lucide-react";

const navItems = [
  { href: "/dashboard",  label: "Dashboard",           icon: LayoutDashboard },
  { href: "/surveys",    label: "Survey Management",    icon: ClipboardList },
  { href: "/forms",      label: "Form Builder",         icon: Upload },
  { href: "/sampling",   label: "Sampling",             icon: Map },
  { href: "/pipeline",   label: "DI Pipeline",          icon: Activity },
  { href: "/quality",    label: "Data Quality",         icon: Shield },
  { href: "/analytics",  label: "Statistical Analysis", icon: FlaskConical },
  { href: "/lineage",    label: "Data Lineage",         icon: GitBranch },
  { href: "/reporting",  label: "Reporting / GIS",      icon: BarChart3 },
  { href: "/users",      label: "Users",                icon: Users },
];

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const pathname  = usePathname();
  const router    = useRouter();
  const [user, setUser] = useState<any>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    const u = localStorage.getItem("user");
    if (u) setUser(JSON.parse(u));
    const token = Cookies.get("token") || localStorage.getItem("token");
    if (!token) router.push("/login");
  }, [router]);

  const logout = () => {
    Cookies.remove("token");
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  const roleColor: Record<string, string> = {
    admin: "bg-purple-100 text-purple-700",
    supervisor: "bg-blue-100 text-blue-700",
    enumerator: "bg-green-100 text-green-700",
    analyst: "bg-amber-100 text-amber-700",
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? "w-64" : "w-16"} flex-shrink-0 bg-white border-r border-gray-200 flex flex-col transition-all duration-200 z-30`}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-200 min-h-[64px]">
          <div className="w-8 h-8 rounded-lg bg-brand-primary flex items-center justify-center flex-shrink-0">
            <BarChart3 className="w-4 h-4 text-white" />
          </div>
          {sidebarOpen && (
            <div>
              <div className="text-sm font-bold text-brand-primary leading-tight">MoSPI USP</div>
              <div className="text-xs text-gray-400">Survey Platform</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}
                className={active ? "nav-item-active" : "nav-item"}
                title={!sidebarOpen ? item.label : undefined}>
                <Icon className="w-4.5 h-4.5 flex-shrink-0" size={18} />
                {sidebarOpen && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        {user && (
          <div className="border-t border-gray-200 p-3">
            <div className={`flex items-center gap-2 ${sidebarOpen ? "" : "justify-center"}`}>
              <div className="w-8 h-8 rounded-full bg-brand-primary text-white text-xs flex items-center justify-center font-bold flex-shrink-0">
                {user.full_name?.charAt(0) || "U"}
              </div>
              {sidebarOpen && (
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{user.full_name}</div>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${roleColor[user.role] || "bg-gray-100 text-gray-600"}`}>
                    {user.role}
                  </span>
                </div>
              )}
              {sidebarOpen && (
                <button onClick={logout} className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title="Logout">
                  <LogOut size={16} />
                </button>
              )}
            </div>
          </div>
        )}
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 h-16 flex items-center px-6 gap-4 flex-shrink-0">
          <button onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-sm text-gray-500">
            <span className="text-brand-primary font-medium">MoSPI USP</span>
            <span>/</span>
            <span className="text-gray-700 capitalize">{pathname.split("/")[1] || "Dashboard"}</span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {/* Quick links */}
            <a href={process.env.NEXT_PUBLIC_ODK_URL || "http://localhost:8383"} target="_blank"
              className="text-xs text-gray-500 hover:text-brand-primary border border-gray-200 rounded px-2 py-1">
              ODK Central ↗
            </a>
            <a href={process.env.NEXT_PUBLIC_SUPERSET_URL || "http://localhost:8088"} target="_blank"
              className="text-xs text-gray-500 hover:text-brand-primary border border-gray-200 rounded px-2 py-1">
              Superset ↗
            </a>
            <a href={process.env.NEXT_PUBLIC_AIRFLOW_URL || "http://localhost:8080"} target="_blank"
              className="text-xs text-gray-500 hover:text-brand-primary border border-gray-200 rounded px-2 py-1">
              Airflow ↗
            </a>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
