"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarCheck2,
  Printer,
  Download,
  Lock,
  Users,
  DoorOpen,
  GraduationCap,
  CheckCircle2,
  AlertTriangle,
  Clock,
  BookOpen,
  ListFilter,
} from "lucide-react";
import { downloadCsvFile, DAY_NAMES } from "@/lib/csv-helper";
import { parseJsonNumberArray } from "@/lib/schedule-validator";

export default function PublicSchedulePage() {
  const [loading, setLoading] = useState(true);
  const [activeDays, setActiveDays] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [audit, setAudit] = useState<{ conflicts: any[]; conflictingScheduleIds: string[] }>({
    conflicts: [],
    conflictingScheduleIds: [],
  });

  const [viewMode, setViewMode] = useState<"CLASS" | "TEACHER" | "ROOM" | "ALL">("CLASS");
  const [selectedId, setSelectedId] = useState<string>("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/master");
      if (res.ok) {
        const data = await res.json();
        setActiveDays(data.activeDays || []);
        setTeachers(data.teachers || []);
        setRooms(data.rooms || []);
        setClasses(data.classes || []);
        setSchedules(data.schedules || []);
        setAudit(data.audit || { conflicts: [], conflictingScheduleIds: [] });

        if (data.classes?.length > 0) {
          setSelectedId(data.classes[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Saat mode berganti, pilih entitas pertama yang sesuai
  useEffect(() => {
    if (viewMode === "CLASS" && classes.length > 0) {
      setSelectedId(classes[0].id);
    } else if (viewMode === "TEACHER" && teachers.length > 0) {
      setSelectedId(teachers[0].id);
    } else if (viewMode === "ROOM" && rooms.length > 0) {
      setSelectedId(rooms[0].id);
    } else {
      setSelectedId("");
    }
  }, [viewMode, classes, teachers, rooms]);

  const schoolActiveDays = useMemo(
    () => activeDays.filter((d) => d.isActive),
    [activeDays]
  );

  // Urutan baris periodNumber gabungan dari semua hari aktif
  const allPeriodRows = useMemo(() => {
    const map = new Map<number, { periodNumber: number; label: string; startTime: string; endTime: string; isBreak: boolean }>();
    for (const d of schoolActiveDays) {
      for (const ts of d.timeSlots || []) {
        if (!map.has(ts.periodNumber)) {
          map.set(ts.periodNumber, {
            periodNumber: ts.periodNumber,
            label: ts.label,
            startTime: ts.startTime,
            endTime: ts.endTime,
            isBreak: ts.isBreak,
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.periodNumber - b.periodNumber);
  }, [schoolActiveDays]);

  const filteredSchedules = useMemo(() => {
    if (viewMode === "CLASS" && selectedId) {
      return schedules.filter((s) => s.classGroupId === selectedId);
    }
    if (viewMode === "TEACHER" && selectedId) {
      return schedules.filter((s) => s.teacherId === selectedId);
    }
    if (viewMode === "ROOM" && selectedId) {
      return schedules.filter((s) => s.roomId === selectedId);
    }
    return schedules;
  }, [schedules, viewMode, selectedId]);

  const selectedEntityTitle = useMemo(() => {
    if (viewMode === "CLASS") {
      const c = classes.find((x) => x.id === selectedId);
      return c ? `${c.name} (${c.code})` : "Semua Kelas";
    }
    if (viewMode === "TEACHER") {
      const t = teachers.find((x) => x.id === selectedId);
      return t ? `${t.name} (${t.code})` : "Semua Guru";
    }
    if (viewMode === "ROOM") {
      const r = rooms.find((x) => x.id === selectedId);
      return r ? `${r.name} (${r.code})` : "Semua Ruangan";
    }
    return "Seluruh Jadwal Sekolah";
  }, [viewMode, selectedId, classes, teachers, rooms]);

  const selectedTeacherObj = useMemo(() => {
    if (viewMode !== "TEACHER") return null;
    return teachers.find((t) => t.id === selectedId) || null;
  }, [viewMode, selectedId, teachers]);

  const handleExportCsv = () => {
    const headers = [
      "Hari",
      "Slot / Jam Ke",
      "Waktu",
      "Kelas / Rombel",
      "Kode Mapel",
      "Mata Pelajaran",
      "Kode Guru",
      "Nama Guru",
      "Kode Ruangan",
      "Nama Ruangan",
    ];
    const rows = filteredSchedules.map((s) => [
      s.activeDay?.dayName || "",
      s.timeSlot?.label || "",
      `${s.timeSlot?.startTime || ""}-${s.timeSlot?.endTime || ""}`,
      s.classGroup?.name || "",
      s.subject?.code || "",
      s.subject?.name || "",
      s.teacher?.code || "",
      s.teacher?.name || "",
      s.room?.code || "",
      s.room?.name || "",
    ]);
    const safeName = selectedEntityTitle.replace(/[^a-zA-Z0-9_-]/g, "_");
    downloadCsvFile(`Jadwal_${safeName}.csv`, headers, rows);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header Navigasi Publik */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-20 no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-xl shadow-md shadow-blue-600/30">
              <CalendarCheck2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-base sm:text-lg tracking-tight">
                SI-JADWAL MENGAJAR SEKOLAH
              </h1>
              <p className="text-xs text-slate-400 hidden sm:block">
                Portal Informasi Jadwal Pelajaran Kelas, Guru & Penggunaan Ruangan
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
            href="/roster"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm"
            >
              <Lock className="w-4 h-4" />
              <span>Panel Admin Kurikulum</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6 print-container">
        {/* Ringkasan Statistik Cepat */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 no-print">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="text-xs text-slate-500 font-medium">Total Kelas / Rombel</div>
            <div className="text-2xl font-bold text-slate-800 mt-1">{classes.length}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="text-xs text-slate-500 font-medium">Total Guru Pengajar</div>
            <div className="text-2xl font-bold text-slate-800 mt-1">{teachers.length}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="text-xs text-slate-500 font-medium">Ruangan Aktif</div>
            <div className="text-2xl font-bold text-slate-800 mt-1">{rooms.length}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="text-xs text-slate-500 font-medium">Hari Aktif Sekolah</div>
            <div className="text-2xl font-bold text-slate-800 mt-1">{schoolActiveDays.length} Hari</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm col-span-2 md:col-span-1">
            <div className="text-xs text-slate-500 font-medium">Status Validasi Bentrok</div>
            {audit.conflicts.filter((c) => c.severity === "ERROR").length === 0 ? (
              <div className="flex items-center gap-1.5 text-emerald-600 font-bold text-sm mt-1.5">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span>0 Bentrok (Valid)</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-red-600 font-bold text-sm mt-1.5">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <span>{audit.conflicts.filter((c) => c.severity === "ERROR").length} Konflik</span>
              </div>
            )}
          </div>
        </div>

        {/* Filter Bar & Tombol Cetak / Export */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4 no-print">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setViewMode("CLASS")}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                viewMode === "CLASS"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              Jadwal Per Kelas
            </button>
            <button
              onClick={() => setViewMode("TEACHER")}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                viewMode === "TEACHER"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              <Users className="w-4 h-4" />
              Jadwal Per Guru
            </button>
            <button
              onClick={() => setViewMode("ROOM")}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                viewMode === "ROOM"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              <DoorOpen className="w-4 h-4" />
              Jadwal Per Ruangan
            </button>
            <button
              onClick={() => setViewMode("ALL")}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                viewMode === "ALL"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              <ListFilter className="w-4 h-4" />
              Daftar Semua Jadwal
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {viewMode !== "ALL" && (
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none min-w-[220px]"
              >
                {viewMode === "CLASS" &&
                  classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                {viewMode === "TEACHER" &&
                  teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.code})
                    </option>
                  ))}
                {viewMode === "ROOM" &&
                  rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.code}) - {r.type}
                    </option>
                  ))}
              </select>
            )}

            <button
              onClick={handleExportCsv}
              disabled={filteredSchedules.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Export Excel/CSV</span>
            </button>

            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak / PDF</span>
            </button>

            {viewMode === "TEACHER" && selectedTeacherObj && (
              <a
                href={`/print/teacher?id=${selectedTeacherObj.id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
                title="Buka Format Cetak Resmi UPT SMK Negeri 2 Parepare"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak Format Resmi Guru (A4)</span>
              </a>
            )}
          </div>
        </div>

        {/* Info Ketersediaan Hari Aktif Guru jika sedang memilih mode Guru */}
        {selectedTeacherObj && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-blue-950 text-sm sm:text-base">
                {selectedTeacherObj.name} ({selectedTeacherObj.code})
              </h3>
              <p className="text-xs text-blue-700 mt-0.5">
                Total Beban Terjadwal:{" "}
                <span className="font-bold">{filteredSchedules.length} JP</span> / Maksimal{" "}
                {selectedTeacherObj.maxPeriods} JP per minggu
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-medium text-blue-800 mr-1">Hari Keaktifan Guru:</span>
              {[1, 2, 3, 4, 5, 6].map((dayNum) => {
                const isTeacherActive = parseJsonNumberArray(selectedTeacherObj.activeDays).includes(dayNum);
                return (
                  <span
                    key={dayNum}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                      isTeacherActive
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-200 text-slate-500 line-through"
                    }`}
                  >
                    {DAY_NAMES[dayNum]}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Area Tabel Jadwal */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Jadwal Pelajaran: {selectedEntityTitle}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Menampilkan {filteredSchedules.length} slot jam pelajaran terjadwal
              </p>
            </div>
            <div className="text-xs text-slate-400 hidden sm:block">
              Dicetak / Diakses melalui SI-JADWAL Sekolah
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-slate-500">Memuat jadwal pelajaran...</div>
          ) : schedules.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <BookOpen className="w-12 h-12 text-slate-300 mx-auto" />
              <div className="text-base font-semibold text-slate-700">
                Belum Ada Jadwal Mengajar yang Disusun
              </div>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                Silakan masuk ke <strong>Panel Admin Kurikulum</strong> untuk menginput/import data Guru, Mapel, Kelas, Ruangan, atau menekan tombol <strong>Generate Jadwal Otomatis</strong>.
              </p>
              <div className="pt-2 no-print">
                <Link
                  href="/roster"
                  className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg"
                >
                  <Lock className="w-4 h-4" />
                  Buka Panel Admin Kurikulum
                </Link>
              </div>
            </div>
          ) : viewMode === "ALL" ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                    <th className="py-3 px-4 font-semibold">Hari</th>
                    <th className="py-3 px-4 font-semibold">Jam Pelajaran</th>
                    <th className="py-3 px-4 font-semibold">Kelas</th>
                    <th className="py-3 px-4 font-semibold">Mata Pelajaran</th>
                    <th className="py-3 px-4 font-semibold">Guru Pengajar</th>
                    <th className="py-3 px-4 font-semibold">Ruangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredSchedules.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-medium text-slate-800">{s.activeDay?.dayName}</td>
                      <td className="py-3 px-4 text-slate-600">
                        <span className="font-medium text-slate-800">{s.timeSlot?.label}</span>{" "}
                        <span className="text-xs text-slate-500">
                          ({s.timeSlot?.startTime} - {s.timeSlot?.endTime})
                        </span>
                      </td>
                      <td className="py-3 px-4 font-semibold text-blue-700">{s.classGroup?.name}</td>
                      <td className="py-3 px-4">
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-white text-xs font-semibold"
                          style={{ backgroundColor: s.subject?.color || "#2563eb" }}
                        >
                          {s.subject?.name} ({s.subject?.code})
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-800">{s.teacher?.name}</td>
                      <td className="py-3 px-4">
                        <span className="px-2.5 py-1 bg-slate-100 border border-slate-300 rounded text-xs font-semibold text-slate-700">
                          {s.room?.name} ({s.room?.code})
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="py-3.5 px-4 text-left font-semibold w-44 border-r border-slate-800">
                      Jam / Waktu
                    </th>
                    {schoolActiveDays.map((day) => {
                      const isTeacherInactiveDay =
                        selectedTeacherObj &&
                        !parseJsonNumberArray(selectedTeacherObj.activeDays).includes(day.dayNumber);

                      return (
                        <th
                          key={day.id}
                          className="py-3.5 px-4 text-left font-semibold border-r border-slate-800 min-w-[200px]"
                        >
                          <div className="flex items-center justify-between">
                            <span>{day.dayName}</span>
                            {isTeacherInactiveDay && (
                              <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-400/30 px-2 py-0.5 rounded">
                                Guru Libur/Non-Aktif
                              </span>
                            )}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {allPeriodRows.map((row) => (
                    <tr
                      key={row.periodNumber}
                      className={row.isBreak ? "bg-amber-50/70" : "hover:bg-slate-50/60"}
                    >
                      <td className="py-3 px-4 border-r border-slate-200 align-top bg-slate-50/70">
                        <div className="font-bold text-slate-800 text-xs sm:text-sm">{row.label}</div>
                        <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                          <Clock className="w-3.5 h-3.5" />
                          <span>
                            {row.startTime} - {row.endTime}
                          </span>
                        </div>
                      </td>

                      {schoolActiveDays.map((day) => {
                        const daySlot = (day.timeSlots || []).find(
                          (ts: any) => ts.periodNumber === row.periodNumber
                        );

                        if (!daySlot) {
                          return (
                            <td
                              key={day.id}
                              className="p-3 border-r border-slate-200 bg-slate-100/60 text-center text-xs text-slate-400"
                            >
                              —
                            </td>
                          );
                        }

                        if (daySlot.isBreak) {
                          return (
                            <td
                              key={day.id}
                              className="p-2.5 border-r border-slate-200 bg-amber-50/80 text-center text-xs font-semibold text-amber-800"
                            >
                              ☕ {daySlot.label} ({daySlot.startTime} - {daySlot.endTime})
                            </td>
                          );
                        }

                        const cellSchedules = filteredSchedules.filter(
                          (s) => s.activeDayId === day.id && s.timeSlotId === daySlot.id
                        );

                        return (
                          <td key={day.id} className="p-2.5 border-r border-slate-200 align-top">
                            {cellSchedules.length === 0 ? (
                              <div className="h-16 flex items-center justify-center text-xs text-slate-300 border border-dashed border-slate-200 rounded-lg">
                                Kosong
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {cellSchedules.map((item) => {
                                  const hasConflict = audit.conflictingScheduleIds.includes(item.id);
                                  return (
                                    <div
                                      key={item.id}
                                      className={`p-2.5 rounded-xl border text-left shadow-sm transition-all ${
                                        hasConflict
                                          ? "bg-red-50 border-red-400 ring-2 ring-red-300"
                                          : "bg-white border-slate-200"
                                      }`}
                                      style={{
                                        borderLeftWidth: "5px",
                                        borderLeftColor: hasConflict
                                          ? "#dc2626"
                                          : item.subject?.color || "#2563eb",
                                      }}
                                    >
                                      <div className="flex items-start justify-between gap-1">
                                        <span className="font-bold text-slate-900 text-xs sm:text-sm leading-snug">
                                          {item.subject?.name}
                                        </span>
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 shrink-0">
                                          {item.room?.code}
                                        </span>
                                      </div>

                                      <div className="mt-1.5 space-y-0.5 text-xs text-slate-600">
                                        {viewMode !== "TEACHER" && (
                                          <div className="font-medium text-slate-700 truncate">
                                            👨‍🏫 {item.teacher?.name}
                                          </div>
                                        )}
                                        {viewMode !== "CLASS" && (
                                          <div className="font-semibold text-blue-700">
                                            🎓 {item.classGroup?.name}
                                          </div>
                                        )}
                                        <div className="text-[11px] text-slate-500">
                                          📍 {item.room?.name}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
