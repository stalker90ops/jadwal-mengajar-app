"use client";

import React, { useEffect, useState, useMemo, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Printer,
  Download,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Settings,
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

interface PrintConfig {
  logoDataUrl: string | null;
  govLine: string;
  deptLine: string;
  schoolName: string;
  addressLine: string;
  contactLine: string;
  docTitle: string;
  semesterTp: string;
  effectiveDate: string;
}

const DEFAULT_PRINT_CONFIG: PrintConfig = {
  logoDataUrl: null,
  govLine: "PEMERINTAH PROVINSI SULAWESI SELATAN",
  deptLine: "DINAS PENDIDIKAN",
  schoolName: "UPT SMK NEGERI 2 PAREPARE",
  addressLine: "Jl. Jend. Ahmad Yani No. 151 ☎ (0421) 21962 - Fax. (0421) 28149 Parepare 91131",
  contactLine: "Email: smkn2pare2@gmail.com     Website: www.smknegeri2parepare.sch.id",
  docTitle: "JADWAL PELAKSANAAN PEMBELAJARAN TATAP MUKA DI KELAS",
  semesterTp: "Ganjil / 2026-2027",
  effectiveDate: "13 Juli 2026",
};

function TeacherPrintContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const requestedTeacherId = searchParams.get("id");

  const [loading, setLoading] = useState(true);
  const [activeDays, setActiveDays] = useState<ActiveDay[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [additionalDuties, setAdditionalDuties] = useState<AdditionalDuty[]>([]);
  const [printConfig, setPrintConfig] = useState<PrintConfig>(DEFAULT_PRINT_CONFIG);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("");
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [autoZoom, setAutoZoom] = useState<number>(1);
  const sheetRef = useRef<HTMLDivElement | null>(null);

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
          if (data.printConfig) {
            setPrintConfig({
              ...DEFAULT_PRINT_CONFIG,
              ...data.printConfig,
            });
          }

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

  const teacherSchedules = useMemo(() => {
    if (!selectedTeacherId) return [];
    return schedules.filter((s) => s.teacherId === selectedTeacherId);
  }, [schedules, selectedTeacherId]);

  const teacherDuties = useMemo(() => {
    if (!selectedTeacherId) return [];
    return additionalDuties.filter((d) => d.teacherId === selectedTeacherId);
  }, [additionalDuties, selectedTeacherId]);

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

  const handleDownloadPdf = async () => {
    if (!selectedTeacherId) return;
    try {
      setDownloadingPdf(true);
      const res = await fetch(`/api/roster/print-teacher-pdf?id=${selectedTeacherId}`);
      if (!res.ok) {
        window.print();
        return;
      }
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/pdf")) {
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

  const dayScheduleData = useMemo(() => {
    if (!selectedTeacherId) return [];

    return activeDays
      .filter((d) => d.isActive)
      .map((day) => {
        const slots = [...(day.timeSlots || [])].sort((a, b) => a.periodNumber - b.periodNumber);
        const rows: any[] = [];

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
              label:
                slot.label.toLowerCase().includes("ishoma") || slot.label.toLowerCase().includes("sholat")
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

        // Cari index slot mengajar pertama dan terakhir pada hari ini
        const teachingIndices = processedSlots
          .map((item, idx) => (item.type === "TEACHING" && item.sched ? idx : -1))
          .filter((idx) => idx !== -1);

        // Jika guru tidak mengajar sama sekali pada hari ini, sembunyikan hari ini
        if (teachingIndices.length === 0) {
          return { day, rows: [] };
        }

        const firstTeachIdx = teachingIndices[0];
        const lastTeachIdx = teachingIndices[teachingIndices.length - 1];

        // Khusus Senin: tampilkan Upacara Bendera jika guru aktif mengajar pada hari Senin
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

        // Filter hanya slot yang ada jadwal mengajarnya, serta istirahat di antara jam mengajar
        const activeSlotsOnly = processedSlots.filter((item, idx) => {
          if (item.type === "TEACHING") {
            return Boolean(item.sched);
          }
          if (item.type === "BREAK") {
            return idx > firstTeachIdx && idx < lastTeachIdx;
          }
          return false;
        });

        let i = 0;
        while (i < activeSlotsOnly.length) {
          const item = activeSlotsOnly[i];
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
            let count = 1;
            let j = i + 1;
            while (j < activeSlotsOnly.length) {
              const nextItem = activeSlotsOnly[j];
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

            const roomDisplay =
              currentSched.room?.code?.toUpperCase() ||
              currentSched.room?.name?.toUpperCase() ||
              "";

            rows.push({
              type: "TEACHING",
              time: item.time,
              periodNum: item.periodNum,
              subjectName: currentSched.subject?.name?.toUpperCase() || "",
              className: currentSched.classGroup?.name?.toUpperCase() || "",
              roomName: roomDisplay,
              jtmSpan: count,
              jtmValue: count,
            });

            for (let k = 1; k < count; k++) {
              const nextItem = activeSlotsOnly[i + k];
              rows.push({
                type: "TEACHING",
                time: nextItem.time,
                periodNum: nextItem.periodNum,
                subjectName: currentSched.subject?.name?.toUpperCase() || "",
                className: currentSched.classGroup?.name?.toUpperCase() || "",
                roomName: roomDisplay,
                jtmSpan: 0,
                jtmValue: "",
              });
            }

            i += count;
          }
        }

        return {
          day,
          rows,
        };
      })
      .filter((d) => d.rows.length > 0);
  }, [activeDays, teacherSchedules, selectedTeacherId]);

  // Auto-fit: pastikan seluruh konten lembar cetak selalu muat tepat 1 halaman A4 (<= 1045px pada 96dpi)
  useEffect(() => {
    if (loading || !sheetRef.current) return;
    setAutoZoom(1);
    const timer = setTimeout(() => {
      if (!sheetRef.current) return;
      const naturalHeight = sheetRef.current.scrollHeight;
      const maxA4HeightPx = 1045; // ~276mm aman dalam area cetak A4 297mm (margin 5mm)
      if (naturalHeight > maxA4HeightPx) {
        const computedScale = Math.max(0.65, Number((maxA4HeightPx / naturalHeight).toFixed(3)));
        setAutoZoom(computedScale);
      } else {
        setAutoZoom(1);
      }
    }, 80);
    return () => clearTimeout(timer);
  }, [loading, selectedTeacherId, dayScheduleData, printConfig]);

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
    <div className="min-h-screen bg-slate-100 py-4 px-3 sm:px-6">
      {/* ==================== TOP ACTION BAR (NO PRINT) ==================== */}
      <div className="max-w-[210mm] mx-auto mb-4 bg-slate-900 text-white p-3.5 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-3 no-print border border-slate-800">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors"
            title="Kembali ke Halaman Utama"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="font-bold text-sm leading-tight">
              Format Cetak Resmi Jadwal Mengajar Guru
            </h1>
            <p className="text-[11px] text-slate-400">
              Otomatis Fit 1 Lembar Kertas A4 {autoZoom < 1 ? `(Skala Otomatis ${Math.round(autoZoom * 100)}%)` : "(100% Fit)"}
            </p>
          </div>
        </div>

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
              className="bg-transparent text-white font-semibold text-xs px-2 py-1 outline-none cursor-pointer max-w-[190px] truncate"
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

          <Link
            href="/roster?tab=print_config"
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-semibold transition-colors"
            title="Atur Kop Surat, Logo, Semester & Tanggal Berlaku"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Atur Kop</span>
          </Link>

          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-600/30"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak / PDF (1 Hal)</span>
          </button>

          <button
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/30"
          >
            <Download className="w-4 h-4" />
            <span>{downloadingPdf ? "Menyiapkan..." : "Download PDF"}</span>
          </button>
        </div>
      </div>

      {/* ==================== LEMBAR DOKUMEN CETAK RESMI (1 HALAMAN A4) ==================== */}
      <div
        ref={sheetRef}
        style={{
          zoom: autoZoom,
          fontFamily: '"Times New Roman", Times, serif',
          lineHeight: 1.05,
        }}
        className="print-sheet max-w-[210mm] mx-auto bg-white p-5 sm:p-6 rounded-none sm:rounded-xl shadow-xl sm:border border-slate-200 text-black"
      >
        {/* 1. KOP SURAT RESMI SEKOLAH (DINAMIS DARI PENGATURAN ADMIN) */}
        <div className="flex items-center gap-3 pb-1 mb-0">
          <div className="w-16 shrink-0 text-center">
            <img
              src={printConfig.logoDataUrl || "/logo-sulsel.png"}
              alt="Logo Instansi"
              className="w-15 h-auto max-h-20 mx-auto object-contain"
              onError={(e) => {
                (e.target as HTMLElement).style.display = "none";
              }}
            />
          </div>
          <div className="flex-1 text-center leading-none space-y-0.5">
            <div className="text-[12pt] font-bold tracking-wide uppercase">
              {printConfig.govLine}
            </div>
            <div className="text-[12pt] font-bold tracking-wide uppercase">
              {printConfig.deptLine}
            </div>
            <div className="text-[14pt] font-black tracking-wider uppercase">
              {printConfig.schoolName}
            </div>
            {printConfig.addressLine && (
              <div className="text-[8.5pt] text-black m-0">{printConfig.addressLine}</div>
            )}
            {printConfig.contactLine && (
              <div className="text-[8.5pt] text-black m-0">{printConfig.contactLine}</div>
            )}
          </div>
        </div>

        {/* Garis Ganda Kop Surat */}
        <div className="border-b-[2.5px] border-black mb-[1px]"></div>
        <div className="border-b-[1px] border-black mb-2"></div>

        {/* 2. JUDUL DOKUMEN */}
        <div className="text-center font-bold text-[11pt] uppercase tracking-wide mb-2 text-black leading-none">
          {printConfig.docTitle}
        </div>

        {/* 3. IDENTITAS GURU & PERIODE (SPASI 1, TANPA AFTER/BEFORE) */}
        <div className="grid grid-cols-2 text-[9.5pt] font-bold text-black mb-2 leading-[1.1]">
          <div>
            <div className="flex m-0 p-0">
              <span className="w-28 shrink-0">NAMA GURU</span>
              <span>: &nbsp;{currentTeacher.name}</span>
            </div>
            <div className="flex m-0 p-0">
              <span className="w-28 shrink-0">NIP / GOL</span>
              <span>: &nbsp;{currentTeacher.nip || "-"}</span>
            </div>
          </div>
          <div>
            <div className="flex m-0 p-0">
              <span className="w-28 shrink-0">SEMESTER / TP</span>
              <span>: &nbsp;{printConfig.semesterTp}</span>
            </div>
            <div className="flex m-0 p-0">
              <span className="w-28 shrink-0">BERLAKU</span>
              <span>: &nbsp;{printConfig.effectiveDate}</span>
            </div>
          </div>
        </div>

        {/* 4. TABEL JADWAL (HANYA BARIS MENGAJAR AKTIF, TIMES NEW ROMAN, SPASI 1) */}
        <div>
          <table className="w-full border-collapse text-[9.5pt] border-[1.5px] border-black leading-none">
            <thead>
              <tr className="bg-[#fb923c] text-black font-bold uppercase text-center border-b-[1.5px] border-black">
                <th className="border border-black py-1 px-1.5" colSpan={2}>
                  JAM
                </th>
                <th className="border border-black py-1 px-1 w-7">No</th>
                <th className="border border-black py-1 px-2">MATA PELAJARAN</th>
                <th className="border border-black py-1 px-2 whitespace-nowrap">KELAS</th>
                <th className="border border-black py-1 px-2 whitespace-nowrap">RUANG</th>
                <th className="border border-black py-1 px-1.5 w-11">JTM</th>
              </tr>
            </thead>
            <tbody>
              {dayScheduleData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="border border-black py-6 text-center text-[10pt] italic text-slate-600">
                    Belum ada jadwal mengajar tatap muka yang terjadwal untuk guru ini.
                  </td>
                </tr>
              ) : (
                dayScheduleData.map(({ day, rows }) => {
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
                        {isFirstRowOfDay && (
                          <td
                            rowSpan={totalRows}
                            className="border border-black bg-[#9388a2] text-black font-bold text-center align-middle w-7 text-[9pt] uppercase tracking-wider p-0 select-none"
                            style={{
                              writingMode: "vertical-rl",
                              transform: "rotate(180deg)",
                            }}
                          >
                            {day.dayName.toUpperCase()}
                          </td>
                        )}

                        <td className="border border-black py-[3px] px-1.5 text-center whitespace-nowrap text-[9pt] w-24">
                          {row.time}
                        </td>

                        <td className="border border-black py-[3px] px-1 text-center font-bold w-7">
                          {row.periodNum || ""}
                        </td>

                        {row.type === "CEREMONY" ? (
                          <td
                            colSpan={4}
                            className="border border-black py-[3px] px-2 text-center font-bold tracking-wider uppercase text-black"
                          >
                            {row.subjectName}
                          </td>
                        ) : row.type === "BREAK" ? (
                          <td
                            colSpan={4}
                            className="border border-black py-[3px] px-2 text-center font-bold tracking-wider text-red-600"
                          >
                            {row.subjectName}
                          </td>
                        ) : (
                          <>
                            <td className="border border-black py-[3px] px-2 font-bold uppercase">
                              {row.subjectName}
                            </td>
                            <td className="border border-black py-[3px] px-2 text-center font-bold uppercase whitespace-nowrap">
                              {row.className}
                            </td>
                            <td className="border border-black py-[3px] px-2 text-center font-bold uppercase whitespace-nowrap">
                              {row.roomName}
                            </td>
                            {row.jtmSpan > 0 && (
                              <td
                                rowSpan={row.jtmSpan}
                                className="border border-black py-[3px] px-1 text-center font-bold text-[10pt] align-middle bg-slate-50/50"
                              >
                                {row.jtmValue}
                              </td>
                            )}
                          </>
                        )}
                      </tr>
                    );
                  });
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 5. REKAPITULASI TUGAS TAMBAHAN & BEBAN KERJA RINGKAS (SPASI 1) */}
        <div className="mt-2 px-2.5 py-1.5 border-[1.5px] border-black bg-slate-50/80 text-[8.5pt] text-black flex flex-wrap items-center justify-between gap-2 leading-tight">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0">
            <span>
              <strong>Tatap Muka:</strong> {auditSummary.teachingHours} JP
            </span>
            <span>|</span>
            <span>
              <strong>Tugas Tambahan:</strong>{" "}
              {teacherDuties.length === 0
                ? "Tidak ada"
                : teacherDuties
                    .map(
                      (d) =>
                        `${d.name} (+${d.equivalentHours} JP${d.nomorSk ? `, SK: ${d.nomorSk}` : ""})`
                    )
                    .join("; ")}
            </span>
          </div>
          <div className="flex items-center gap-2 font-bold whitespace-nowrap">
            <span>
              Total Diakui: {auditSummary.totalRecognized}/24 JP
            </span>
            {auditSummary.isValidTPG ? (
              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300">
                🟢 VALID TPG
              </span>
            ) : !auditSummary.isMinTeachingMet ? (
              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                🟡 KURANG TM
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-900 border border-red-300">
                🔴 KURANG JP
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ==================== PRINT MEDIA STYLES (STRICT 1 PAGE A4) ==================== */}
      <style jsx global>{`
        @media print {
          html,
          body {
            background: white !important;
            color: black !important;
            padding: 0 !important;
            margin: 0 !important;
            height: 100% !important;
            overflow: hidden !important;
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
            page-break-after: avoid !important;
            page-break-inside: avoid !important;
          }
          @page {
            size: A4 portrait;
            margin: 5mm 7mm 5mm 7mm;
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
