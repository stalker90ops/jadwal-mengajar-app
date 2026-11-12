"use client";

import { useState } from "react";
import { CalendarCheck2, KeyRound, ArrowLeft } from "lucide-react";
import Link from "next/link";

const IS_DEV = process.env.NODE_ENV !== "production";

export default function AdminLogin() {
  const [email, setEmail] = useState(IS_DEV ? "admin@sekolah.com" : "");
  const [password, setPassword] = useState(IS_DEV ? "password123" : "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        window.location.href = "/roster";
      } else {
        const data = await res.json();
        setError(data.error || "Login gagal");
      }
    } catch {
      setError("Terjadi kesalahan jaringan");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-md w-full border border-slate-100">
        <div className="flex flex-col items-center mb-6">
          <div className="bg-blue-600 p-3.5 rounded-2xl mb-3 shadow-lg shadow-blue-600/30">
            <CalendarCheck2 className="w-9 h-9 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 text-center">
            Login Admin Kurikulum
          </h2>
          <p className="text-slate-500 text-sm mt-1 text-center">
            Kelola Data Guru, Mapel, Ruangan, Hari Aktif & Penyusunan Jadwal
          </p>
        </div>

        {IS_DEV && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-5 text-xs text-blue-800 flex items-start gap-2.5">
          <KeyRound className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Akses Default Kurikulum:</p>
            <p>Email: <code className="font-mono bg-white px-1 py-0.5 rounded">admin@sekolah.com</code></p>
            <p>Password: <code className="font-mono bg-white px-1 py-0.5 rounded">password123</code></p>
          </div>
        </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 border border-red-200 text-center font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Email Kurikulum / Operator
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-800"
              placeholder="admin@sekolah.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-800"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition-colors shadow-md disabled:opacity-70"
          >
            {loading ? "Memverifikasi..." : "Masuk ke Panel Kurikulum"}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-100 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-blue-600 font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali ke Jadwal Publik (Guru & Siswa)
          </Link>
        </div>
      </div>
    </div>
  );
}
