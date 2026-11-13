"use client";

import React from "react";
import {
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Sparkles,
  ArrowRight,
  X,
  FileSpreadsheet,
  Calendar,
} from "lucide-react";

export interface ProgressStep {
  label: string;
  detail?: string;
}

export interface ProgressStatItem {
  label: string;
  value: string | number;
  color?: "blue" | "emerald" | "amber" | "purple" | "slate";
  badge?: string;
}

interface ProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  iconType?: "schedule" | "import" | "curriculum";
  title: string;
  subtitle?: string;
  progressPercent: number; // 0 - 100
  steps: ProgressStep[];
  activeStepIndex: number;
  status: "running" | "success" | "error";
  errorText?: string;
  resultStats?: ProgressStatItem[];
  extraDetails?: React.ReactNode;
  actionButtonText?: string;
}

export default function ProgressModal({
  isOpen,
  onClose,
  iconType = "schedule",
  title,
  subtitle,
  progressPercent,
  steps,
  activeStepIndex,
  status,
  errorText,
  resultStats,
  extraDetails,
  actionButtonText = "Tutup & Lihat Hasil",
}: ProgressModalProps) {
  if (!isOpen) return null;

  const isRunning = status === "running";
  const isSuccess = status === "success";
  const isError = status === "error";

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header Modal */}
        <div
          className={`p-5 text-white flex items-center justify-between ${
            isError
              ? "bg-rose-600"
              : isSuccess
              ? "bg-emerald-700"
              : "bg-slate-900"
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isError
                  ? "bg-rose-500/40 text-white"
                  : isSuccess
                  ? "bg-emerald-600 text-white"
                  : "bg-blue-600 text-white"
              }`}
            >
              {isRunning && (
                <Loader2 className="w-5 h-5 animate-spin text-white" />
              )}
              {isSuccess && <CheckCircle2 className="w-6 h-6 text-white" />}
              {isError && <AlertTriangle className="w-6 h-6 text-white" />}
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg leading-tight">
                {title}
              </h3>
              {subtitle && (
                <p className="text-xs text-slate-300 mt-0.5 line-clamp-1">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {!isRunning && (
            <button
              onClick={onClose}
              className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Body Modal */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          {/* Progress Bar & Persentase */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-600">
                {isRunning
                  ? "Sedang Memproses..."
                  : isSuccess
                  ? "Proses Selesai!"
                  : "Terjadi Kendala"}
              </span>
              <span
                className={`font-mono font-bold ${
                  isError
                    ? "text-rose-600"
                    : isSuccess
                    ? "text-emerald-600"
                    : "text-blue-600"
                }`}
              >
                {Math.round(progressPercent)}%
              </span>
            </div>

            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  isError
                    ? "bg-rose-600"
                    : isSuccess
                    ? "bg-emerald-500"
                    : "bg-gradient-to-r from-blue-600 to-indigo-600 animate-pulse"
                }`}
                style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
              />
            </div>
          </div>

          {/* Step Tracker */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Tahapan Pengerjaan
            </div>
            <div className="space-y-2 text-xs">
              {steps.map((s, idx) => {
                const isStepCompleted =
                  isSuccess || idx < activeStepIndex;
                const isStepActive =
                  isRunning && idx === activeStepIndex;
                const isStepPending = idx > activeStepIndex && !isSuccess;

                return (
                  <div
                    key={idx}
                    className={`flex items-start gap-2.5 transition-all ${
                      isStepActive
                        ? "text-blue-900 font-bold scale-[1.01]"
                        : isStepCompleted
                        ? "text-slate-700 font-medium"
                        : "text-slate-400"
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {isStepCompleted ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : isStepActive ? (
                        <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-slate-300 flex items-center justify-center text-[9px] text-slate-400">
                          {idx + 1}
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div>{s.label}</div>
                      {s.detail && isStepActive && (
                        <div className="text-[11px] text-blue-600 font-normal mt-0.5">
                          {s.detail}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Kartu Ringkasan Statistik (Saat Sukses) */}
          {isSuccess && resultStats && resultStats.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {resultStats.map((st, i) => (
                <div
                  key={i}
                  className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs text-center"
                >
                  <div className="text-[11px] text-slate-500 font-medium truncate">
                    {st.label}
                  </div>
                  <div className="text-base font-bold text-slate-900 mt-0.5 truncate">
                    {st.value}
                  </div>
                  {st.badge && (
                    <div className="text-[10px] font-semibold text-emerald-600 mt-0.5">
                      {st.badge}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Pesan Error (Saat Gagal) */}
          {isError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>Terjadi Kesalahan:</span>
              </div>
              <p className="text-rose-700">{errorText || "Operasi gagal diproses."}</p>
            </div>
          )}

          {/* Konten Rincian Ekstra (misal: Daftar Unscheduled) */}
          {extraDetails}
        </div>

        {/* Footer Tombol Selesai */}
        {!isRunning && (
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white shadow-sm transition-all ${
                isError
                  ? "bg-slate-800 hover:bg-slate-900"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              <span>{actionButtonText}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
