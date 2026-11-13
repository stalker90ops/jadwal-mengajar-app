"use client";

import React, { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Printer,
  Download,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  Award,
  BookOpen,
  Calendar,
  Layers,
} from "lucide-react";

interface TimeSlot {
  id: string;
  activeDayId: string;
  periodNumber: number;
  label: string;
  startTime: string;
  endTime: string;
  isBreak: boolean;
}

interface ActiveDay {
  id: string;
  dayNumber: number;
  dayName: string;
  isActive: boolean;
  timeSlots: TimeSlot[];
}

interface Teacher {
  id: string;
  code: string;
  nip: string | null;
  name: string;
  phone: string | null;
  maxPeriods: number;
  activeDays: string;
}

interface AdditionalDuty {
  id: string;
  category: "TTU" | "TTLE";
  name: string;
  equivalentHours: number;
  teacherId: string | null;
  nomorSk: string | null;
  notes: string | null;
  teacher?: Teacher | null;
}

interface ScheduleItem {
  id: string;
  activeDayId: string;
  timeSlotId: string;
  teacherId: string;
  subjectId: string;
  classGroupId: string;
  roomId: string;
  activeDay?: ActiveDay;
  timeSlot?: TimeSlot;
  teacher?: Teacher;
  subject?: { id: string; name: string; code: string };
  classGroup?: { id: string; name: string; code: string };
  room?: { id: string; name: string; code: string };
}

function TeacherPrintContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const requestedTeacherId = searchParams.get("id");

  const [loading, setLoading] = useState(true);
  const [activeDays, setActiveDays] = useState<ActiveDay[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [additionalDuties, setAdditionalDuties] = useState<AdditionalDuty[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("");
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const res = await fetch("/api/master");
        if (res.ok) {
          const data = await res.json();
          const tList: Teacher[] = data.teachers || [];
          setActiveDays(data.activeDays || []);
          setTeachers(tList);
          setSchedules(data.schedules || []);
          setAdditionalDuties(data.additionalDuties || []);

          if (requestedTeacherId && tList.some((t) => t.id === requestedTeacherId)) {
            setSelectedTeacherId(requestedTeacherId);
          } else if (tList.length > 0) {
            setSelectedTeacherId(tList[0].id);
          }
        }
      } catch (err) {
        console.error("Gagal memuat data master jadwal:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [requestedTeacherId]);

  const currentTeacher = useMemo(() => {
    return teachers.find((t) => t.id === selectedTeacherId) || null;
  }, [teachers, selectedTeacherId]);

  const teacherIndex = useMemo(() => {
    return teachers.findIndex((t) => t.id === selectedTeacherId);
  }, [teachers, selectedTeacherId]);

  const handlePrevTeacher = () => {
    if (teacherIndex > 0) {
      const prev = teachers[teacherIndex - 1];
      setSelectedTeacherId(prev.id);
      router.push(`/print/teacher?id=${prev.id}`);
    }
  };

  const handleNextTeacher = () => {
    if (teacherIndex < teachers.length - 1) {
      const next = teachers[teacherIndex + 1];
      setSelectedTeacherId(next.id);
      router.push(`/print/teacher?id=${next.id}`);
    }
  };

  // Filter jadwal dan tugas tambahan guru terpilih
  const teacherSchedules = useMemo(() => {
    if (!selectedTeacherId) return [];
    return schedules.filter((s) => s.teacherId === selectedTeacherId);
  }, [schedules, selectedTeacherId]);

  const teacherDuties = useMemo(() => {
    if (!selectedTeacherId) return [];
    return additionalDuties.filter((d) => d.teacherId === selectedTeacherId);
  }, [additionalDuties, selectedTeacherId]);

  // Perhitungan beban mengajar dan Permendikdasmen No. 11/2025
  const auditSummary = useMemo(() => {
    const teachingHours = teacherSchedules.length;
    let ttuHours = 0;
    let ttleHours = 0;

    teacherDuties.forEach((d) => {
      const h = Number(d.equivalentHours) || 0;
      if (d.category === "TTU" || h === 12) {
        ttuHours += 12;
      } else {
        ttleHours += h;
      }
    });

    const hasTTU = ttuHours > 0;
    const ttleRecognized = Math.min(6, ttleHours);
    const recognizedDutyHours = hasTTU ? 12 : ttleRecognized;
    const realDutyHours = ttuHours + ttleHours;
    const totalRecognized = teachingHours + recognizedDutyHours;
    const totalReal = teachingHours + realDutyHours;

    const minTeaching = hasTTU ? 12 : ttleHours > 0 ? 18 : 24;
    const isMinTeachingMet = teachingHours >= minTeaching;
    const isValidTPG = totalRecognized >= 24 && isMinTeachingMet;

    return {
      teachingHours,
      hasTTU,
      ttuHours,
      ttleHours,
      ttleRecognized,
      recognizedDutyHours,
      realDutyHours,
      totalRecognized,
      totalReal,
      minTeaching,
      isMinTeachingMet,
      isValidTPG,
    };
  }, [teacherSchedules, teacherDuties]);

  // Handler Download PDF Langsung dari API
  const handleDownloadPdf = async () => {
    if (!selectedTeacherId) return;
    try {
      setDownloadingPdf(true);
      const res = await fetch(`/api/roster/print-teacher-pdf?id=${selectedTeacherId}`);
      if (!res.ok) {
        // Fallback jika API headless belum siap: gunakan print dialog
        window.print();
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cleanName = (currentTeacher?.name || "Guru").replace(/[^a-zA-Z0-9_-]/g, "_");
      a.download = `Jadwal_${currentTeacher?.code || "GR"}_${cleanName}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Gagal download PDF:", err);
      window.print();
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Struktur Tabel Per Hari sesuai template gambar resmi
  const dayScheduleData = useMemo(() => {
    if (!selectedTeacherId) return [];

    return activeDays
      .filter((d) => d.isActive)
      .map((day) => {
        const slots = [...(day.timeSlots || [])].sort((a, b) => a.periodNumber - b.periodNumber);
        const rows: any[] = [];

        // Khusus Senin: Baris pertama adalah UPACARA BENDERA (07.00 - 08.00)
        if (day.dayNumber === 1) {
          rows.push({
            type: "CEREMONY",
            time: "07.00 - 08.00",
            periodNum: "",
            subjectName: "UPACARA BENDERA",
            className: "",
            roomName: "",
            jtmSpan: 1,
            jtmValue: "",
          });
        }

        // Petakan slot jam
        let regularTeachingIndex = 1;
        const processedSlots: any[] = [];

        for (let i = 0; i < slots.length; i++) {
          const slot = slots[i];
          if (slot.isBreak) {
            processedSlots.push({
              type: "BREAK",
              slot,
              time: `${slot.startTime.replace(":", ".")} - ${slot.endTime.replace(":", ".")}`,
              periodNum: "",
              label: slot.label.toLowerCase().includes("ishoma") || slot.label.toLowerCase().includes("sholat")
                ? "Istirahat / sholat"
                : "Istirahat",
            });
          } else {
            const sched = teacherSchedules.find(
              (s) => s.activeDayId === day.id && s.timeSlotId === slot.id
            );
            processedSlots.push({
              type: "TEACHING",
              slot,
              time: `${slot.startTime.replace(":", ".")} - ${slot.endTime.replace(":", ".")}`,
              periodNum: regularTeachingIndex++,
              sched,
            });
          }
        }

        // Hitung blok mengajar berurutan untuk merge kolom JTM
        let i = 0;
        while (i < processedSlots.length) {
          const item = processedSlots[i];
          if (item.type === "BREAK") {
            rows.push({
              type: "BREAK",
              time: item.time,
              periodNum: "",
              subjectName: item.label,
              className: "",
              roomName: "",
              jtmSpan: 1,
              jtmValue: "",
            });
            i++;
          } else {
            const currentSched = item.sched;
            if (!currentSched) {
              rows.push({
                type: "TEACHING",
                time: item.time,
                periodNum: item.periodNum,
                subjectName: "",
                className: "",
                roomName: "",
                jtmSpan: 1,
                jtmValue: "",
              });
              i++;
            } else {
              // Hitung berapa jam berturut-turut mapel & kelas & ruangan yang sama
              let count = 1;
              let j = i + 1;
              while (j < processedSlots.length) {
                const nextItem = processedSlots[j];
                if (nextItem.type !== "TEACHING" || !nextItem.sched) break;
                if (
                  nextItem.sched.subjectId === currentSched.subjectId &&
                  nextItem.sched.classGroupId === currentSched.classGroupId &&
                  nextItem.sched.roomId === currentSched.roomId
                ) {
                  count++;
                  j++;
                } else {
                  break;
                }
              }

              // Masukkan baris pertama dengan jtmSpan = count
              rows.push({
                type: "TEACHING",
                time: item.time,
                periodNum: item.periodNum,
                subjectName: currentSched.subject?.name?.toUpperCase() || "",
                className: currentSched.classGroup?.name?.toUpperCase() || "",
                roomName: currentSched.room?.name?.toUpperCase() || currentSched.room?.code?.toUpperCase() || "",
                jtmSpan: count,
                jtmValue: count,
              });

              // Masukkan baris lanjutan dengan jtmSpan = 0 (tidak render <td> JTM)
              for (let k = 1; k < count; k++) {
                const nextItem = processedSlots[i + k];
                rows.push({
                  type: "TEACHING",
                  time: nextItem.time,
                  periodNum: nextItem.periodNum,
                  subjectName: currentSched.subject?.name?.toUpperCase() || "",
                  className: currentSched.classGroup?.name?.toUpperCase() || "",
                  roomName: currentSched.room?.name?.toUpperCase() || currentSched.room?.code?.toUpperCase() || "",
                  jtmSpan: 0,
                  jtmValue: "",
                });
              }

              i += count;
            }
          }
        }

        return {
          day,
          rows,
        };
      });
  }, [activeDays, teacherSchedules, selectedTeacherId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white p-6 rounded-2xl shadow-md text-center space-y-3">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-semibold text-slate-700">Mempersiapkan Lembar Cetak Jadwal...</p>
        </div>
      </div>
    );
  }

  if (!currentTeacher) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-md text-center space-y-4 max-w-md">
          <p className="text-base font-bold text-slate-800">Guru Tidak Ditemukan</p>
          <p className="text-xs text-slate-500">
            Data guru yang Anda pilih tidak tersedia dalam database jadwal.
          </p>
          <Link
            href="/roster"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali ke Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-3 sm:px-6">
      {/* ==================== TOP ACTION BAR (NO PRINT) ==================== */}
      <div className="max-w-[215mm] mx-auto mb-6 bg-slate-900 text-white p-4 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-4 no-print border border-slate-800">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors"
            title="Kembali ke Halaman Utama"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="font-bold text-sm sm:text-base leading-tight">
              Format Cetak Resmi Jadwal Mengajar Guru
            </h1>
            <p className="text-[11px] text-slate-400">
              Standar Resmi UPT SMK Negeri 2 Parepare (Format A4 Siap Cetak / PDF)
            </p>
          </div>
        </div>

        {/* Pilihan Guru Navigasi Cepat */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-slate-800 rounded-xl p-1 border border-slate-700">
            <button
              onClick={handlePrevTeacher}
              disabled={teacherIndex <= 0}
              className="p-1.5 hover:bg-slate-700 text-slate-300 hover:text-white disabled:opacity-30 rounded-lg"
              title="Guru Sebelumnya"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <select
              value={selectedTeacherId}
              onChange={(e) => {
                setSelectedTeacherId(e.target.value);
                router.push(`/print/teacher?id=${e.target.value}`);
              }}
              className="bg-transparent text-white font-semibold text-xs px-2 py-1 outline-none cursor-pointer max-w-[200px] truncate"
            >
              {teachers.map((t) => (
                <option key={t.id} value={t.id} className="bg-slate-900 text-white">
                  {t.code} - {t.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleNextTeacher}
              disabled={teacherIndex >= teachers.length - 1}
              className="p-1.5 hover:bg-slate-700 text-slate-300 hover:text-white disabled:opacity-30 rounded-lg"
              title="Guru Berikutnya"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-600/30"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak / Simpan PDF</span>
          </button>

          <button
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/30"
          >
            <Download className="w-4 h-4" />
            <span>{downloadingPdf ? "Mempersiapkan..." : "Download File PDF"}</span>
          </button>
        </div>
      </div>

      {/* ==================== LEMBAR DOKUMEN CETAK RESMI (A4) ==================== */}
      <div className="print-sheet max-w-[215mm] mx-auto bg-white p-6 sm:p-8 rounded-none sm:rounded-2xl shadow-xl sm:border border-slate-200 text-black font-sans leading-tight">
        {/* 1. KOP SURAT RESMI SEKOLAH */}
        <div className="flex items-center gap-4 pb-2 mb-1.5">
          <div className="w-20 shrink-0 text-center">
            {/* Logo Resmi Pemprov Sulsel */}
            <img
              src="/logo-sulsel.png"
              alt="Logo Pemprov Sulsel"
              className="w-18 h-auto max-h-24 mx-auto object-contain"
              onError={(e) => {
                // Fallback jika file gambar tidak ditemukan
                (e.target as HTMLElement).style.display = "none";
              }}
            />
          </div>
          <div className="flex-1 text-center leading-snug">
            <div className="text-[12pt] sm:text-[13pt] font-black tracking-wide uppercase font-serif">
              PEMERINTAH PROVINSI SULAWESI SELATAN
            </div>
            <div className="text-[12pt] sm:text-[13pt] font-black tracking-wide uppercase font-serif">
              DINAS PENDIDIKAN
            </div>
            <div className="text-[14pt] sm:text-[15pt] font-black tracking-wider uppercase font-serif">
              UPT SMK NEGERI 2 PAREPARE
            </div>
            <div className="text-[8pt] text-slate-800 mt-0.5">
              Jl. Jend. Ahmad Yani No. 151 ☎ (0421) 21962 - Fax. (0421) 28149 Parepare 91131
            </div>
            <div className="text-[8pt] text-slate-800">
              Email: <span className="underline">smkn2pare2@gmail.com</span> &nbsp;&nbsp;&nbsp; Website: <span className="underline">www.smknegeri2parepare.sch.id</span>
            </div>
          </div>
        </div>

        {/* Garis Ganda Kop Surat */}
        <div className="border-b-[3px] border-black mb-0.5"></div>
        <div className="border-b-[1px] border-black mb-4"></div>

        {/* 2. JUDUL DOKUMEN */}
        <div className="text-center font-black text-[11pt] sm:text-[12pt] uppercase tracking-wider mb-3 text-black">
          JADWAL PELAKSANAAN PEMBELAJARAN TATAP MUKA DI KELAS
        </div>

        {/* 3. IDENTITAS GURU & PERIODE */}
        <div className="grid grid-cols-2 text-[9pt] font-bold text-black mb-3 pb-1 border-b border-slate-300">
          <div className="space-y-1">
            <div className="flex">
              <span className="w-28 sm:w-32">NAMA GURU</span>
              <span>: &nbsp;{currentTeacher.name}</span>
            </div>
            <div className="flex">
              <span className="w-28 sm:w-32">NIP / GOL</span>
              <span>: &nbsp;{currentTeacher.nip || "-"}</span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex">
              <span className="w-28 sm:w-32">SEMESTER / TP</span>
              <span>: &nbsp;Ganjil / 2026-2027</span>
            </div>
            <div className="flex">
              <span className="w-28 sm:w-32">BERLAKU</span>
              <span>: &nbsp;13 Juli 2026</span>
            </div>
          </div>
        </div>

        {/* 4. TABEL JADWAL SESUAI GAMBAR RESMI */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[8pt] sm:text-[8.5pt] border-2 border-black">
            <thead>
              <tr className="bg-[#fb923c] text-black font-black uppercase text-center border-b-2 border-black">
                <th className="border border-black py-1.5 px-2 w-28 sm:w-32" colSpan={2}>
                  JAM
                </th>
                <th className="border border-black py-1.5 px-2">MATA PELAJARAN</th>
                <th className="border border-black py-1.5 px-2 w-16 sm:w-20">KELAS</th>
                <th className="border border-black py-1.5 px-2 w-14 sm:w-16">RUANG</th>
                <th className="border border-black py-1.5 px-2 w-12 sm:w-14">JTM</th>
              </tr>
            </thead>
            <tbody>
              {dayScheduleData.map(({ day, rows }) => {
                if (rows.length === 0) return null;
                const totalRows = rows.length;

                return rows.map((row: any, rIdx: number) => {
                  const isFirstRowOfDay = rIdx === 0;

                  return (
                    <tr
                      key={`${day.id}-${rIdx}`}
                      className={`border-b border-black ${
                        row.type === "CEREMONY"
                          ? "bg-[#fef08a] font-bold"
                          : row.type === "BREAK"
                          ? "bg-[#bae6fd]"
                          : ""
                      }`}
                    >
                      {/* Kolom Hari Vertikal (Hanya dirender pada baris pertama hari tersebut) */}
                      {isFirstRowOfDay && (
                        <td
                          rowSpan={totalRows}
                          className="border border-black bg-[#9388a2] text-black font-black text-center align-middle w-7 sm:w-8 text-[9pt] uppercase tracking-widest p-0 select-none"
                          style={{
                            writingMode: "vertical-rl",
                            transform: "rotate(180deg)",
                          }}
                        >
                          {day.dayName.split("").join(" ")}
                        </td>
                      )}

                      {/* Kolom Rentang Waktu (Jam) */}
                      <td className="border border-black py-1 px-1.5 text-center font-medium whitespace-nowrap text-[8pt] w-24">
                        {row.time}
                      </td>

                      {/* Kolom Nomor Jam Ke- (Kosong jika Upacara atau Istirahat) */}
                      <td className="border border-black py-1 px-1 text-center font-bold w-7">
                        {row.periodNum || ""}
                      </td>

                      {/* Kolom Mata Pelajaran (Colspan jika Upacara atau Istirahat) */}
                      {row.type === "CEREMONY" ? (
                        <td
                          colSpan={4}
                          className="border border-black py-1 px-2 text-center font-black tracking-wider uppercase text-black"
                        >
                          {row.subjectName}
                        </td>
                      ) : row.type === "BREAK" ? (
                        <td
                          colSpan={4}
                          className="border border-black py-1 px-2 text-center font-black tracking-wider text-red-600"
                        >
                          {row.subjectName}
                        </td>
                      ) : (
                        <>
                          <td className="border border-black py-1 px-2 font-bold uppercase truncate max-w-[220px]">
                            {row.subjectName}
                          </td>
                          <td className="border border-black py-1 px-1 text-center font-bold uppercase">
                            {row.className}
                          </td>
                          <td className="border border-black py-1 px-1 text-center font-bold uppercase">
                            {row.roomName}
                          </td>
                          {/* Kolom JTM (Di-merge vertikal jika mengajar beberapa jam berurutan) */}
                          {row.jtmSpan > 0 && (
                            <td
                              rowSpan={row.jtmSpan}
                              className="border border-black py-1 px-1 text-center font-black text-[9pt] align-middle bg-slate-50/50"
                            >
                              {row.jtmValue}
                            </td>
                          )}
                        </>
                      )}
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>

        {/* 5. KOTAK REKAPITULASI TUGAS TAMBAHAN & TOTAL BEBAN KERJA */}
        <div className="mt-4 p-3.5 border-2 border-black rounded-lg bg-slate-50/80 space-y-2 text-[8.5pt]">
          <div className="font-black uppercase tracking-wider text-black border-b border-slate-300 pb-1 flex items-center justify-between">
            <span>REKAPITULASI BEBAN KERJA &amp; TUGAS TAMBAHAN GURU</span>
            <span className="text-[7.5pt] font-semibold text-slate-600">
              Permendikdasmen No. 11 Tahun 2025
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-black">
            {/* Box 1: Beban Tatap Muka */}
            <div className="p-2.5 bg-white border border-slate-300 rounded">
              <div className="text-[7.5pt] text-slate-500 font-bold uppercase">Beban Tatap Muka (KBM)</div>
              <div className="text-[12pt] font-black text-blue-900 mt-0.5">
                {auditSummary.teachingHours}{" "}
                <span className="text-[8pt] font-normal text-slate-500">JP / Minggu</span>
              </div>
              <div className="text-[7.5pt] text-slate-600 mt-1">
                Syarat Minimal Tatap Muka: <strong>{auditSummary.minTeaching} JP</strong>{" "}
                {auditSummary.isMinTeachingMet ? "(✓ Terpenuhi)" : "(✗ Belum)"}
              </div>
            </div>

            {/* Box 2: Rincian Tugas Tambahan */}
            <div className="p-2.5 bg-white border border-slate-300 rounded md:col-span-1">
              <div className="text-[7.5pt] text-slate-500 font-bold uppercase">Tugas Tambahan Diampu</div>
              {teacherDuties.length === 0 ? (
                <div className="text-[8pt] text-slate-400 italic mt-1">Tidak ada tugas tambahan</div>
              ) : (
                <div className="space-y-1 mt-1">
                  {teacherDuties.map((d) => (
                    <div key={d.id} className="text-[8pt] leading-tight">
                      <span className="font-bold">
                        {d.category === "TTU" ? "🔵" : "🟢"} {d.name}
                      </span>{" "}
                      <span className="font-semibold text-amber-900">(+{d.equivalentHours} JP)</span>
                      {d.nomorSk && (
                        <div className="text-[7pt] text-slate-500 font-mono">SK: {d.nomorSk}</div>
                      )}
                    </div>
                  ))}
                  <div className="text-[7.5pt] text-slate-600 pt-1 border-t border-slate-200">
                    Ekuivalensi Diakui TPG: <strong>+{auditSummary.recognizedDutyHours} JP</strong>
                  </div>
                </div>
              )}
            </div>

            {/* Box 3: Total Beban Kerja & Status Kelayakan TPG */}
            <div className="p-2.5 bg-white border border-slate-300 rounded">
              <div className="text-[7.5pt] text-slate-500 font-bold uppercase">Status Kelayakan Sertifikasi</div>
              <div className="text-[12pt] font-black text-slate-900 mt-0.5">
                {auditSummary.totalRecognized}{" "}
                <span className="text-[8pt] font-normal text-slate-500">/ 24 JP Diakui</span>
              </div>
              <div className="mt-1">
                {auditSummary.isValidTPG ? (
                  <span className="inline-block px-2 py-0.5 rounded text-[7.5pt] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                    🟢 MEMENUHI SYARAT TPG (≥ 24 JP)
                  </span>
                ) : !auditSummary.isMinTeachingMet ? (
                  <span className="inline-block px-2 py-0.5 rounded text-[7.5pt] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                    🟡 KURANG TATAP MUKA ({auditSummary.teachingHours}/{auditSummary.minTeaching} JP)
                  </span>
                ) : (
                  <span className="inline-block px-2 py-0.5 rounded text-[7.5pt] font-bold bg-red-100 text-red-900 border border-red-300">
                    🔴 KURANG JAM TOTAL ({auditSummary.totalRecognized}/24 JP)
                  </span>
                )}
              </div>
              <div className="text-[7.5pt] text-slate-500 mt-1">
                Total Beban Riil Sekolah: <strong>{auditSummary.totalReal} JP</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Catatan Dokumen Resmi */}
        <div className="mt-3 text-[7.5pt] text-slate-500 text-right italic">
          Dicetak secara otomatis melalui Sistem Penjadwalan &amp; Audit Beban Kerja UPT SMK Negeri 2 Parepare
        </div>
      </div>

      {/* ==================== PRINT MEDIA STYLES ==================== */}
      <style jsx global>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .no-print {
            display: none !important;
          }
          .print-sheet {
            max-width: 100% !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }
          @page {
            size: A4 portrait;
            margin: 10mm 10mm 10mm 10mm;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  );
}

export default function TeacherPrintPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
          <div className="text-sm font-semibold text-slate-700">Memuat halaman cetak...</div>
        </div>
      }
    >
      <TeacherPrintContent />
    </Suspense>
  );
}
