"use client";

import { CalendarCheck2, LogOut, ExternalLink } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  if (pathname === "/roster/login") {
    return <>{children}</>;
  }

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/roster/login");
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30 no-print">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <CalendarCheck2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-base sm:text-lg leading-tight">
                SI-JADWAL KURIKULUM
              </h1>
              <p className="text-xs text-slate-400 hidden sm:block">
                Sistem Penjadwalan Mengajar & Validasi Anti-Bentrok
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-xs sm:text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-lg border border-slate-700 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Lihat Halaman Publik</span>
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs sm:text-sm bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 px-3 py-2 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Keluar</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 sm:p-6">
        {children}
      </main>
    </div>
  );
}
