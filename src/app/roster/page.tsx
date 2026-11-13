"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  Users,
  BookOpen,
  DoorOpen,
  Clock,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Trash2,
  Edit3,
  Upload,
  Download,
  Lock,
  Unlock,
  RefreshCw,
  Layers,
  ShieldAlert,
  X,
  Database,
  Briefcase,
  Award,
} from "lucide-react";
import {
  downloadCsvFile,
  parseCsvText,
  DAY_NAMES,
} from "@/lib/csv-helper";
import {
  parseJsonNumberArray,
  validateScheduleCandidate,
  ConflictDetail,
} from "@/lib/schedule-validator";
import SearchableSelect from "@/components/SearchableSelect";
import ProgressModal, { ProgressStep, ProgressStatItem } from "@/components/ProgressModal";

type TabKey =
  | "schedule"
  | "curriculum"
  | "teachers"
  | "subjects"
  | "rooms_classes"
  | "days"
  | "assignments"
  | "additional_duties";

export default function AdminScheduleDashboard() {
  type MainTabKey = "kurikulum" | "referensi";
  const [mainTab, setMainTab] = useState<MainTabKey>("kurikulum");
  const [activeTab, setActiveTab] = useState<TabKey>("schedule");
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState(false);
  const [banner, setBanner] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  // Master Data State
  const [activeDays, setActiveDays] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [curriculumStandards, setCurriculumStandards] = useState<any[]>([]);
  const [additionalDuties, setAdditionalDuties] = useState<any[]>([]);
  const [audit, setAudit] = useState<{
    conflicts: ConflictDetail[];
    conflictingScheduleIds: string[];
  }>({ conflicts: [], conflictingScheduleIds: [] });

  // Filter Grid Jadwal
  const [gridFilterMode, setGridFilterMode] = useState<"CLASS" | "TEACHER" | "ROOM">("CLASS");
  const [gridFilterId, setGridFilterId] = useState<string>("");

  // Modal Tambah/Edit Jadwal Manual
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleForm, setScheduleForm] = useState<{
    id?: string;
    activeDayId: string;
    timeSlotId: string;
    endSlotId: string;
    classGroupId: string;
    subjectId: string;
    teacherId: string;
    roomId: string;
    notes: string;
    isLocked: boolean;
    forceSave: boolean;
  }>({
    activeDayId: "",
    timeSlotId: "",
    endSlotId: "",
    classGroupId: "",
    subjectId: "",
    teacherId: "",
    roomId: "",
    notes: "",
    isLocked: false,
    forceSave: false,
  });

  // Form Guru
  const [teacherForm, setTeacherForm] = useState<{
    id?: string;
    code: string;
    nip: string;
    name: string;
    phone: string;
    maxPeriods: number;
    activeDays: number[];
  }>({
    code: "",
    nip: "",
    name: "",
    phone: "",
    maxPeriods: 24,
    activeDays: [1, 2, 3, 4, 5],
  });

  // Form Mapel
  const [subjectForm, setSubjectForm] = useState<{
    id?: string;
    code: string;
    name: string;
    category: string;
    color: string;
    requiresLab: boolean;
  }>({
    code: "",
    name: "",
    category: "UMUM",
    color: "#2563eb",
    requiresLab: false,
  });

  // Form Ruangan
  const [roomForm, setRoomForm] = useState<{
    id?: string;
    code: string;
    name: string;
    type: string;
    capacity: number;
  }>({
    code: "",
    name: "",
    type: "TEORI",
    capacity: 36,
  });

  // Form Kelas
  const [classForm, setClassForm] = useState<{
    id?: string;
    code: string;
    name: string;
    grade: string;
    defaultRoomId: string;
  }>({
    code: "",
    name: "",
    grade: "X",
    defaultRoomId: "",
  });

  // Hari & Slot Jam
  const [selectedDayForSlot, setSelectedDayForSlot] = useState<string>("");
  const [slotForm, setSlotForm] = useState<{
    id?: string;
    periodNumber: number;
    label: string;
    startTime: string;
    endTime: string;
    isBreak: boolean;
  }>({
    periodNumber: 1,
    label: "Jam Ke-1",
    startTime: "07:00",
    endTime: "07:45",
    isBreak: false,
  });

  // Form Beban Mengajar
  const [assignmentForm, setAssignmentForm] = useState<{
    id?: string;
    teacherId: string;
    subjectId: string;
    classGroupId: string;
    preferredRoomId: string;
    totalPeriods: number;
    maxPerDay: number;
    notes: string;
  }>({
    teacherId: "",
    subjectId: "",
    classGroupId: "",
    preferredRoomId: "",
    totalPeriods: 2,
    maxPerDay: 2,
    notes: "",
  });

  // State Matriks Standar Kurikulum { [subjectId_grade]: { totalPeriods, maxPerDay } }
  const [standardInputs, setStandardInputs] = useState<Record<string, { totalPeriods: number; maxPerDay: number }>>({});

  // State Slot Pinning per subjectId_grade: angka periodNumber yang dipilih, misal [1,2,3]
  const [slotPinInputs, setSlotPinInputs] = useState<Record<string, number[]>>({});

  // Filter & Search Beban Mengajar (Hanya Tampilkan Kelas yang Dipilih untuk Menghemat Memori)
  const [assignmentFilterClass, setAssignmentFilterClass] = useState<string>("");
  const [assignmentFilterTeacherStatus, setAssignmentFilterTeacherStatus] = useState<string>("ALL");
  const [assignmentSearch, setAssignmentSearch] = useState<string>("");

  // Form & Search Tugas Tambahan Guru (Permendikdasmen No. 11/2025)
  const [dutyForm, setDutyForm] = useState<{
    id?: string;
    category: "TTU" | "TTLE";
    name: string;
    equivalentHours: number;
    teacherId: string;
    nomorSk: string;
    notes: string;
  }>({
    category: "TTLE",
    name: "",
    equivalentHours: 2,
    teacherId: "",
    nomorSk: "",
    notes: "",
  });
  const [dutySearch, setDutySearch] = useState<string>("");

  // Modal Progress Operasi Interaktif (Auto-Generate, Import CSV, Terapkan Kurikulum)
  const [progressModal, setProgressModal] = useState<{
    isOpen: boolean;
    iconType: "schedule" | "import" | "curriculum";
    title: string;
    subtitle: string;
    progressPercent: number;
    steps: ProgressStep[];
    activeStepIndex: number;
    status: "running" | "success" | "error";
    errorText?: string;
    resultStats?: ProgressStatItem[];
    extraDetails?: React.ReactNode;
    actionButtonText?: string;
  }>({
    isOpen: false,
    iconType: "schedule",
    title: "",
    subtitle: "",
    progressPercent: 0,
    steps: [],
    activeStepIndex: 0,
    status: "running",
  });

  useEffect(() => {
    // Bangun map standar yang sudah ada
    const initial: Record<string, { totalPeriods: number; maxPerDay: number }> = {};
    const initialPins: Record<string, number[]> = {};
    for (const std of curriculumStandards) {
      initial[`${std.subjectId}_${std.grade}`] = {
        totalPeriods: std.totalPeriods,
        maxPerDay: std.maxPerDay,
      };
      try {
        const pins = JSON.parse(std.preferredTimeSlotPeriods || '[]');
        initialPins[`${std.subjectId}_${std.grade}`] = Array.isArray(pins) ? pins : [];
      } catch {
        initialPins[`${std.subjectId}_${std.grade}`] = [];
      }
    }
    setStandardInputs(initial);
    setSlotPinInputs(initialPins);
  }, [curriculumStandards]);

  const handleStandardChange = (subjectId: string, grade: string, field: "totalPeriods" | "maxPerDay", val: number) => {
    const key = `${subjectId}_${grade}`;
    setStandardInputs((prev) => ({
      ...prev,
      [key]: {
        totalPeriods: field === "totalPeriods" ? val : prev[key]?.totalPeriods || 0,
        maxPerDay: field === "maxPerDay" ? val : prev[key]?.maxPerDay || 2,
      },
    }));
  };

  const toggleSlotPin = (subjectId: string, grade: string, periodNumber: number) => {
    const key = `${subjectId}_${grade}`;
    const maxAllowedPeriods = standardInputs[key]?.totalPeriods ?? 0;

    if (maxAllowedPeriods <= 0) {
      showMessage("info", `Tentukan alokasi JP untuk Tingkat ${grade} terlebih dahulu sebelum memilih slot jam.`);
      return;
    }

    setSlotPinInputs((prev) => {
      const current = prev[key] || [];
      const exists = current.includes(periodNumber);
      if (exists) {
        return {
          ...prev,
          [key]: current.filter((p) => p !== periodNumber),
        };
      } else {
        if (current.length >= maxAllowedPeriods) {
          showMessage("info", `Maksimal memilih ${maxAllowedPeriods} slot jam sesuai alokasi JP Tingkat ${grade} (${maxAllowedPeriods} JP).`);
          return prev;
        }
        return {
          ...prev,
          [key]: [...current, periodNumber].sort((a, b) => a - b),
        };
      }
    });
  };

  const handleSaveSlotPins = async (subjectId: string) => {
    const commonSubject = subjects.find((s) => s.id === subjectId);
    if (!commonSubject) return;
    const pins = ["X", "XI", "XII"].map((grade) => ({
      subjectId,
      grade,
      preferredTimeSlotPeriods: slotPinInputs[`${subjectId}_${grade}`] || [],
    }));
    try {
      const res = await fetch("/api/master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: "curriculum_standard", action: "save_slot_pins", data: { pins } }),
      });
      const result = await res.json();
      if (res.ok) showMessage("success", result.message || "Slot jam pilihan disimpan.");
      else showMessage("error", result.error || "Gagal menyimpan slot jam.");
    } catch {
      showMessage("error", "Gagal terhubung ke server.");
    }
  };

  const handleDownloadCurriculumTemplate = () => {
    const commonSubjects = subjects.filter((s) => s.category === "UMUM");
    const sampleRows =
      commonSubjects.length > 0
        ? commonSubjects.map((s) => {
            const xKey = `${s.id}_X`;
            const xiKey = `${s.id}_XI`;
            const xiiKey = `${s.id}_XII`;
            return [
              s.code,
              s.name,
              standardInputs[xKey]?.totalPeriods ?? 4,
              standardInputs[xiKey]?.totalPeriods ?? 3,
              standardInputs[xiiKey]?.totalPeriods ?? 2,
              standardInputs[xKey]?.maxPerDay ?? 2,
            ];
          })
        : [
            ["BIND", "Bahasa Indonesia", 4, 3, 2, 2],
            ["MAT", "Matematika", 4, 4, 4, 2],
            ["ING", "Bahasa Inggris", 3, 3, 2, 2],
            ["PAI", "Pendidikan Agama Islam", 3, 3, 3, 2],
            ["PPKN", "Pendidikan Pancasila", 2, 2, 2, 2],
            ["PJOK", "Pendidikan Jasmani", 3, 2, 0, 2],
            ["SEJ", "Sejarah", 2, 2, 0, 2],
            ["SENI", "Seni Budaya", 2, 0, 0, 2],
          ];

    downloadCsvFile(
      "Template_Import_Standar_Kurikulum.csv",
      ["Kode_Mapel", "Nama_Mapel", "JP_Kelas_X", "JP_Kelas_XI", "JP_Kelas_XII", "Maks_JP_Per_Hari"],
      sampleRows
    );
  };

  const handleSaveCurriculumStandards = async () => {
    setBusyAction(true);
    try {
      const standardsList: any[] = [];
      const commonSubjects = subjects.filter((s) => s.category === "UMUM");
      const grades = ["X", "XI", "XII"];

      for (const s of commonSubjects) {
        for (const g of grades) {
          const key = `${s.id}_${g}`;
          const item = standardInputs[key];
          if (item && item.totalPeriods !== undefined) {
            standardsList.push({
              subjectId: s.id,
              grade: g,
              totalPeriods: Number(item.totalPeriods),
              maxPerDay: Number(item.maxPerDay) || 2,
              preferredTimeSlotPeriods: slotPinInputs[key] || [],
            });
          }
        }
      }

      const res = await fetch("/api/master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "curriculum_standard",
          action: "save_batch",
          data: { standards: standardsList },
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showMessage("success", data.message || "Standar kurikulum berhasil disimpan!");
        await loadAllData();
      } else {
        showMessage("error", data.error || "Gagal menyimpan standar kurikulum");
      }
    } finally {
      setBusyAction(false);
    }
  };

  const handleClearCurriculumStandards = async () => {
    if (
      !confirm(
        "Yakin ingin mengosongkan seluruh data standar kurikulum? Semua inputan JP X, XI, XII akan direset ke 0."
      )
    )
      return;
    setBusyAction(true);
    try {
      const res = await fetch("/api/master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "curriculum_standard",
          action: "clear_all",
          data: {},
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setStandardInputs({});
        showMessage("success", data.message || "Standar kurikulum berhasil dikosongkan.");
        await loadAllData();
      } else {
        showMessage("error", data.error || "Gagal mengosongkan standar kurikulum");
      }
    } finally {
      setBusyAction(false);
    }
  };

  const handleApplyStandardsToClasses = async () => {
    if (!confirm("Terapkan standar JP mapel umum ke semua rombel (X, XI, XII)? Beban mengajar akan otomatis dibuat tanpa guru (guru bisa dipilih belakangan).")) return;
    setBusyAction(true);

    const steps: ProgressStep[] = [
      { label: "Menyimpan perubahan matriks standar kurikulum", detail: "Menyinkronkan data standar..." },
      { label: `Memetakan ke seluruh ${classes.length} rombel sekolah`, detail: "Mengelompokkan rombel berdasarkan tingkat X, XI, XII..." },
      { label: "Membagi alokasi beban mengajar mapel umum", detail: "Membuat data beban mengajar otomatis..." },
      { label: "Memperbarui tampilan beban mengajar", detail: "Selesai..." },
    ];

    setProgressModal({
      isOpen: true,
      iconType: "curriculum",
      title: "Menerapkan Standar Kurikulum ke Rombel",
      subtitle: `Mendistribusikan standar JP ke ${classes.length} rombel sekolah...`,
      progressPercent: 25,
      steps,
      activeStepIndex: 0,
      status: "running",
      actionButtonText: "Selesai & Lihat Beban Mengajar",
    });

    try {
      // 1. Simpan matriks standar saat ini terlebih dahulu secara massal
      const standardsList: any[] = [];
      const commonSubjects = subjects.filter((s) => s.category === "UMUM");
      const grades = ["X", "XI", "XII"];

      for (const s of commonSubjects) {
        for (const g of grades) {
          const key = `${s.id}_${g}`;
          const item = standardInputs[key];
          if (item && item.totalPeriods !== undefined) {
            standardsList.push({
              subjectId: s.id,
              grade: g,
              totalPeriods: Number(item.totalPeriods),
              maxPerDay: Number(item.maxPerDay) || 2,
              preferredTimeSlotPeriods: slotPinInputs[key] || [],
            });
          }
        }
      }

      await fetch("/api/master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "curriculum_standard",
          action: "save_batch",
          data: { standards: standardsList },
        }),
      });

      setProgressModal((prev) => ({
        ...prev,
        progressPercent: 55,
        activeStepIndex: 1,
      }));

      // 2. Terapkan secara batch massal ke rombel
      const res = await fetch("/api/master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "curriculum_standard",
          action: "apply_to_classes",
          data: {},
        }),
      });

      setProgressModal((prev) => ({
        ...prev,
        progressPercent: 85,
        activeStepIndex: 2,
      }));

      const data = await res.json();
      if (res.ok) {
        await loadAllData();
        setProgressModal({
          isOpen: true,
          iconType: "curriculum",
          title: "Penerapan Kurikulum Berhasil!",
          subtitle: `Standar JP berhasil didistribusikan ke seluruh ${classes.length} rombel.`,
          progressPercent: 100,
          steps,
          activeStepIndex: 3,
          status: "success",
          resultStats: [
            {
              label: "Total Rombel",
              value: `${classes.length} Kelas`,
              badge: "Teraplikasi",
            },
            {
              label: "Status Guru",
              value: "TBD (Belum Ada Guru)",
              badge: "Bisa Diisi Kapan Saja",
            },
          ],
          extraDetails: (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-medium">
              {data.message || "Beban mengajar mapel umum berhasil dibuat ke seluruh rombel."}
            </div>
          ),
          actionButtonText: "Buka Beban Mengajar",
        });
      } else {
        setProgressModal({
          isOpen: true,
          iconType: "curriculum",
          title: "Gagal Menerapkan Standar",
          subtitle: "Terjadi kesalahan pada server.",
          progressPercent: 100,
          steps,
          activeStepIndex: 2,
          status: "error",
          errorText: data.error || "Gagal menerapkan standar kurikulum ke rombel.",
          actionButtonText: "Tutup",
        });
      }
    } catch (err: any) {
      setProgressModal({
        isOpen: true,
        iconType: "curriculum",
        title: "Gagal Menerapkan Standar",
        subtitle: "Terjadi gangguan jaringan.",
        progressPercent: 100,
        steps,
        activeStepIndex: 2,
        status: "error",
        errorText: err?.message || "Koneksi terputus.",
        actionButtonText: "Tutup",
      });
    } finally {
      setBusyAction(false);
    }
  };

  const handleQuickAssignTeacher = async (assignmentId: string, teacherId: string) => {
    try {
      const res = await fetch("/api/master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "assignment",
          action: "assign_teacher",
          data: { id: assignmentId, teacherId },
        }),
      });
      if (res.ok) {
        setAssignments((prev) =>
          prev.map((a) =>
            a.id === assignmentId
              ? {
                  ...a,
                  teacherId: teacherId || null,
                  teacher: teachers.find((t) => t.id === teacherId) || null,
                }
              : a
          )
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importTargetEntity, setImportTargetEntity] = useState<string>("");

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/master");
      if (res.ok) {
        const data = await res.json();
        setActiveDays(data.activeDays || []);
        setTeachers(data.teachers || []);
        setSubjects(data.subjects || []);
        setRooms(data.rooms || []);
        setClasses(data.classes || []);
        setAssignments(data.assignments || []);
        setSchedules(data.schedules || []);
        setCurriculumStandards(data.curriculumStandards || []);
        setAdditionalDuties(data.additionalDuties || []);
        setAudit(data.audit || { conflicts: [], conflictingScheduleIds: [] });

        if (!gridFilterId && data.classes?.length > 0) {
          setGridFilterId(data.classes[0].id);
        }
        if (!assignmentFilterClass && data.classes?.length > 0) {
          setAssignmentFilterClass(data.classes[0].id);
          setAssignmentForm((prev) => ({ ...prev, classGroupId: data.classes[0].id }));
        }
        if (!selectedDayForSlot && data.activeDays?.length > 0) {
          setSelectedDayForSlot(data.activeDays[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (gridFilterMode === "CLASS" && classes.length > 0) {
      if (!classes.some((c) => c.id === gridFilterId)) {
        setGridFilterId(classes[0].id);
      }
    } else if (gridFilterMode === "TEACHER" && teachers.length > 0) {
      if (!teachers.some((t) => t.id === gridFilterId)) {
        setGridFilterId(teachers[0].id);
      }
    } else if (gridFilterMode === "ROOM" && rooms.length > 0) {
      if (!rooms.some((r) => r.id === gridFilterId)) {
        setGridFilterId(rooms[0].id);
      }
    }
    // Set default kelas yang dipilih di Beban Mengajar jika belum ada
    if (classes.length > 0 && (!assignmentFilterClass || !classes.some((c) => c.id === assignmentFilterClass))) {
      setAssignmentFilterClass(classes[0].id);
      setAssignmentForm((prev) => ({ ...prev, classGroupId: classes[0].id }));
    }
  }, [gridFilterMode, classes, teachers, rooms, gridFilterId, assignmentFilterClass]);

  const showMessage = (type: "success" | "error" | "info", text: string) => {
    setBanner({ type, text });
  };

  // ==================== SEED & AUTO-GENERATE ====================
  const handleSeedSample = async () => {
    setBusyAction(true);
    try {
      const res = await fetch("/api/master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: "seed" }),
      });
      const data = await res.json();
      if (res.ok) {
        showMessage("success", data.message || "Data contoh berhasil dimuat!");
        await loadAllData();
      } else {
        showMessage("error", data.error || "Gagal memuat data contoh");
      }
    } finally {
      setBusyAction(false);
    }
  };

  const handleAutoGenerate = async () => {
    setBusyAction(true);
    const steps: ProgressStep[] = [
      { label: "Membaca & menjaga jadwal yang dikunci (Locked Slots)", detail: "Memeriksa slot agar jadwal manual tidak tergeser..." },
      { label: `Menganalisis ketersediaan ${teachers.length} guru & ${rooms.length} ruangan`, detail: "Mengecek hari aktif guru dan lab ruangan..." },
      { label: `Menjalankan algoritma optimasi jadwal untuk ${classes.length} rombel`, detail: "Menyusun kombinasi slot anti-bentrok..." },
      { label: "Menyimpan seluruh jadwal ke database & sinkronisasi", detail: "Menyelesaikan proses..." },
    ];

    setProgressModal({
      isOpen: true,
      iconType: "schedule",
      title: "Menyusun Jadwal Otomatis (Anti-Bentrok)",
      subtitle: `Memproses ${classes.length} Rombel, ${teachers.length} Guru, dan ${rooms.length} Ruangan...`,
      progressPercent: 15,
      steps,
      activeStepIndex: 0,
      status: "running",
      actionButtonText: "Tutup & Lihat Jadwal",
    });

    // Simulasi transisi visual tahap 1 -> 2
    const timer1 = setTimeout(() => {
      setProgressModal((prev) => ({
        ...prev,
        progressPercent: 50,
        activeStepIndex: 1,
      }));
    }, 400);

    const timer2 = setTimeout(() => {
      setProgressModal((prev) => ({
        ...prev,
        progressPercent: 80,
        activeStepIndex: 2,
      }));
    }, 900);

    try {
      const res = await fetch("/api/roster/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "auto_generate" }),
      });
      const data = await res.json();
      clearTimeout(timer1);
      clearTimeout(timer2);

      if (res.ok) {
        await loadAllData();
        const successRate = Math.round(
          ((data.totalScheduledPeriods || 0) / (data.totalRequestedPeriods || 1)) * 100
        );

        setProgressModal({
          isOpen: true,
          iconType: "schedule",
          title: "Auto-Generate Jadwal Berhasil!",
          subtitle: "Jadwal telah selesai disusun dan disimpan ke database.",
          progressPercent: 100,
          steps,
          activeStepIndex: 3,
          status: "success",
          resultStats: [
            {
              label: "Total Terjadwal",
              value: `${data.totalScheduledPeriods || 0} / ${data.totalRequestedPeriods || 0} JP`,
              badge: `${successRate}% Berhasil`,
            },
            {
              label: "Status Bentrok",
              value: "0 Bentrok",
              badge: "Aman 100%",
            },
            {
              label: "Total Rombel",
              value: `${classes.length} Kelas`,
            },
          ],
          extraDetails:
            data.unscheduled && data.unscheduled.length > 0 ? (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-xs">
                <div className="font-bold text-amber-900 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    Perhatian: {data.unscheduled.length} alokasi jam belum kebagian slot penuh
                  </span>
                </div>
                <p className="text-amber-800 text-[11px]">
                  Hal ini terjadi jika hari aktif guru terlalu terbatas, belum ada guru pengampu (TBD), atau kapasitas ruang:
                </p>
                <div className="max-h-36 overflow-y-auto space-y-1.5 pt-1 divide-y divide-amber-200/60">
                  {data.unscheduled.map((u: any, idx: number) => (
                    <div key={idx} className="pt-1 text-[11px] text-amber-900">
                      <div className="font-semibold">
                        {u.className} • {u.subjectName} ({u.teacherName})
                      </div>
                      <div className="text-amber-700">
                        {u.scheduledPeriods}/{u.requestedPeriods} JP — {u.reason}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null,
          actionButtonText: "Tutup & Lihat Jadwal",
        });
      } else {
        setProgressModal({
          isOpen: true,
          iconType: "schedule",
          title: "Auto-Generate Gagal",
          subtitle: "Terjadi kesalahan saat memproses penyusunan jadwal.",
          progressPercent: 100,
          steps,
          activeStepIndex: 2,
          status: "error",
          errorText: data.error || "Gagal melakukan auto-generate jadwal",
          actionButtonText: "Tutup",
        });
      }
    } catch (err: any) {
      clearTimeout(timer1);
      clearTimeout(timer2);
      setProgressModal({
        isOpen: true,
        iconType: "schedule",
        title: "Auto-Generate Gagal",
        subtitle: "Terjadi gangguan jaringan atau server.",
        progressPercent: 100,
        steps,
        activeStepIndex: 2,
        status: "error",
        errorText: err?.message || "Koneksi ke server terputus.",
        actionButtonText: "Tutup",
      });
    } finally {
      setBusyAction(false);
    }
  };

  const handleClearUnlocked = async () => {
    if (!confirm("Hapus seluruh jadwal yang tidak dikunci?")) return;
    setBusyAction(true);
    try {
      const res = await fetch("/api/roster/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear_unlocked" }),
      });
      const data = await res.json();
      if (res.ok) {
        showMessage("info", data.message || "Jadwal berhasil dikosongkan.");
        await loadAllData();
      }
    } finally {
      setBusyAction(false);
    }
  };

  // ==================== REAL-TIME VALIDATION DI MODAL JADWAL ====================
  const liveModalConflicts = useMemo<ConflictDetail[]>(() => {
    if (!showScheduleModal) return [];
    const { activeDayId, timeSlotId, teacherId, subjectId, classGroupId, roomId, id } =
      scheduleForm;
    if (!activeDayId || !timeSlotId || !teacherId || !subjectId || !classGroupId || !roomId) {
      return [];
    }

    const activeDay = activeDays.find((d) => d.id === activeDayId);
    const timeSlot = activeDay?.timeSlots?.find((ts: any) => ts.id === timeSlotId);
    const teacher = teachers.find((t) => t.id === teacherId);
    const classGroup = classes.find((c) => c.id === classGroupId);
    const room = rooms.find((r) => r.id === roomId);
    const subject = subjects.find((s) => s.id === subjectId);

    if (!activeDay || !timeSlot || !teacher || !classGroup || !room) return [];

    return validateScheduleCandidate({
      candidate: {
        id,
        activeDayId,
        timeSlotId,
        teacherId,
        subjectId,
        classGroupId,
        roomId,
      },
      existingSchedules: schedules,
      activeDay,
      timeSlot,
      teacher,
      classGroup,
      room,
      subject,
    });
  }, [
    showScheduleModal,
    scheduleForm,
    activeDays,
    teachers,
    classes,
    rooms,
    subjects,
    schedules,
  ]);

  const liveErrorConflicts = useMemo(
    () => liveModalConflicts.filter((c) => c.severity === "ERROR"),
    [liveModalConflicts]
  );

  // Kalkulasi rentang jam pelajaran yang dipilih di Modal Tambah Jadwal Manual
  const selectedRangeSlots = useMemo(() => {
    if (!showScheduleModal) return [];
    const activeDay = activeDays.find((d) => d.id === scheduleForm.activeDayId);
    if (!activeDay || !activeDay.timeSlots) return [];

    const startSlot = activeDay.timeSlots.find((ts: any) => ts.id === scheduleForm.timeSlotId);
    const endSlot = activeDay.timeSlots.find(
      (ts: any) => ts.id === (scheduleForm.endSlotId || scheduleForm.timeSlotId)
    );

    if (!startSlot || !endSlot) return [];

    const minPeriod = Math.min(startSlot.periodNumber, endSlot.periodNumber);
    const maxPeriod = Math.max(startSlot.periodNumber, endSlot.periodNumber);

    return activeDay.timeSlots
      .filter((ts: any) => ts.periodNumber >= minPeriod && ts.periodNumber <= maxPeriod)
      .sort((a: any, b: any) => a.periodNumber - b.periodNumber);
  }, [
    showScheduleModal,
    scheduleForm.activeDayId,
    scheduleForm.timeSlotId,
    scheduleForm.endSlotId,
    activeDays,
  ]);

  const effectiveRangeSlots = useMemo(() => {
    return selectedRangeSlots.filter(
      (ts: any) =>
        !ts.isBreak &&
        !['istirahat', 'ishoma', 'upacara', 'literasi'].some((k) =>
          ts.label.toLowerCase().includes(k)
        )
    );
  }, [selectedRangeSlots]);

  const breakRangeSlots = useMemo(() => {
    return selectedRangeSlots.filter(
      (ts: any) =>
        ts.isBreak ||
        ['istirahat', 'ishoma', 'upacara', 'literasi'].some((k) =>
          ts.label.toLowerCase().includes(k)
        )
    );
  }, [selectedRangeSlots]);

  const assignmentScheduledCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of schedules) {
      if (s.classGroupId && s.subjectId) {
        const key = `${s.classGroupId}_${s.subjectId}_${s.teacherId || ""}`;
        map.set(key, (map.get(key) || 0) + 1);
      }
    }
    return map;
  }, [schedules]);

  // Data Pilihan Modal yang difilter HANYA dari Beban Mengajar (TeachingAssignment) yang sudah ada
  const modalAvailableClasses = useMemo(() => {
    if (!showScheduleModal) return classes;
    const classIdWithAssignments = new Set(assignments.map((a) => a.classGroupId));
    const list = classes.filter((c) => classIdWithAssignments.has(c.id));
    return list.length > 0 ? list : classes;
  }, [showScheduleModal, classes, assignments]);

  const modalAvailableSubjects = useMemo(() => {
    if (!showScheduleModal || !scheduleForm.classGroupId) return subjects;
    const classAssignments = assignments.filter(
      (a) => a.classGroupId === scheduleForm.classGroupId
    );
    if (classAssignments.length === 0) return subjects;

    const subjectMap = new Map<string, any>();
    for (const a of classAssignments) {
      if (a.subject && !subjectMap.has(a.subjectId)) {
        const scheduled =
          assignmentScheduledCountMap.get(
            `${a.classGroupId}_${a.subjectId}_${a.teacherId || ""}`
          ) || 0;
        const remaining = Math.max(0, (a.totalPeriods || 0) - scheduled);
        subjectMap.set(a.subjectId, {
          ...a.subject,
          assignedTeacherId: a.teacherId,
          assignedTeacherName: a.teacher?.name || "Belum Ada Guru",
          totalPeriods: a.totalPeriods,
          remaining,
          preferredRoomId: a.preferredRoomId,
        });
      }
    }
    return Array.from(subjectMap.values());
  }, [
    showScheduleModal,
    scheduleForm.classGroupId,
    assignments,
    subjects,
    assignmentScheduledCountMap,
  ]);

  const modalAvailableTeachers = useMemo(() => {
    if (!showScheduleModal || !scheduleForm.classGroupId || !scheduleForm.subjectId) {
      return teachers;
    }
    const matchedAssignments = assignments.filter(
      (a) =>
        a.classGroupId === scheduleForm.classGroupId &&
        a.subjectId === scheduleForm.subjectId
    );
    const assignedTeacherIds = matchedAssignments
      .map((a) => a.teacherId)
      .filter((id): id is string => Boolean(id));

    if (assignedTeacherIds.length === 0) return teachers;
    const assignedList = teachers.filter((t) => assignedTeacherIds.includes(t.id));
    return assignedList.length > 0 ? assignedList : teachers;
  }, [
    showScheduleModal,
    scheduleForm.classGroupId,
    scheduleForm.subjectId,
    assignments,
    teachers,
  ]);

  const selectedModalAssignment = useMemo(() => {
    if (!scheduleForm.classGroupId || !scheduleForm.subjectId) return null;
    return (
      assignments.find(
        (a) =>
          a.classGroupId === scheduleForm.classGroupId &&
          a.subjectId === scheduleForm.subjectId &&
          (!scheduleForm.teacherId || a.teacherId === scheduleForm.teacherId)
      ) ||
      assignments.find(
        (a) =>
          a.classGroupId === scheduleForm.classGroupId &&
          a.subjectId === scheduleForm.subjectId
      ) ||
      null
    );
  }, [assignments, scheduleForm.classGroupId, scheduleForm.subjectId, scheduleForm.teacherId]);

  // Sisa kuota JP Beban Mengajar yang akurat untuk modal Tambah/Edit Jadwal
  const modalRemainingQuota = useMemo(() => {
    if (!selectedModalAssignment) return 999;
    const existingCount = schedules.filter(
      (s) =>
        s.classGroupId === scheduleForm.classGroupId &&
        s.subjectId === scheduleForm.subjectId &&
        (!scheduleForm.id || s.id !== scheduleForm.id)
    ).length;
    return Math.max(0, (selectedModalAssignment.totalPeriods || 0) - existingCount);
  }, [
    selectedModalAssignment,
    schedules,
    scheduleForm.classGroupId,
    scheduleForm.subjectId,
    scheduleForm.id,
  ]);

  const requestedPeriodsCount = useMemo(() => {
    if (scheduleForm.id) return 1;
    return effectiveRangeSlots.length;
  }, [scheduleForm.id, effectiveRangeSlots]);

  const isQuotaExceeded = useMemo(() => {
    if (!selectedModalAssignment) return false;
    return requestedPeriodsCount > modalRemainingQuota;
  }, [selectedModalAssignment, requestedPeriodsCount, modalRemainingQuota]);

  const openAddScheduleModal = (dayId?: string, slotId?: string) => {
    const defaultDay = dayId
      ? activeDays.find((d) => d.id === dayId)
      : activeDays.find((d) => d.isActive) || activeDays[0];
    const defaultSlot = slotId
      ? defaultDay?.timeSlots?.find((ts: any) => ts.id === slotId)
      : defaultDay?.timeSlots?.find((ts: any) => !ts.isBreak) || defaultDay?.timeSlots?.[0];

    const defaultClassId =
      gridFilterMode === "CLASS" && gridFilterId
        ? gridFilterId
        : modalAvailableClasses[0]?.id || classes[0]?.id || "";
    const defaultClassObj = classes.find((c) => c.id === defaultClassId);

    const matchedClassAssignment =
      assignments.find((a) => a.classGroupId === defaultClassId && a.teacherId) ||
      assignments.find((a) => a.classGroupId === defaultClassId);

    const defaultSubjectId = matchedClassAssignment?.subjectId || subjects[0]?.id || "";
    const defaultTeacherId =
      matchedClassAssignment?.teacherId ||
      (gridFilterMode === "TEACHER" && gridFilterId ? gridFilterId : teachers[0]?.id || "");

    const defaultRoomId =
      matchedClassAssignment?.preferredRoomId ||
      (gridFilterMode === "ROOM" && gridFilterId
        ? gridFilterId
        : defaultClassObj?.defaultRoomId || rooms[0]?.id || "");

    setScheduleForm({
      id: undefined,
      activeDayId: defaultDay?.id || "",
      timeSlotId: defaultSlot?.id || "",
      endSlotId: defaultSlot?.id || "",
      classGroupId: defaultClassId,
      subjectId: defaultSubjectId,
      teacherId: defaultTeacherId,
      roomId: defaultRoomId,
      notes: "",
      isLocked: false,
      forceSave: false,
    });
    setShowScheduleModal(true);
  };

  const openEditScheduleModal = (item: any) => {
    setScheduleForm({
      id: item.id,
      activeDayId: item.activeDayId,
      timeSlotId: item.timeSlotId,
      endSlotId: item.timeSlotId,
      classGroupId: item.classGroupId,
      subjectId: item.subjectId,
      teacherId: item.teacherId,
      roomId: item.roomId,
      notes: item.notes || "",
      isLocked: Boolean(item.isLocked),
      forceSave: false,
    });
    setShowScheduleModal(true);
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleForm.classGroupId || !scheduleForm.subjectId || !scheduleForm.teacherId || !scheduleForm.roomId) {
      showMessage("error", "Harap pilih Kelas, Mata Pelajaran, Guru, dan Ruangan terlebih dahulu.");
      return;
    }

    // Jika mode tambah baru dan ada rentang jam
    if (!scheduleForm.id) {
      if (effectiveRangeSlots.length === 0) {
        showMessage("error", "Rentang jam yang dipilih hanya berisi waktu istirahat. Pilih rentang jam efektif mengajar.");
        return;
      }
    }

    // Validasi Ketat Kuota Beban Mengajar (JP) - Jumlah jam efektif tidak boleh melebihi beban JP
    if (selectedModalAssignment && isQuotaExceeded) {
      showMessage(
        "error",
        `Jumlah total jam efektif (${requestedPeriodsCount} JP) melebihi batas beban mengajar (${modalRemainingQuota} JP tersisa). Tidak dapat disimpan.`
      );
      return;
    }

    setBusyAction(true);
    try {
      const isBatch = !scheduleForm.id && effectiveRangeSlots.length > 0;
      const action = scheduleForm.id ? "update" : isBatch ? "create_batch" : "create";

      const payload = isBatch
        ? {
            action: "create_batch",
            data: {
              activeDayId: scheduleForm.activeDayId,
              timeSlotIds: effectiveRangeSlots.map((ts: any) => ts.id),
              classGroupId: scheduleForm.classGroupId,
              subjectId: scheduleForm.subjectId,
              teacherId: scheduleForm.teacherId,
              roomId: scheduleForm.roomId,
              notes: scheduleForm.notes,
              isLocked: scheduleForm.isLocked,
              force: scheduleForm.forceSave,
            },
          }
        : {
            action,
            data: {
              ...scheduleForm,
              force: scheduleForm.forceSave,
            },
          };

      const res = await fetch("/api/roster/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setShowScheduleModal(false);
        showMessage(
          data.valid ? "success" : "info",
          data.message ||
            (data.valid
              ? "Jadwal berhasil disimpan & tervalidasi bebas bentrok!"
              : "Jadwal disimpan dengan catatan konflik bentrok.")
        );
        await loadAllData();
      } else {
        showMessage("error", data.error || "Gagal menyimpan jadwal karena terjadi bentrok.");
      }
    } finally {
      setBusyAction(false);
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    // Optimistic delete
    setSchedules((prev) => prev.filter((s) => s.id !== id));
    try {
      await fetch("/api/roster/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", data: { id } }),
      });
    } catch (e) {
      console.error(e);
      await loadAllData();
    }
  };

  const handleToggleLockSchedule = async (item: any) => {
    // Optimistic toggle lock
    setSchedules((prev) =>
      prev.map((s) => (s.id === item.id ? { ...s, isLocked: !s.isLocked } : s))
    );
    try {
      await fetch("/api/roster/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle_lock",
          data: { id: item.id, isLocked: !item.isLocked },
        }),
      });
    } catch (e) {
      console.error(e);
      await loadAllData();
    }
  };

  // ==================== CRUD MASTER DATA ====================
  const handleSaveTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (teacherForm.activeDays.length === 0) {
      showMessage("error", "Pilih minimal 1 hari aktif untuk guru.");
      return;
    }
    setBusyAction(true);
    try {
      const res = await fetch("/api/master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "teacher",
          action: teacherForm.id ? "update" : "create",
          data: teacherForm,
        }),
      });
      const data = await res.json();
      if (res.ok && data.item) {
        setTeacherForm({
          code: "",
          nip: "",
          name: "",
          phone: "",
          maxPeriods: 24,
          activeDays: [1, 2, 3, 4, 5],
        });
        setTeachers((prev) => {
          const exists = prev.some((t) => t.id === data.item.id);
          return exists
            ? prev.map((t) => (t.id === data.item.id ? data.item : t))
            : [...prev, data.item].sort((a, b) => a.code.localeCompare(b.code));
        });
        showMessage("success", "Data guru & hari keaktifan berhasil disimpan.");
      } else {
        showMessage("error", data.error || "Gagal menyimpan guru");
      }
    } finally {
      setBusyAction(false);
    }
  };

  const handleSaveSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyAction(true);
    try {
      const res = await fetch("/api/master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "subject",
          action: subjectForm.id ? "update" : "create",
          data: subjectForm,
        }),
      });
      const data = await res.json();
      if (res.ok && data.item) {
        setSubjectForm({
          code: "",
          name: "",
          category: "UMUM",
          color: "#2563eb",
          requiresLab: false,
        });
        setSubjects((prev) => {
          const exists = prev.some((s) => s.id === data.item.id);
          return exists
            ? prev.map((s) => (s.id === data.item.id ? data.item : s))
            : [...prev, data.item].sort((a, b) => a.code.localeCompare(b.code));
        });
        showMessage("success", "Data mata pelajaran berhasil disimpan.");
      } else {
        showMessage("error", data.error || "Gagal menyimpan mata pelajaran");
      }
    } finally {
      setBusyAction(false);
    }
  };

  const handleSaveRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyAction(true);
    try {
      const res = await fetch("/api/master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "room",
          action: roomForm.id ? "update" : "create",
          data: roomForm,
        }),
      });
      const data = await res.json();
      if (res.ok && data.item) {
        setRoomForm({ code: "", name: "", type: "TEORI", capacity: 36 });
        setRooms((prev) => {
          const exists = prev.some((r) => r.id === data.item.id);
          return exists
            ? prev.map((r) => (r.id === data.item.id ? data.item : r))
            : [...prev, data.item].sort((a, b) => a.code.localeCompare(b.code));
        });
        showMessage("success", "Data ruangan berhasil disimpan.");
      } else {
        showMessage("error", data.error || "Gagal menyimpan ruangan");
      }
    } finally {
      setBusyAction(false);
    }
  };

  const handleSaveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyAction(true);
    try {
      const res = await fetch("/api/master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "class",
          action: classForm.id ? "update" : "create",
          data: classForm,
        }),
      });
      const data = await res.json();
      if (res.ok && data.item) {
        setClassForm({ code: "", name: "", grade: "X", defaultRoomId: "" });
        setClasses((prev) => {
          const exists = prev.some((c) => c.id === data.item.id);
          return exists
            ? prev.map((c) => (c.id === data.item.id ? data.item : c))
            : [...prev, data.item].sort((a, b) => a.code.localeCompare(b.code));
        });
        showMessage("success", "Data kelas/rombel berhasil disimpan.");
      } else {
        showMessage("error", data.error || "Gagal menyimpan kelas");
      }
    } finally {
      setBusyAction(false);
    }
  };

  const handleSaveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignmentForm.subjectId || !assignmentForm.classGroupId) {
      showMessage("error", "Pilih Mata Pelajaran dan Kelas terlebih dahulu.");
      return;
    }
    setBusyAction(true);
    try {
      const res = await fetch("/api/master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "assignment",
          action: assignmentForm.id ? "update" : "create",
          data: assignmentForm,
        }),
      });
      const data = await res.json();
      if (res.ok && data.item) {
        setAssignmentForm({
          id: undefined,
          teacherId: "",
          subjectId: "",
          classGroupId: "",
          preferredRoomId: "",
          totalPeriods: 2,
          maxPerDay: 2,
          notes: "",
        });
        setAssignments((prev) => {
          const exists = prev.some((a) => a.id === data.item.id);
          return exists
            ? prev.map((a) => (a.id === data.item.id ? data.item : a))
            : [data.item, ...prev];
        });
        showMessage("success", "Alokasi beban mengajar berhasil disimpan.");
      } else {
        showMessage("error", data.error || "Gagal menyimpan beban mengajar");
      }
    } finally {
      setBusyAction(false);
    }
  };

  const handleDeleteEntity = async (entity: string, id: string) => {
    if (!confirm("Yakin ingin menghapus data ini?")) return;
    setBusyAction(true);
    // Optimistic state removal
    if (entity === "teacher") setTeachers((prev) => prev.filter((t) => t.id !== id));
    else if (entity === "subject") setSubjects((prev) => prev.filter((s) => s.id !== id));
    else if (entity === "room") setRooms((prev) => prev.filter((r) => r.id !== id));
    else if (entity === "class") setClasses((prev) => prev.filter((c) => c.id !== id));
    else if (entity === "assignment") setAssignments((prev) => prev.filter((a) => a.id !== id));
    else if (entity === "additional_duty") setAdditionalDuties((prev) => prev.filter((d) => d.id !== id));

    try {
      await fetch("/api/master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity, action: "delete", data: { id } }),
      });
    } catch (e) {
      console.error(e);
      await loadAllData();
    } finally {
      setBusyAction(false);
    }
  };

  const handleClearAllAssignments = async () => {
    if (
      !confirm(
        `Yakin ingin mengosongkan seluruh (${assignments.length}) alokasi beban mengajar? Tindakan ini tidak dapat dibatalkan.`
      )
    )
      return;
    setBusyAction(true);
    setAssignments([]);
    try {
      const res = await fetch("/api/master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: "assignment", action: "clear_all" }),
      });
      const data = await res.json();
      if (res.ok) {
        showMessage("success", data.message || "Seluruh beban mengajar berhasil dikosongkan.");
      } else {
        showMessage("error", data.error || "Gagal mengosongkan beban mengajar");
        await loadAllData();
      }
    } finally {
      setBusyAction(false);
    }
  };

  const handleSaveDuty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dutyForm.name.trim()) {
      showMessage("error", "Nama tugas tambahan wajib diisi.");
      return;
    }
    setBusyAction(true);
    try {
      const res = await fetch("/api/master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "additional_duty",
          action: dutyForm.id ? "update" : "create",
          data: dutyForm,
        }),
      });
      const data = await res.json();
      if (res.ok && data.item) {
        setDutyForm({
          category: "TTLE",
          name: "",
          equivalentHours: 2,
          teacherId: "",
          nomorSk: "",
          notes: "",
        });
        setAdditionalDuties((prev) => {
          const exists = prev.some((d) => d.id === data.item.id);
          return exists
            ? prev.map((d) => (d.id === data.item.id ? data.item : d))
            : [...prev, data.item].sort((a, b) => a.name.localeCompare(b.name));
        });
        showMessage("success", "Tugas tambahan berhasil disimpan.");
      } else {
        showMessage("error", data.error || "Gagal menyimpan tugas tambahan");
      }
    } finally {
      setBusyAction(false);
    }
  };

  const handleClearAllDuties = async () => {
    if (
      !confirm(
        `Yakin ingin mengosongkan seluruh (${additionalDuties.length}) tugas tambahan guru? Tindakan ini tidak dapat dibatalkan.`
      )
    )
      return;
    setBusyAction(true);
    setAdditionalDuties([]);
    try {
      const res = await fetch("/api/master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: "additional_duty", action: "clear_all" }),
      });
      const data = await res.json();
      if (res.ok) {
        showMessage("success", data.message || "Seluruh tugas tambahan berhasil dikosongkan.");
      } else {
        showMessage("error", data.error || "Gagal mengosongkan tugas tambahan");
        await loadAllData();
      }
    } finally {
      setBusyAction(false);
    }
  };

  const handleDownloadDutyTemplate = () => {
    const headers = [
      "Kategori",
      "Nama_Tugas",
      "Ekuivalensi_JP",
      "Kode_Guru",
      "NIP",
      "Nama_Guru",
      "Nomor_SK",
      "Keterangan",
    ];
    const sampleRows = [
      [
        "TTU",
        "Wakil Kepala Sekolah Bidang Kurikulum",
        "12",
        teachers[0]?.code || "GR-01",
        teachers[0]?.nip || "197501012000031001",
        teachers[0]?.name || "Drs. H. Ahmad",
        "800/01/SK-SMK/2026",
        "SK Pembagian Tugas 2026/2027 (Permendikdasmen 11/2025)",
      ],
      [
        "TTU",
        "Ketua Program Keahlian (Kakomli)",
        "12",
        teachers[1]?.code || "GR-02",
        teachers[1]?.nip || "198002022005012002",
        teachers[1]?.name || "Siti Rahma, S.Pd",
        "800/02/SK-SMK/2026",
        "Kepala Konsentrasi Keahlian DKV",
      ],
      [
        "TTU",
        "Kepala Bengkel / Laboratorium",
        "12",
        teachers[2]?.code || "GR-03",
        teachers[2]?.nip || "198503032008011003",
        teachers[2]?.name || "Budi Santoso, S.Kom",
        "800/03/SK-SMK/2026",
        "Penanggung Jawab Bengkel TKJ",
      ],
      [
        "TTLE",
        "Wali Kelas X DKV A",
        "2",
        teachers[0]?.code || "GR-01",
        teachers[0]?.nip || "197501012000031001",
        teachers[0]?.name || "Drs. H. Ahmad",
        "800/04/SK-SMK/2026",
        "Wali Kelas (Diakui Administratif karena ada TTU)",
      ],
      [
        "TTLE",
        "Pembina OSIS",
        "2",
        teachers[3]?.code || "GR-04",
        teachers[3]?.nip || "199004042014022004",
        teachers[3]?.name || "Dewi Lestari, S.Pd",
        "800/05/SK-SMK/2026",
        "Bidang Kesiswaan (Maks 6 JP TTLE)",
      ],
      [
        "TTLE",
        "Koordinator P5",
        "2",
        teachers[3]?.code || "GR-04",
        teachers[3]?.nip || "199004042014022004",
        teachers[3]?.name || "Dewi Lestari, S.Pd",
        "800/06/SK-SMK/2026",
        "Projek Penguatan Profil Pelajar Pancasila",
      ],
    ];
    downloadCsvFile("Template_Import_Tugas_Tambahan_Permendikdasmen_11_2025.csv", headers, sampleRows);
  };

  // ==================== IMPORT CSV / EXCEL ====================
  const triggerImportFile = (entity: string) => {
    setImportTargetEntity(entity);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !importTargetEntity) return;

    const entityLabels: Record<string, string> = {
      teacher: "Data Guru",
      subject: "Mata Pelajaran",
      room: "Ruangan",
      class: "Kelas / Rombel",
      activeDay: "Hari & Jam Aktif",
      assignment: "Beban Mengajar",
      curriculum_standard: "Standar Kurikulum",
      additional_duty: "Tugas Tambahan Guru",
    };
    const entityName = entityLabels[importTargetEntity] || importTargetEntity;

    const steps: ProgressStep[] = [
      { label: `Membaca file "${file.name}"`, detail: `Ukuran: ${Math.round(file.size / 1024) || 1} KB...` },
      { label: "Validasi format kolom CSV & kelengkapan data", detail: "Memeriksa baris..." },
      { label: "Menyimpan data ke database", detail: "Mengunggah data..." },
      { label: "Menyinkronkan data ke dashboard", detail: "Memperbarui tampilan..." },
    ];

    setProgressModal({
      isOpen: true,
      iconType: "import",
      title: `Mengimpor ${entityName}`,
      subtitle: `File: ${file.name} (${Math.round(file.size / 1024) || 1} KB)`,
      progressPercent: 20,
      steps,
      activeStepIndex: 0,
      status: "running",
      actionButtonText: "Selesai",
    });

    setBusyAction(true);
    try {
      const text = await file.text();
      const rows = parseCsvText(text);

      if (rows.length === 0) {
        setProgressModal({
          isOpen: true,
          iconType: "import",
          title: `Import ${entityName} Gagal`,
          subtitle: `File: ${file.name}`,
          progressPercent: 100,
          steps,
          activeStepIndex: 1,
          status: "error",
          errorText: "File CSV kosong atau format kolom tidak terbaca. Pastikan menggunakan format template yang disediakan.",
          actionButtonText: "Tutup",
        });
        return;
      }

      setProgressModal((prev) => ({
        ...prev,
        progressPercent: 60,
        activeStepIndex: 2,
        subtitle: `Memproses ${rows.length} baris data dari file ${file.name}...`,
      }));

      const res = await fetch("/api/master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: importTargetEntity,
          action: "import",
          data: { rows },
        }),
      });
      const data = await res.json();

      if (res.ok) {
        await loadAllData();
        setProgressModal({
          isOpen: true,
          iconType: "import",
          title: `Import ${entityName} Berhasil!`,
          subtitle: `File: ${file.name}`,
          progressPercent: 100,
          steps,
          activeStepIndex: 3,
          status: "success",
          resultStats: [
            {
              label: "Status",
              value: "Berhasil",
              badge: "Tersimpan",
            },
            {
              label: "Jumlah Baris",
              value: `${rows.length} Baris`,
            },
            {
              label: "Entitas Data",
              value: entityName,
            },
          ],
          extraDetails: (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-medium">
              {data.message || `Berhasil mengimpor data ${entityName}.`}
            </div>
          ),
          actionButtonText: "Selesai",
        });
      } else {
        setProgressModal({
          isOpen: true,
          iconType: "import",
          title: `Import ${entityName} Gagal`,
          subtitle: `File: ${file.name}`,
          progressPercent: 100,
          steps,
          activeStepIndex: 2,
          status: "error",
          errorText: data.error || "Gagal melakukan import data ke server.",
          actionButtonText: "Tutup",
        });
      }
    } catch (err: any) {
      setProgressModal({
        isOpen: true,
        iconType: "import",
        title: `Import ${entityName} Gagal`,
        subtitle: `File: ${file.name}`,
        progressPercent: 100,
        steps,
        activeStepIndex: 2,
        status: "error",
        errorText: err?.message || "Gagal memproses file CSV.",
        actionButtonText: "Tutup",
      });
    } finally {
      setBusyAction(false);
    }
  };

  // ==================== HELPERS UNTUK GRID JADWAL ====================
  const schoolActiveDays = useMemo(
    () => activeDays.filter((d) => d.isActive),
    [activeDays]
  );

  const allPeriodRows = useMemo(() => {
    if (activeTab !== "schedule" && activeTab !== "days") return [];
    const map = new Map<
      number,
      { periodNumber: number; label: string; startTime: string; endTime: string; isBreak: boolean }
    >();
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
  }, [schoolActiveDays, activeTab]);

  const filteredGridSchedules = useMemo(() => {
    if (activeTab !== "schedule") return [];
    if (gridFilterMode === "CLASS" && gridFilterId) {
      return schedules.filter((s) => s.classGroupId === gridFilterId);
    }
    if (gridFilterMode === "TEACHER" && gridFilterId) {
      return schedules.filter((s) => s.teacherId === gridFilterId);
    }
    if (gridFilterMode === "ROOM" && gridFilterId) {
      return schedules.filter((s) => s.roomId === gridFilterId);
    }
    return schedules;
  }, [schedules, gridFilterMode, gridFilterId, activeTab]);

  const gridSchedulesByCell = useMemo(() => {
    if (activeTab !== "schedule") return new Map<string, any[]>();
    const map = new Map<string, any[]>();
    for (const s of filteredGridSchedules) {
      const key = `${s.activeDayId}_${s.timeSlotId}`;
      const list = map.get(key);
      if (list) {
        list.push(s);
      } else {
        map.set(key, [s]);
      }
    }
    return map;
  }, [filteredGridSchedules, activeTab]);

  const teacherScheduledCountMap = useMemo(() => {
    if (activeTab !== "teachers") return new Map<string, number>();
    const map = new Map<string, number>();
    for (const s of schedules) {
      if (s.teacherId) {
        map.set(s.teacherId, (map.get(s.teacherId) || 0) + 1);
      }
    }
    return map;
  }, [schedules, activeTab]);

  const teacherDutyHoursMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of additionalDuties) {
      if (d.teacherId) {
        const cur = map.get(d.teacherId) || 0;
        map.set(d.teacherId, cur + (Number(d.equivalentHours) || 0));
      }
    }
    return map;
  }, [additionalDuties]);

  const teacherDutiesMap = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const d of additionalDuties) {
      if (d.teacherId) {
        const list = map.get(d.teacherId) || [];
        list.push(d);
        map.set(d.teacherId, list);
      }
    }
    return map;
  }, [additionalDuties]);

  // Audit Beban Kerja Guru & Kelayakan Sertifikasi (TPG 24 JP) sesuai Permendikdasmen No. 11 Tahun 2025
  const teacherWorkloadAuditMap = useMemo(() => {
    const map = new Map<
      string,
      {
        teachingHours: number;
        ttuDuties: any[];
        ttleDuties: any[];
        hasTTU: boolean;
        ttuHours: number;
        ttleTotalHours: number;
        ttleRecognizedHours: number;
        recognizedDutyHours: number;
        realDutyHours: number;
        totalRecognizedWorkload: number;
        totalRealWorkload: number;
        minTeachingRequired: number;
        isMinTeachingMet: boolean;
        isTotalMet: boolean;
        isValidTPG: boolean;
        tpgStatus: "VALID" | "LACK_TEACHING" | "LACK_TOTAL";
        statusMessage: string;
      }
    >();

    for (const t of teachers) {
      const teachingHours = schedules.filter((s) => s.teacherId === t.id).length;
      const duties = additionalDuties.filter((d) => d.teacherId === t.id);

      const ttuDuties = duties.filter(
        (d) => d.category === "TTU" || d.equivalentHours === 12
      );
      const ttleDuties = duties.filter(
        (d) => d.category !== "TTU" && d.equivalentHours !== 12
      );

      const hasTTU = ttuDuties.length > 0;
      const ttuHours = hasTTU ? 12 : 0;
      const ttleTotalHours = ttleDuties.reduce(
        (acc, d) => acc + (Number(d.equivalentHours) || 0),
        0
      );

      // Sesuai Permendikdasmen 11/2025:
      // 1. Jika ada TTU, diakui 12 JP (TTLE non-kumulatif untuk TPG, dicatat administratif).
      // 2. Jika tidak ada TTU, TTLE diakui maksimal 6 JP.
      const ttleRecognizedHours = hasTTU ? 0 : Math.min(6, ttleTotalHours);
      const recognizedDutyHours = hasTTU ? 12 : ttleRecognizedHours;
      const realDutyHours = duties.reduce(
        (acc, d) => acc + (Number(d.equivalentHours) || 0),
        0
      );

      const totalRecognizedWorkload = teachingHours + recognizedDutyHours;
      const totalRealWorkload = teachingHours + realDutyHours;

      // Batas minimal tatap muka
      const minTeachingRequired = hasTTU ? 12 : ttleRecognizedHours > 0 ? 18 : 24;
      const isMinTeachingMet = teachingHours >= minTeachingRequired;
      const isTotalMet = totalRecognizedWorkload >= 24;

      let tpgStatus: "VALID" | "LACK_TEACHING" | "LACK_TOTAL" = "VALID";
      let statusMessage = "Valid TPG (≥ 24 JP)";

      if (!isMinTeachingMet && !isTotalMet) {
        tpgStatus = "LACK_TOTAL";
        statusMessage = `Kurang ${24 - totalRecognizedWorkload} JP (Tatap Muka ${teachingHours}/${minTeachingRequired} JP)`;
      } else if (!isMinTeachingMet) {
        tpgStatus = "LACK_TEACHING";
        statusMessage = `Kurang ${minTeachingRequired - teachingHours} JP Tatap Muka (Min. ${minTeachingRequired} JP)`;
      } else if (!isTotalMet) {
        tpgStatus = "LACK_TOTAL";
        statusMessage = `Kurang ${24 - totalRecognizedWorkload} JP untuk Syarat 24 JP`;
      }

      map.set(t.id, {
        teachingHours,
        ttuDuties,
        ttleDuties,
        hasTTU,
        ttuHours,
        ttleTotalHours,
        ttleRecognizedHours,
        recognizedDutyHours,
        realDutyHours,
        totalRecognizedWorkload,
        totalRealWorkload,
        minTeachingRequired,
        isMinTeachingMet,
        isTotalMet,
        isValidTPG: isMinTeachingMet && isTotalMet,
        tpgStatus,
        statusMessage,
      });
    }

    return map;
  }, [teachers, schedules, additionalDuties]);

  const filteredDuties = useMemo(() => {
    if (!dutySearch.trim()) return additionalDuties;
    const q = dutySearch.toLowerCase();
    return additionalDuties.filter((d) => {
      const matchName = d.name?.toLowerCase().includes(q);
      const matchTeacher =
        d.teacher?.name?.toLowerCase().includes(q) ||
        d.teacher?.code?.toLowerCase().includes(q);
      const matchSk = d.nomorSk?.toLowerCase().includes(q);
      const matchNotes = d.notes?.toLowerCase().includes(q);
      return matchName || matchTeacher || matchSk || matchNotes;
    });
  }, [additionalDuties, dutySearch]);

  const totalTargetJP = useMemo(
    () => assignments.reduce((acc, a) => acc + (a.totalPeriods || 0), 0),
    [assignments]
  );

  const selectedClassObj = useMemo(
    () => (activeTab === "assignments" ? classes.find((c) => c.id === assignmentFilterClass) : undefined),
    [classes, assignmentFilterClass, activeTab]
  );

  const selectedClassTotalJP = useMemo(() => {
    if (activeTab !== "assignments" || !assignmentFilterClass) return 0;
    return assignments
      .filter((a) => a.classGroupId === assignmentFilterClass)
      .reduce((acc, a) => acc + (a.totalPeriods || 0), 0);
  }, [assignments, assignmentFilterClass, activeTab]);

  const teacherOptions = useMemo(
    () =>
      teachers.map((t) => ({
        value: t.id,
        label: t.name,
        badge: t.code,
      })),
    [teachers]
  );

  const filteredAssignments = useMemo(() => {
    if (activeTab !== "assignments" || !assignmentFilterClass) return [];
    return assignments.filter((a) => {
      // HANYA tampilkan beban mengajar untuk kelas yang sedang dipilih
      if (a.classGroupId !== assignmentFilterClass) {
        return false;
      }
      if (assignmentFilterTeacherStatus === "ASSIGNED" && !a.teacherId) {
        return false;
      }
      if (assignmentFilterTeacherStatus === "UNASSIGNED" && a.teacherId) {
        return false;
      }
      if (assignmentSearch.trim()) {
        const q = assignmentSearch.toLowerCase();
        const subName = a.subject?.name?.toLowerCase() || "";
        const subCode = a.subject?.code?.toLowerCase() || "";
        const teaName = a.teacher?.name?.toLowerCase() || "";
        const notes = a.notes?.toLowerCase() || "";
        if (
          !subName.includes(q) &&
          !subCode.includes(q) &&
          !teaName.includes(q) &&
          !notes.includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [assignments, assignmentFilterClass, assignmentFilterTeacherStatus, assignmentSearch, activeTab]);

  const conflictingScheduleIdSet = useMemo(
    () => new Set(audit.conflictingScheduleIds || []),
    [audit.conflictingScheduleIds]
  );

  const conflictDetailsByScheduleId = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!audit?.conflicts) return map;
    for (const c of audit.conflicts) {
      for (const id of c.scheduleIds) {
        const list = map.get(id) || [];
        list.push(c.message);
        map.set(id, list);
      }
    }
    return map;
  }, [audit.conflicts]);

  // Set Hari dan Jam yang memiliki jadwal bentrok untuk memberi aksen merah pada label tabel/header
  const { conflictingDayIds, conflictingPeriodNumbers } = useMemo(() => {
    const days = new Set<string>();
    const periods = new Set<number>();
    for (const item of schedules) {
      if (conflictingScheduleIdSet.has(item.id)) {
        days.add(item.activeDayId);
        if (item.timeSlot?.periodNumber) {
          periods.add(item.timeSlot.periodNumber);
        }
      }
    }
    return { conflictingDayIds: days, conflictingPeriodNumbers: periods };
  }, [schedules, conflictingScheduleIdSet]);

  // State Drag and Drop Jadwal Mengajar
  const [draggedScheduleId, setDraggedScheduleId] = useState<string | null>(null);
  const [dragOverCellKey, setDragOverCellKey] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, schedule: any) => {
    setDraggedScheduleId(schedule.id);
    e.dataTransfer.setData("text/plain", schedule.id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, cellKey: string, isBreak: boolean) => {
    if (isBreak) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverCellKey !== cellKey) {
      setDragOverCellKey(cellKey);
    }
  };

  const handleDragLeave = () => {
    setDragOverCellKey(null);
  };

  const handleDropSchedule = async (e: React.DragEvent, targetDayId: string, targetTimeSlotId: string) => {
    e.preventDefault();
    setDragOverCellKey(null);
    const scheduleId = draggedScheduleId;
    setDraggedScheduleId(null);
    if (!scheduleId) return;

    const currentSchedule = schedules.find((s) => s.id === scheduleId);
    if (!currentSchedule) return;

    if (currentSchedule.activeDayId === targetDayId && currentSchedule.timeSlotId === targetTimeSlotId) {
      return;
    }

    // 1. Cek apakah slot tujuan sudah terisi jadwal lain untuk rombel ini (Cegah Drop)
    const existingInTarget = schedules.find(
      (s) =>
        s.activeDayId === targetDayId &&
        s.timeSlotId === targetTimeSlotId &&
        s.classGroupId === currentSchedule.classGroupId &&
        s.id !== currentSchedule.id
    );

    if (existingInTarget) {
      showMessage(
        "info",
        `Slot tujuan sudah terisi oleh "${existingInTarget.subject?.name || "Pelajaran Lain"}" (${existingInTarget.teacher?.name || "Guru"}). Silakan pilih slot yang masih kosong.`
      );
      return;
    }

    // Update optimistik di UI
    setSchedules((prev) =>
      prev.map((s) =>
        s.id === scheduleId
          ? { ...s, activeDayId: targetDayId, timeSlotId: targetTimeSlotId }
          : s
      )
    );

    try {
      const res = await fetch("/api/roster/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          data: {
            id: currentSchedule.id,
            activeDayId: targetDayId,
            timeSlotId: targetTimeSlotId,
            teacherId: currentSchedule.teacherId,
            subjectId: currentSchedule.subjectId,
            classGroupId: currentSchedule.classGroupId,
            roomId: currentSchedule.roomId,
            notes: currentSchedule.notes,
            isLocked: currentSchedule.isLocked,
            force: true, // Simpan meskipun bentrok, agar bisa ditandai merah di tabel
          },
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        showMessage("error", resData.error || "Gagal menggeser jadwal.");
        await loadAllData();
      } else {
        if (resData.conflicts && resData.conflicts.length > 0) {
          const firstErr = resData.conflicts.find((c: any) => c.severity === "ERROR") || resData.conflicts[0];
          showMessage("info", `Jadwal digeser, namun terdeteksi bentrok: ${firstErr.message}`);
        } else {
          showMessage("success", "Jadwal berhasil digeser!");
        }
        await loadAllData();
      }
    } catch {
      showMessage("error", "Koneksi terputus saat menggeser jadwal.");
      await loadAllData();
    }
  };

  const errorConflictList = useMemo(
    () => audit.conflicts.filter((c) => c.severity === "ERROR"),
    [audit.conflicts]
  );

  const selectedDayObjForSlots = useMemo(
    () => activeDays.find((d) => d.id === selectedDayForSlot) || activeDays[0],
    [activeDays, selectedDayForSlot]
  );

  return (
    <div className="space-y-6">
      {/* Hidden File Input for CSV/Excel Import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.txt,.tsv"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Top Banner Notification */}
      {banner && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 shadow-sm ${
            banner.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : banner.type === "error"
              ? "bg-red-50 border-red-200 text-red-900"
              : "bg-blue-50 border-blue-200 text-blue-900"
          }`}
        >
          <div className="flex items-center gap-2.5 text-sm font-medium">
            {banner.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            )}
            <span>{banner.text}</span>
          </div>
          <button
            onClick={() => setBanner(null)}
            className="text-slate-400 hover:text-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Summary & Action Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Pusat Kendali Penjadwalan Mengajar & Validasi Bentrok
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Input/Import Guru, Mapel, Hari Keaktifan, Kelas & Ruangan, lalu susun jadwal otomatis maupun manual tanpa tabrakan.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleSeedSample}
              disabled={busyAction}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs sm:text-sm font-semibold transition-colors"
            >
              <Database className="w-4 h-4 text-blue-600" />
              <span>Muat Data Contoh</span>
            </button>

            <button
              onClick={handleAutoGenerate}
              disabled={busyAction}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-md shadow-blue-600/20 transition-all disabled:opacity-60"
            >
              <Sparkles className="w-4 h-4" />
              <span>Generate Jadwal Otomatis (Anti-Bentrok)</span>
            </button>

            <button
              onClick={() => openAddScheduleModal()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Jadwal Manual</span>
            </button>
          </div>
        </div>

        {/* Statistik Ringkas */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2 border-t border-slate-100">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="text-xs text-slate-500">Data Guru</div>
            <div className="text-lg font-bold text-slate-900 mt-0.5">{teachers.length} Guru</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="text-xs text-slate-500">Mata Pelajaran</div>
            <div className="text-lg font-bold text-slate-900 mt-0.5">{subjects.length} Mapel</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="text-xs text-slate-500">Kelas & Ruangan</div>
            <div className="text-lg font-bold text-slate-900 mt-0.5">
              {classes.length} Kelas / {rooms.length} Ruang
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="text-xs text-slate-500">Hari Aktif Sekolah</div>
            <div className="text-lg font-bold text-slate-900 mt-0.5">
              {schoolActiveDays.length} Hari Aktif
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="text-xs text-slate-500">Terjadwal vs Alokasi</div>
            <div className="text-lg font-bold text-blue-700 mt-0.5">
              {schedules.length} / {totalTargetJP} JP
            </div>
          </div>
          <div
            className={`p-3 rounded-xl border ${
              errorConflictList.length === 0
                ? "bg-emerald-50 border-emerald-200"
                : "bg-red-50 border-red-300"
            }`}
          >
            <div className="text-xs font-medium text-slate-600">Validasi Bentrok</div>
            {errorConflictList.length === 0 ? (
              <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-sm mt-1">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>0 Bentrok (Aman)</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-red-700 font-bold text-sm mt-1">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorConflictList.length} Bentrok!</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Navigation 2 Tingkat: 2 Tab Utama (Kurikulum & Referensi) + Sub-Tab Pills */}
      <div className="space-y-3">
        {/* Tingkat 1: 2 Tab Utama */}
        <div className="bg-slate-100 p-1.5 rounded-2xl flex items-center gap-1.5 border border-slate-200">
          <button
            type="button"
            onClick={() => {
              setMainTab("kurikulum");
              if (!["schedule", "curriculum", "assignments", "additional_duties"].includes(activeTab)) {
                setActiveTab("schedule");
              }
            }}
            className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2.5 transition-all shadow-sm ${
              mainTab === "kurikulum"
                ? "bg-white text-slate-900 border border-slate-200 shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
            }`}
          >
            <Sparkles className={`w-4 h-4 ${mainTab === "kurikulum" ? "text-blue-600" : "text-slate-400"}`} />
            <div className="text-left">
              <div className="leading-tight flex items-center gap-2">
                <span>1. Kurikulum & Pembelajaran</span>
                {errorConflictList.length > 0 && (
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-red-600 text-white rounded-full">
                    {errorConflictList.length} Bentrok
                  </span>
                )}
              </div>
              <p className="text-[10px] font-normal text-slate-400 mt-0.5 hidden sm:block">
                Struktur Kurikulum (JP), Beban Mengajar, Tabel Mengajar & Tugas Tambahan
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setMainTab("referensi");
              if (!["teachers", "subjects", "rooms_classes", "days"].includes(activeTab)) {
                setActiveTab("teachers");
              }
            }}
            className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2.5 transition-all shadow-sm ${
              mainTab === "referensi"
                ? "bg-white text-slate-900 border border-slate-200 shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
            }`}
          >
            <Layers className={`w-4 h-4 ${mainTab === "referensi" ? "text-indigo-600" : "text-slate-400"}`} />
            <div className="text-left">
              <div className="leading-tight">2. Referensi Data Sekolah</div>
              <p className="text-[10px] font-normal text-slate-400 mt-0.5 hidden sm:block">
                Data Guru, Mata Pelajaran, Ruangan & Kelas, Hari & Jam
              </p>
            </div>
          </button>
        </div>

        {/* Tingkat 2: Sub-Tab Navigasi Sesuai Tab Utama Terpilih */}
        <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
          {mainTab === "kurikulum" ? (
            <>
              {[
                {
                  key: "schedule",
                  label: "Tabel Mengajar & Validasi",
                  icon: Calendar,
                  badge: errorConflictList.length > 0 ? errorConflictList.length : undefined,
                },
                {
                  key: "curriculum",
                  label: "Struktur Kurikulum (Standar JP)",
                  icon: Sparkles,
                },
                {
                  key: "assignments",
                  label: "Beban Mengajar (Alokasi JP)",
                  icon: Layers,
                },
                {
                  key: "additional_duties",
                  label: "Tugas Tambahan Guru",
                  icon: Briefcase,
                  badge: additionalDuties.length > 0 ? additionalDuties.length : undefined,
                },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key as TabKey)}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                      isActive
                        ? "bg-blue-600 text-white shadow-sm shadow-blue-500/20"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                    {tab.badge !== undefined && (
                      <span className="px-2 py-0.5 text-[11px] font-bold bg-red-600 text-white rounded-full">
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </>
          ) : (
            <>
              {[
                { key: "teachers", label: "Data Guru & Hari Aktif", icon: Users },
                { key: "subjects", label: "Daftar Mata Pelajaran", icon: BookOpen },
                { key: "rooms_classes", label: "Ruangan dan Kelas", icon: DoorOpen },
                { key: "days", label: "Hari Keaktifan & Jam Sekolah", icon: Clock },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key as TabKey)}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                      isActive
                        ? "bg-indigo-600 text-white shadow-sm shadow-indigo-500/20"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* ==================== TAB 1: JADWAL & VALIDASI BENTROK ==================== */}
      {activeTab === "schedule" && (
        <div className="space-y-5">
          {/* Panel Deteksi Bentrok (Muncul otomatis jika ada bentrok, atau status hijau jika bersih) */}
          {errorConflictList.length > 0 ? (
            <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-5 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-red-900 font-bold text-base">
                  <ShieldAlert className="w-6 h-6 text-red-600 shrink-0" />
                  <span>
                    Terdeteksi {errorConflictList.length} Bentrok / Pelanggaran Jadwal!
                  </span>
                </div>
                <span className="text-xs font-semibold bg-red-200 text-red-900 px-3 py-1 rounded-full">
                  Perlu Perbaikan
                </span>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {errorConflictList.map((c, idx) => (
                  <div
                    key={idx}
                    className="bg-white p-3 rounded-xl border border-red-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs sm:text-sm"
                  >
                    <div className="space-y-0.5">
                      <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-red-100 text-red-800 mr-2">
                        {c.type}
                      </span>
                      <span className="text-slate-800 font-medium">{c.message}</span>
                    </div>
                    {c.scheduleIds?.length > 0 && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => {
                            const target = schedules.find((s) => s.id === c.scheduleIds[0]);
                            if (target) openEditScheduleModal(target);
                          }}
                          className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded-lg text-xs"
                        >
                          Edit / Pindah
                        </button>
                        <button
                          onClick={() => handleDeleteSchedule(c.scheduleIds[0])}
                          className="px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-700 font-semibold rounded-lg text-xs"
                        >
                          Hapus Salah Satu
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                <div>
                  <h4 className="font-bold text-emerald-950 text-sm">
                    Validasi Jadwal: 100% Bebas Bentrok
                  </h4>
                  <p className="text-xs text-emerald-800">
                    Tidak ada bentrok Guru, Kelas, maupun Ruangan, serta seluruh Guru terjadwal sesuai Hari Keaktifannya.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {schedules.length > 0 && (
                  <button
                    onClick={handleClearUnlocked}
                    className="px-3 py-1.5 bg-white hover:bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs font-semibold transition-colors"
                  >
                    Kosongkan Jadwal
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Filter Bar Matriks Jadwal */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 mr-1">
                Tampilkan Matriks:
              </span>
              {(["CLASS", "TEACHER", "ROOM"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setGridFilterMode(mode)}
                  className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors ${
                    gridFilterMode === mode
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {mode === "CLASS"
                    ? "Per Kelas / Rombel"
                    : mode === "TEACHER"
                    ? "Per Guru"
                    : "Per Ruangan"}
                </button>
              ))}

              <div className="ml-1 min-w-[260px] text-xs">
                <SearchableSelect
                  options={
                    gridFilterMode === "CLASS"
                      ? classes.map((c) => ({
                          value: c.id,
                          label: c.name,
                          badge: c.grade,
                          subLabel: c.code,
                        }))
                      : gridFilterMode === "TEACHER"
                      ? teachers.map((t) => ({
                          value: t.id,
                          label: t.name,
                          badge: t.code,
                        }))
                      : rooms.map((r) => ({
                          value: r.id,
                          label: r.name,
                          badge: r.type,
                          subLabel: r.code,
                        }))
                  }
                  value={gridFilterId}
                  onChange={(val) => setGridFilterId(val)}
                  placeholder={
                    gridFilterMode === "CLASS"
                      ? "-- Pilih Kelas --"
                      : gridFilterMode === "TEACHER"
                      ? "-- Pilih Guru --"
                      : "-- Pilih Ruangan --"
                  }
                  searchPlaceholder={
                    gridFilterMode === "CLASS"
                      ? "Ketik nama/kode kelas..."
                      : gridFilterMode === "TEACHER"
                      ? "Ketik nama/kode guru..."
                      : "Ketik nama/kode ruangan..."
                  }
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const headers = [
                    "Hari",
                    "Slot",
                    "Waktu",
                    "Kelas",
                    "Kode_Mapel",
                    "Mata_Pelajaran",
                    "Kode_Guru",
                    "Nama_Guru",
                    "Kode_Ruangan",
                    "Nama_Ruangan",
                  ];
                  const rows = schedules.map((s) => [
                    s.activeDay?.dayName,
                    s.timeSlot?.label,
                    `${s.timeSlot?.startTime}-${s.timeSlot?.endTime}`,
                    s.classGroup?.name,
                    s.subject?.code,
                    s.subject?.name,
                    s.teacher?.code,
                    s.teacher?.name,
                    s.room?.code,
                    s.room?.name,
                  ]);
                  downloadCsvFile("Master_Jadwal_Mengajar.csv", headers, rows);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Semua Jadwal (CSV/Excel)</span>
              </button>
            </div>
          </div>

          {/* Grid Matriks Interaktif */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-slate-500">Memuat data jadwal...</div>
            ) : classes.length === 0 && teachers.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <p className="text-slate-700 font-semibold">
                  Data Master (Guru, Mapel, Kelas, Ruangan) masih kosong.
                </p>
                <p className="text-xs text-slate-500">
                  Klik tombol <strong>Muat Data Contoh</strong> di kanan atas untuk mengisi data contoh siap pakai, atau import file CSV/Excel Anda pada tab masing-masing.
                </p>
                <button
                  onClick={handleSeedSample}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold"
                >
                  <Database className="w-4 h-4" />
                  Muat Data Contoh Sekarang
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      <th className="py-3.5 px-4 text-left font-semibold w-44 border-r border-slate-800">
                        Slot Jam / Waktu
                      </th>
                      {schoolActiveDays.map((day) => {
                        const filteredTeacher =
                          gridFilterMode === "TEACHER"
                            ? teachers.find((t) => t.id === gridFilterId)
                            : null;
                        const isTeacherOff =
                          filteredTeacher &&
                          !parseJsonNumberArray(filteredTeacher.activeDays).includes(day.dayNumber);
                        const hasConflictInDay = conflictingDayIds.has(day.id);

                        return (
                          <th
                            key={day.id}
                            className={`py-3.5 px-4 text-left font-semibold border-r border-slate-800 min-w-[220px] transition-colors ${
                              hasConflictInDay ? "bg-red-950/90 text-red-200 border-red-500" : ""
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1.5">
                                <span>{day.dayName}</span>
                                {hasConflictInDay && (
                                  <span className="text-[10px] bg-red-600 text-white font-bold px-1.5 py-0.5 rounded shadow-sm">
                                    ⚠️ Ada Bentrok
                                  </span>
                                )}
                              </span>
                              {isTeacherOff && (
                                <span className="text-[10px] bg-red-500/30 text-red-200 border border-red-400/40 px-2 py-0.5 rounded">
                                  Hari Non-Aktif Guru
                                </span>
                              )}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {allPeriodRows.map((row) => {
                      const hasConflictInPeriod = conflictingPeriodNumbers.has(row.periodNumber);
                      return (
                      <tr
                        key={row.periodNumber}
                        className={row.isBreak ? "bg-amber-50/70" : "hover:bg-slate-50/50"}
                      >
                        <td
                          className={`py-3 px-4 border-r border-slate-200 align-top transition-colors ${
                            hasConflictInPeriod
                              ? "bg-red-50/90 border-r-4 border-r-red-500"
                              : "bg-slate-50"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className={`font-bold ${hasConflictInPeriod ? "text-red-900" : "text-slate-800"}`}>
                              {row.label}
                            </span>
                            {hasConflictInPeriod && (
                              <span className="text-[9px] font-bold bg-red-200 text-red-900 px-1 py-0.5 rounded">
                                Bentrok
                              </span>
                            )}
                          </div>
                          <div className={`text-xs mt-0.5 ${hasConflictInPeriod ? "text-red-700 font-medium" : "text-slate-500"}`}>
                            {row.startTime} - {row.endTime}
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
                                Tidak Ada Slot
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

                          const cellSchedules =
                            gridSchedulesByCell.get(`${day.id}_${daySlot.id}`) || [];
                          const cellKey = `${day.id}_${daySlot.id}`;
                          const isDragTarget = dragOverCellKey === cellKey;

                          return (
                            <td
                              key={day.id}
                              onDragOver={(e) => handleDragOver(e, cellKey, daySlot.isBreak)}
                              onDragLeave={handleDragLeave}
                              onDrop={(e) => handleDropSchedule(e, day.id, daySlot.id)}
                              className={`p-2.5 border-r border-slate-200 align-top transition-colors min-h-[90px] ${
                                isDragTarget
                                  ? "bg-blue-50/90 ring-2 ring-inset ring-blue-500 shadow-inner"
                                  : "hover:bg-slate-50/40"
                              }`}
                            >
                              <div className="space-y-2">
                                {cellSchedules.map((item) => {
                                  const isConflicting = conflictingScheduleIdSet.has(item.id);
                                  const conflictReasons = conflictDetailsByScheduleId.get(item.id) || [];
                                  const isBeingDragged = draggedScheduleId === item.id;

                                  return (
                                    <div
                                      key={item.id}
                                      draggable={!item.isLocked}
                                      onDragStart={(e) => {
                                        if (item.isLocked) {
                                          e.preventDefault();
                                          return;
                                        }
                                        handleDragStart(e, item);
                                      }}
                                      title={
                                        item.isLocked
                                          ? "🔒 Jadwal ini TERKUNCI. Buka kunci terlebih dahulu untuk menggeser."
                                          : "💡 Tahan & Drag kartu ini untuk memindahkan jadwal ke slot atau hari lain"
                                      }
                                      className={`p-2.5 rounded-xl border shadow-sm transition-all select-none ${
                                        item.isLocked
                                          ? "cursor-not-allowed border-amber-300 bg-amber-50/20"
                                          : "cursor-grab active:cursor-grabbing hover:border-blue-400 hover:shadow-md"
                                      } ${
                                        isBeingDragged
                                          ? "opacity-30 scale-95 border-dashed border-blue-400"
                                          : isConflicting
                                          ? "bg-red-50/95 border-red-500 ring-2 ring-red-400 shadow-red-100"
                                          : "bg-white border-slate-200"
                                      }`}
                                      style={{
                                        borderLeftWidth: "6px",
                                        borderLeftColor: isConflicting
                                          ? "#dc2626"
                                          : item.subject?.color || "#2563eb",
                                      }}
                                    >
                                      <div className="flex items-start justify-between gap-1">
                                        <span
                                          className={`font-bold text-xs sm:text-sm ${
                                            isConflicting ? "text-red-900" : "text-slate-900"
                                          }`}
                                        >
                                          {item.subject?.name}
                                        </span>
                                        <span
                                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                            isConflicting
                                              ? "bg-red-200 text-red-900"
                                              : "bg-slate-100 text-slate-700"
                                          }`}
                                        >
                                          {item.room?.code}
                                        </span>
                                      </div>

                                      <div className="mt-1 space-y-0.5 text-xs text-slate-600">
                                        <div className={isConflicting ? "text-red-800 font-medium" : ""}>
                                          👨‍🏫 {item.teacher?.name}
                                        </div>
                                        <div
                                          className={`font-semibold ${
                                            isConflicting ? "text-red-800" : "text-blue-700"
                                          }`}
                                        >
                                          🎓 {item.classGroup?.name}
                                        </div>
                                      </div>

                                      {/* Tampilan Bentrok Mencolok (Warna Merah & Penjelasan Detail Penyebab Bentrok) */}
                                      {isConflicting && (
                                        <div className="mt-2 p-1.5 bg-red-100/90 border border-red-300 rounded-lg text-[10px] text-red-900 space-y-1">
                                          <div className="font-extrabold text-red-700 flex items-center gap-1">
                                            <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                                            <span>BENTROK TERDETEKSI!</span>
                                          </div>
                                          {conflictReasons.length > 0 ? (
                                            <ul className="list-disc list-inside space-y-0.5 leading-tight">
                                              {conflictReasons.map((reason, rIdx) => (
                                                <li key={rIdx} className="font-medium">
                                                  {reason}
                                                </li>
                                              ))}
                                            </ul>
                                          ) : (
                                            <div className="italic">Jadwal ini bentrok dengan jadwal guru/kelas lain pada jam ini.</div>
                                          )}
                                        </div>
                                      )}

                                      <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between">
                                        <button
                                          onClick={() => handleToggleLockSchedule(item)}
                                          title={
                                            item.isLocked
                                              ? "Terkunci (Tidak digeser saat Auto-Generate)"
                                              : "Kunci posisi jadwal ini"
                                          }
                                          className={`text-xs inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${
                                            item.isLocked
                                              ? "bg-amber-100 text-amber-800 font-semibold"
                                              : "text-slate-400 hover:text-slate-700"
                                          }`}
                                        >
                                          {item.isLocked ? (
                                            <>
                                              <Lock className="w-3 h-3" /> Terkunci
                                            </>
                                          ) : (
                                            <>
                                              <Unlock className="w-3 h-3" /> Kunci
                                            </>
                                          )}
                                        </button>

                                        <div className="flex items-center gap-1">
                                          <button
                                            onClick={() => openEditScheduleModal(item)}
                                            className="p-1 text-slate-500 hover:text-blue-600 rounded"
                                            title="Edit / Pindah Slot"
                                          >
                                            <Edit3 className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            onClick={() => handleDeleteSchedule(item.id)}
                                            className="p-1 text-slate-500 hover:text-red-600 rounded"
                                            title="Hapus Jadwal"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}

                                {cellSchedules.length === 0 && (
                                  <button
                                    onClick={() => openAddScheduleModal(day.id, daySlot.id)}
                                    className="w-full h-16 border border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/50 text-slate-400 hover:text-blue-600 rounded-xl text-xs font-medium flex items-center justify-center gap-1 transition-colors"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Isi Slot</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== TAB 2: STRUKTUR KURIKULUM (STANDAR JP MAPEL UMUM) ==================== */}
      {activeTab === "curriculum" && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-600" />
                <span>Matriks Standar Beban Jam Mengajar (Khusus Mapel Umum)</span>
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                Tentukan alokasi Jam Pelajaran (JP) per minggu untuk setiap tingkat kelas (X, XI, XII). Cukup atur sekali, lalu sistem akan otomatis membuat beban mengajar ke seluruh <strong>{classes.length} Rombel</strong> tanpa perlu input manual berulang-ulang.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadCurriculumTemplate}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs sm:text-sm font-semibold transition-colors"
                title="Unduh format template CSV Excel untuk diisi secara offline"
              >
                <Download className="w-4 h-4" />
                <span>Unduh Template CSV</span>
              </button>

              <button
                type="button"
                onClick={() => triggerImportFile("curriculum_standard")}
                disabled={busyAction}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-sm transition-colors"
                title="Unggah file CSV standar kurikulum"
              >
                <Upload className="w-4 h-4" />
                <span>Import CSV Standar</span>
              </button>

              <button
                type="button"
                onClick={handleSaveCurriculumStandards}
                disabled={busyAction}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors"
              >
                <span>Simpan Matriks</span>
              </button>

              <button
                type="button"
                onClick={handleClearCurriculumStandards}
                disabled={busyAction}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs sm:text-sm font-semibold transition-colors"
                title="Kosongkan seluruh data standar kurikulum"
              >
                <Trash2 className="w-4 h-4" />
                <span>Kosongkan Matriks</span>
              </button>

              <button
                type="button"
                onClick={handleApplyStandardsToClasses}
                disabled={busyAction}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-md shadow-blue-600/20 transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                <span>🚀 Terapkan ke Seluruh {classes.length} Rombel</span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 flex items-center justify-between">
              <span>Daftar Mata Pelajaran Kategori UMUM ({subjects.filter((s) => s.category === "UMUM").length} Mapel)</span>
              <span className="text-slate-500 italic">*Mapel Kejuruan (Produktif) diatur di Tab Beban Mengajar karena memiliki pembagian 1 s/d 4 guru.</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                    <th className="py-3 px-4 font-semibold w-16">Kode</th>
                    <th className="py-3 px-4 font-semibold">Nama Mata Pelajaran</th>
                    <th className="py-3 px-4 font-semibold text-center w-32 bg-blue-50/60">Tingkat X (JP)</th>
                    <th className="py-3 px-4 font-semibold text-center w-32 bg-emerald-50/60">Tingkat XI (JP)</th>
                    <th className="py-3 px-4 font-semibold text-center w-32 bg-purple-50/60">Tingkat XII (JP)</th>
                    <th className="py-3 px-4 font-semibold text-center w-32">Maks JP/Hari</th>
                    <th className="py-3 px-4 font-semibold text-center min-w-[260px]">Slot Jam Pilihan <span className="font-normal text-slate-400 text-xs">(opsional, berlaku semua tingkat)</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {subjects
                    .filter((s) => s.category === "UMUM")
                    .map((s) => {
                      const xKey = `${s.id}_X`;
                      const xiKey = `${s.id}_XI`;
                      const xiiKey = `${s.id}_XII`;

                      const xJP = standardInputs[xKey]?.totalPeriods ?? 0;
                      const xiJP = standardInputs[xiKey]?.totalPeriods ?? 0;
                      const xiiJP = standardInputs[xiiKey]?.totalPeriods ?? 0;
                      const maxDay = standardInputs[xKey]?.maxPerDay ?? 2;

                      return (
                        <tr key={s.id} className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-mono font-bold text-slate-800">{s.code}</td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900">{s.name}</div>
                            {s.requiresLab && (
                              <span className="inline-block mt-0.5 px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 rounded">
                                Wajib Lab / Khusus
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-4 text-center bg-blue-50/30">
                            <input
                              type="number"
                              min={0}
                              max={10}
                              value={xJP}
                              onChange={(e) => handleStandardChange(s.id, "X", "totalPeriods", Number(e.target.value))}
                              className="w-20 px-2 py-1.5 text-center font-bold text-blue-700 bg-white border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                              placeholder="0 JP"
                            />
                          </td>
                          <td className="py-2 px-4 text-center bg-emerald-50/30">
                            <input
                              type="number"
                              min={0}
                              max={10}
                              value={xiJP}
                              onChange={(e) => handleStandardChange(s.id, "XI", "totalPeriods", Number(e.target.value))}
                              className="w-20 px-2 py-1.5 text-center font-bold text-emerald-700 bg-white border border-emerald-200 rounded-lg focus:ring-2 focus:ring-emerald-500"
                              placeholder="0 JP"
                            />
                          </td>
                          <td className="py-2 px-4 text-center bg-purple-50/30">
                            <input
                              type="number"
                              min={0}
                              max={10}
                              value={xiiJP}
                              onChange={(e) => handleStandardChange(s.id, "XII", "totalPeriods", Number(e.target.value))}
                              className="w-20 px-2 py-1.5 text-center font-bold text-purple-700 bg-white border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500"
                              placeholder="0 JP"
                            />
                          </td>
                          <td className="py-2 px-4 text-center">
                            <input
                              type="number"
                              min={1}
                              max={6}
                              value={maxDay}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                handleStandardChange(s.id, "X", "maxPerDay", val);
                                handleStandardChange(s.id, "XI", "maxPerDay", val);
                                handleStandardChange(s.id, "XII", "maxPerDay", val);
                              }}
                              className="w-16 px-2 py-1.5 text-center text-slate-700 bg-white border border-slate-300 rounded-lg"
                            />
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Panel Slot Jam Pilihan (Pinning) per Mapel */}
          {(() => {
            const refDay = activeDays.find((d: any) => d.isActive) || activeDays[0];
            const availableSlots = refDay
              ? (refDay.timeSlots || []).filter((ts: any) => !ts.isBreak).sort((a: any, b: any) => a.periodNumber - b.periodNumber)
              : [];
            const umum = subjects.filter((s) => s.category === "UMUM");
            if (!availableSlots.length || !umum.length) return null;
            return (
              <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm overflow-hidden">
                <div className="p-4 bg-indigo-50 border-b border-indigo-200">
                  <div className="font-bold text-indigo-900 text-sm flex items-center gap-2">
                    🕐 Slot Jam Pilihan per Mata Pelajaran
                    <span className="font-normal text-indigo-500 text-xs">(Opsional — berlaku saat Auto-Generate)</span>
                  </div>
                  <p className="text-xs text-indigo-600 mt-0.5">Pilih jam ke berapa mapel ini sebaiknya dijadwalkan. Jika tidak dipilih, sistem bebas mencari slot kosong. Klik <strong>Simpan Slot</strong> per baris setelah memilih.</p>
                </div>
                <div className="divide-y divide-slate-100">
                  {umum.map((s) => {
                    const gradeRows = [
                      { grade: "X", label: "Kls X", selClass: "bg-blue-600 border-blue-600", hoverClass: "hover:border-blue-400 hover:text-blue-600" },
                      { grade: "XI", label: "Kls XI", selClass: "bg-emerald-600 border-emerald-600", hoverClass: "hover:border-emerald-400 hover:text-emerald-600" },
                      { grade: "XII", label: "Kls XII", selClass: "bg-purple-600 border-purple-600", hoverClass: "hover:border-purple-400 hover:text-purple-600" },
                    ];
                    const hasAnyPin = gradeRows.some((g) => (slotPinInputs[`${s.id}_${g.grade}`] || []).length > 0);
                    return (
                      <div key={s.id} className="p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-mono font-bold text-slate-500 text-xs">{s.code}</span>
                          <span className="text-sm font-semibold text-slate-900">{s.name}</span>
                          {hasAnyPin && <span className="px-1.5 py-0.5 text-[10px] font-bold bg-indigo-100 text-indigo-700 rounded">📌 Ada Pin</span>}
                        </div>
                        <div className="space-y-1.5">
                          {gradeRows.map(({ grade, label, hoverClass, selClass }) => {
                            const pinKey = `${s.id}_${grade}`;
                            const selectedPins = slotPinInputs[pinKey] || [];
                            const targetJP = standardInputs[pinKey]?.totalPeriods ?? 0;
                            const isComplete = targetJP > 0 && selectedPins.length === targetJP;

                            return (
                              <div key={grade} className="flex flex-wrap items-center gap-2 py-1">
                                <div className="w-24 shrink-0 flex items-center justify-between">
                                  <span className="text-xs font-bold text-slate-700">{label}</span>
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                    targetJP > 0 ? "bg-slate-100 text-slate-700" : "bg-slate-50 text-slate-400"
                                  }`}>
                                    {targetJP} JP
                                  </span>
                                </div>

                                <div className="flex flex-wrap items-center gap-1">
                                  {availableSlots.map((ts: any) => {
                                    const isSelected = selectedPins.includes(ts.periodNumber);
                                    return (
                                      <button
                                        key={ts.id}
                                        type="button"
                                        disabled={targetJP <= 0}
                                        onClick={() => toggleSlotPin(s.id, grade, ts.periodNumber)}
                                        title={`${ts.label} (${ts.startTime}–${ts.endTime})`}
                                        className={`w-7 h-7 rounded-lg text-xs font-bold border transition-all ${
                                          targetJP <= 0
                                            ? "bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed"
                                            : isSelected
                                            ? `${selClass} text-white shadow-sm ring-1 ring-offset-1 ring-blue-500`
                                            : `bg-white text-slate-600 border-slate-300 ${hoverClass}`
                                        }`}
                                      >
                                        {ts.periodNumber}
                                      </button>
                                    );
                                  })}
                                </div>

                                {targetJP > 0 ? (
                                  <span
                                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                                      isComplete
                                        ? "bg-emerald-100 text-emerald-800"
                                        : selectedPins.length > 0
                                        ? "bg-amber-100 text-amber-800"
                                        : "bg-slate-100 text-slate-500"
                                    }`}
                                  >
                                    {isComplete
                                      ? `✓ ${selectedPins.length}/${targetJP} JP Pas`
                                      : selectedPins.length > 0
                                      ? `${selectedPins.length}/${targetJP} JP (Pilih ${targetJP - selectedPins.length} lagi)`
                                      : `0/${targetJP} JP (Bebas Slot)`}
                                  </span>
                                ) : (
                                  <span className="text-[10px] italic text-slate-400">
                                    Setel JP di atas untuk memilih slot
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() => handleSaveSlotPins(s.id)}
                            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors"
                          >
                            Simpan Slot {s.code}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ==================== TAB 4: DATA GURU & HARI KEAKTIFAN ==================== */}
      {activeTab === "teachers" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form Input / Edit Guru */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm h-fit space-y-4">
            <h3 className="font-bold text-slate-900 text-base">
              {teacherForm.id ? "Edit Data Guru & Hari Aktif" : "Tambah Guru & Hari Keaktifan"}
            </h3>

            <form onSubmit={handleSaveTeacher} className="space-y-3.5 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kode Guru *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="GR-01"
                    value={teacherForm.code}
                    onChange={(e) => setTeacherForm({ ...teacherForm, code: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Maksimal JP/Minggu
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={48}
                    value={teacherForm.maxPeriods}
                    onChange={(e) =>
                      setTeacherForm({ ...teacherForm, maxPeriods: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Lengkap Guru & Gelar *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Budi Santoso, S.Pd."
                  value={teacherForm.name}
                  onChange={(e) => setTeacherForm({ ...teacherForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    NIP / NUPTK
                  </label>
                  <input
                    type="text"
                    placeholder="198501..."
                    value={teacherForm.nip}
                    onChange={(e) => setTeacherForm({ ...teacherForm, nip: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    No. HP / WhatsApp
                  </label>
                  <input
                    type="text"
                    placeholder="0812..."
                    value={teacherForm.phone}
                    onChange={(e) => setTeacherForm({ ...teacherForm, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Hari Keaktifan Mengajar Guru *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3, 4, 5, 6].map((dayNum) => {
                    const checked = teacherForm.activeDays.includes(dayNum);
                    return (
                      <button
                        type="button"
                        key={dayNum}
                        onClick={() => {
                          const next = checked
                            ? teacherForm.activeDays.filter((d) => d !== dayNum)
                            : [...teacherForm.activeDays, dayNum].sort((a, b) => a - b);
                          setTeacherForm({ ...teacherForm, activeDays: next });
                        }}
                        className={`py-2 px-2.5 rounded-lg text-xs font-semibold border transition-colors ${
                          checked
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : "bg-slate-50 text-slate-600 border-slate-300"
                        }`}
                      >
                        {checked ? "✓ " : ""}
                        {DAY_NAMES[dayNum]}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Guru tidak akan bisa dijadwalkan pada hari yang tidak dicentang (validasi otomatis).
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={busyAction}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg"
                >
                  {teacherForm.id ? "Simpan Perubahan" : "Simpan Data Guru"}
                </button>
                {teacherForm.id && (
                  <button
                    type="button"
                    onClick={() =>
                      setTeacherForm({
                        code: "",
                        nip: "",
                        name: "",
                        phone: "",
                        maxPeriods: 24,
                        activeDays: [1, 2, 3, 4, 5],
                      })
                    }
                    className="px-3 py-2.5 bg-slate-100 text-slate-700 rounded-lg font-medium"
                  >
                    Batal
                  </button>
                )}
              </div>
            </form>

            {/* Box Import CSV / Excel Guru */}
            <div className="pt-4 border-t border-slate-200 space-y-2">
              <div className="text-xs font-bold text-slate-700 uppercase">
                Import Massal Data Guru (CSV / Excel)
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => triggerImportFile("teacher")}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Import CSV Guru</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadCsvFile(
                      "Template_Import_Guru.csv",
                      ["Kode_Guru", "NIP", "Nama_Guru", "No_HP", "Maks_JP", "Hari_Aktif"],
                      [
                        [
                          "GR-01",
                          "198501122010011001",
                          "Budi Santoso, S.Pd.",
                          "081234567801",
                          24,
                          "Senin,Selasa,Rabu,Kamis,Jumat",
                        ],
                        [
                          "GR-02",
                          "199007152019031003",
                          "Andi Wijaya, S.Kom.",
                          "081234567803",
                          24,
                          "Senin,Rabu,Jumat",
                        ],
                      ]
                    )
                  }
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh Template</span>
                </button>
              </div>
            </div>
          </div>

          {/* Tabel Daftar Guru */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900">
                  Daftar Guru & Ketersediaan Hari Aktif ({teachers.length})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Audit Beban Kerja & Kelayakan Sertifikasi TPG (24 JP) sesuai Permendikdasmen No. 11 Tahun 2025
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md font-bold">
                  {teachers.filter((t) => teacherWorkloadAuditMap.get(t.id)?.isValidTPG).length} Valid TPG
                </span>
                <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded-md font-bold">
                  {teachers.filter((t) => !teacherWorkloadAuditMap.get(t.id)?.isValidTPG).length} Belum Memenuhi
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs">
                    <th className="py-3 px-4 font-semibold">Kode</th>
                    <th className="py-3 px-4 font-semibold">Nama Guru & Tugas Tambahan</th>
                    <th className="py-3 px-4 font-semibold">Hari Keaktifan</th>
                    <th className="py-3 px-4 font-semibold">Beban Jam Riil</th>
                    <th className="py-3 px-4 font-semibold">Validasi TPG (Permendikdasmen 11/2025)</th>
                    <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {teachers.map((t) => {
                    const days = parseJsonNumberArray(t.activeDays);
                    const audit = teacherWorkloadAuditMap.get(t.id);
                    const scheduledCount = audit?.teachingHours || 0;
                    const dutyHours = audit?.realDutyHours || 0;
                    const duties = teacherDutiesMap.get(t.id) || [];
                    const totalRealWorkload = audit?.totalRealWorkload || (scheduledCount + dutyHours);
                    const isOverload = totalRealWorkload > t.maxPeriods;
                    return (
                      <tr key={t.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-bold text-blue-700">{t.code}</td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{t.name}</div>
                          {t.nip && <div className="text-xs text-slate-500">NIP: {t.nip}</div>}
                          {duties.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {duties.map((d: any) => {
                                const isTTU = d.category === "TTU" || d.equivalentHours === 12;
                                return (
                                  <span
                                    key={d.id}
                                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                                      isTTU
                                        ? "bg-indigo-50 text-indigo-800 border-indigo-200"
                                        : "bg-emerald-50 text-emerald-800 border-emerald-200"
                                    }`}
                                    title={`${isTTU ? "Tugas Tambahan Utama" : "Tugas Tambahan Lain"}: ${d.name} (${d.equivalentHours} JP)`}
                                  >
                                    <Briefcase className="w-2.5 h-2.5" />
                                    <span>
                                      {isTTU ? "TTU" : "TTLE"}: {d.name} (+{d.equivalentHours} JP)
                                    </span>
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap gap-1">
                            {[1, 2, 3, 4, 5, 6].map((dNum) => {
                              const active = days.includes(dNum);
                              return (
                                <span
                                  key={dNum}
                                  className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                    active
                                      ? "bg-emerald-100 text-emerald-800"
                                      : "bg-slate-100 text-slate-400 line-through"
                                  }`}
                                >
                                  {DAY_NAMES[dNum].slice(0, 3)}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-800 text-sm">
                            {totalRealWorkload} / {t.maxPeriods} JP
                          </div>
                          <div className="text-[11px] text-slate-500 space-x-1.5 mt-0.5">
                            <span>Tatap Muka: <strong>{scheduledCount}</strong></span>
                            {dutyHours > 0 && (
                              <span className="text-amber-700 font-medium">
                                • Tugas: <strong>+{dutyHours}</strong>
                              </span>
                            )}
                          </div>
                          {isOverload && (
                            <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
                              Overload (+{totalRealWorkload - t.maxPeriods} JP)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {audit?.isValidTPG ? (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Valid TPG (≥ 24 JP)</span>
                              </span>
                              <div className="text-[11px] text-emerald-700 font-medium">
                                Diakui: {audit.teachingHours} TM + {audit.recognizedDutyHours} Tugas = {audit.totalRecognizedWorkload} JP
                              </div>
                              {audit.hasTTU && audit.ttleTotalHours > 0 && (
                                <div className="text-[10px] text-slate-400 italic">
                                  (+{audit.ttleTotalHours} JP TTLE dicatat administratif)
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-0.5">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${
                                  audit?.tpgStatus === "LACK_TEACHING"
                                    ? "bg-amber-100 text-amber-800 border-amber-300"
                                    : "bg-red-100 text-red-800 border-red-300"
                                }`}
                              >
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>
                                  {audit?.tpgStatus === "LACK_TEACHING" ? "Kurang Tatap Muka" : "Kurang Jam TPG"}
                                </span>
                              </span>
                              <div className="text-[11px] text-slate-600 font-medium">
                                {audit?.statusMessage}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                Diakui: {audit?.teachingHours || 0} TM + {audit?.recognizedDutyHours || 0} Tugas = {audit?.totalRecognizedWorkload || 0}/24 JP
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right space-x-2">
                          <button
                            onClick={() =>
                              setTeacherForm({
                                id: t.id,
                                code: t.code,
                                nip: t.nip || "",
                                name: t.name,
                                phone: t.phone || "",
                                maxPeriods: t.maxPeriods,
                                activeDays: days,
                              })
                            }
                            className="text-blue-600 hover:underline text-xs font-semibold"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteEntity("teacher", t.id)}
                            className="text-red-600 hover:underline text-xs font-semibold"
                          >
                            Hapus
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 3: DATA MATA PELAJARAN ==================== */}
      {activeTab === "subjects" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm h-fit space-y-4">
            <h3 className="font-bold text-slate-900 text-base">
              {subjectForm.id ? "Edit Mata Pelajaran" : "Tambah Mata Pelajaran"}
            </h3>

            <form onSubmit={handleSaveSubject} className="space-y-3.5 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kode Mapel *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="MAT"
                    value={subjectForm.code}
                    onChange={(e) => setSubjectForm({ ...subjectForm, code: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Warna Label
                  </label>
                  <input
                    type="color"
                    value={subjectForm.color}
                    onChange={(e) => setSubjectForm({ ...subjectForm, color: e.target.value })}
                    className="w-full h-10 p-1 border border-slate-300 rounded-lg cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Mata Pelajaran *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Matematika Wajib"
                  value={subjectForm.name}
                  onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kategori Mapel
                </label>
                <select
                  value={subjectForm.category}
                  onChange={(e) => setSubjectForm({ ...subjectForm, category: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                >
                  <option value="UMUM">Muatan Nasional / Umum</option>
                  <option value="KEJURUAN">Kejuruan / Peminatan</option>
                  <option value="MUATAN_LOKAL">Muatan Lokal</option>
                  <option value="PILIHAN">Mapel Pilihan</option>
                </select>
              </div>

              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={subjectForm.requiresLab}
                  onChange={(e) =>
                    setSubjectForm({ ...subjectForm, requiresLab: e.target.checked })
                  }
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-xs font-medium text-slate-700">
                  Prioritaskan Ruang Laboratorium / Praktik saat Auto-Generate
                </span>
              </label>

              <button
                type="submit"
                disabled={busyAction}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg"
              >
                {subjectForm.id ? "Simpan Perubahan" : "Simpan Mata Pelajaran"}
              </button>
            </form>

            <div className="pt-4 border-t border-slate-200 space-y-2">
              <div className="text-xs font-bold text-slate-700 uppercase">
                Import CSV / Excel Mata Pelajaran
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => triggerImportFile("subject")}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Import CSV Mapel</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadCsvFile(
                      "Template_Import_Mapel.csv",
                      ["Kode_Mapel", "Nama_Mapel", "Kategori", "Warna", "Butuh_Lab"],
                      [
                        ["MAT", "Matematika", "UMUM", "#2563eb", "Tidak"],
                        ["INF", "Informatika", "KEJURUAN", "#0891b2", "Ya"],
                      ]
                    )
                  }
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh Template</span>
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200">
              <h3 className="font-bold text-slate-900">
                Daftar Mata Pelajaran ({subjects.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <th className="py-3 px-4 font-semibold">Kode</th>
                    <th className="py-3 px-4 font-semibold">Mata Pelajaran</th>
                    <th className="py-3 px-4 font-semibold">Kategori</th>
                    <th className="py-3 px-4 font-semibold">Kebutuhan Ruang</th>
                    <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {subjects.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-bold">{s.code}</td>
                      <td className="py-3 px-4">
                        <span
                          className="inline-flex items-center px-2.5 py-1 rounded-md text-white text-xs font-semibold"
                          style={{ backgroundColor: s.color }}
                        >
                          {s.name}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{s.category}</td>
                      <td className="py-3 px-4">
                        {s.requiresLab ? (
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded text-xs font-semibold">
                            Wajib Lab / Praktik
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">Ruang Kelas Reguler</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        <button
                          onClick={() => setSubjectForm(s)}
                          className="text-blue-600 hover:underline text-xs font-semibold"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteEntity("subject", s.id)}
                          className="text-red-600 hover:underline text-xs font-semibold"
                        >
                          Hapus
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 4: DATA RUANGAN & KELAS ==================== */}
      {activeTab === "rooms_classes" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Kolom Kiri: Data Ruangan */}
          <div className="space-y-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900">1. Kelola Data Ruangan ({rooms.length})</h3>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => triggerImportFile("room")}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold"
                  >
                    <Upload className="w-3.5 h-3.5" /> Import CSV
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      downloadCsvFile(
                        "Template_Import_Ruangan.csv",
                        ["Kode_Ruangan", "Nama_Ruangan", "Tipe", "Kapasitas"],
                        [
                          ["R-101", "Ruang Teori X-1", "TEORI", 36],
                          ["LAB-KOM", "Laboratorium Komputer", "LAB", 40],
                        ]
                      )
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold"
                  >
                    <Download className="w-3.5 h-3.5" /> Template
                  </button>
                </div>
              </div>

              <form onSubmit={handleSaveRoom} className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-sm">
                <input
                  type="text"
                  required
                  placeholder="Kode (R-101)"
                  value={roomForm.code}
                  onChange={(e) => setRoomForm({ ...roomForm, code: e.target.value })}
                  className="px-3 py-2 border border-slate-300 rounded-lg"
                />
                <input
                  type="text"
                  required
                  placeholder="Nama Ruangan"
                  value={roomForm.name}
                  onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })}
                  className="px-3 py-2 border border-slate-300 rounded-lg"
                />
                <select
                  value={roomForm.type}
                  onChange={(e) => setRoomForm({ ...roomForm, type: e.target.value })}
                  className="px-3 py-2 border border-slate-300 rounded-lg"
                >
                  <option value="TEORI">TEORI</option>
                  <option value="LAB">LAB</option>
                  <option value="OLAHRAGA">OLAHRAGA</option>
                  <option value="AULA">AULA</option>
                </select>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-3 rounded-lg"
                >
                  {roomForm.id ? "Update" : "+ Simpan Ruang"}
                </button>
              </form>

              <div className="overflow-x-auto border-t border-slate-100 pt-2">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 border-b">
                      <th className="py-2">Kode</th>
                      <th className="py-2">Nama Ruangan</th>
                      <th className="py-2">Tipe</th>
                      <th className="py-2 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rooms.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2.5 font-bold text-slate-800">{r.code}</td>
                        <td className="py-2.5">{r.name}</td>
                        <td className="py-2.5">
                          <span className="px-2 py-0.5 bg-slate-100 rounded text-xs font-semibold">
                            {r.type}
                          </span>
                        </td>
                        <td className="py-2.5 text-right space-x-2">
                          <button
                            onClick={() => setRoomForm(r)}
                            className="text-blue-600 text-xs font-semibold"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteEntity("room", r.id)}
                            className="text-red-600 text-xs font-semibold"
                          >
                            Hapus
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Kolom Kanan: Data Kelas / Rombel */}
          <div className="space-y-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900">
                  2. Kelola Data Kelas / Rombel ({classes.length})
                </h3>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => triggerImportFile("class")}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold"
                  >
                    <Upload className="w-3.5 h-3.5" /> Import CSV
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      downloadCsvFile(
                        "Template_Import_Kelas.csv",
                        ["Kode_Kelas", "Nama_Kelas", "Tingkat", "Kode_Ruangan_Default"],
                        [
                          ["X-1", "Kelas X Merdeka 1", "X", "R-101"],
                          ["X-2", "Kelas X Merdeka 2", "X", "R-102"],
                        ]
                      )
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold"
                  >
                    <Download className="w-3.5 h-3.5" /> Template
                  </button>
                </div>
              </div>

              <form onSubmit={handleSaveClass} className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-sm">
                <input
                  type="text"
                  required
                  placeholder="Kode (X-1)"
                  value={classForm.code}
                  onChange={(e) => setClassForm({ ...classForm, code: e.target.value })}
                  className="px-3 py-2 border border-slate-300 rounded-lg"
                />
                <input
                  type="text"
                  required
                  placeholder="Nama Rombel"
                  value={classForm.name}
                  onChange={(e) => setClassForm({ ...classForm, name: e.target.value })}
                  className="px-3 py-2 border border-slate-300 rounded-lg"
                />
                <select
                  value={classForm.defaultRoomId}
                  onChange={(e) => setClassForm({ ...classForm, defaultRoomId: e.target.value })}
                  className="px-3 py-2 border border-slate-300 rounded-lg"
                >
                  <option value="">-- Ruang Default --</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.code} - {r.name}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-3 rounded-lg"
                >
                  {classForm.id ? "Update" : "+ Simpan Kelas"}
                </button>
              </form>

              <div className="overflow-x-auto border-t border-slate-100 pt-2">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 border-b">
                      <th className="py-2">Kode</th>
                      <th className="py-2">Nama Kelas / Rombel</th>
                      <th className="py-2">Ruangan Default</th>
                      <th className="py-2 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {classes.map((c) => (
                      <tr key={c.id}>
                        <td className="py-2.5 font-bold text-blue-700">{c.code}</td>
                        <td className="py-2.5 font-medium">{c.name}</td>
                        <td className="py-2.5 text-xs text-slate-600">
                          {c.defaultRoom ? `${c.defaultRoom.name} (${c.defaultRoom.code})` : "—"}
                        </td>
                        <td className="py-2.5 text-right space-x-2">
                          <button
                            onClick={() =>
                              setClassForm({
                                id: c.id,
                                code: c.code,
                                name: c.name,
                                grade: c.grade,
                                defaultRoomId: c.defaultRoomId || "",
                              })
                            }
                            className="text-blue-600 text-xs font-semibold"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteEntity("class", c.id)}
                            className="text-red-600 text-xs font-semibold"
                          >
                            Hapus
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 5: HARI KEAKTIFAN & JAM SEKOLAH ==================== */}
      {activeTab === "days" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Panel Kiri: Daftar Hari Aktif Sekolah */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 h-fit">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Hari Keaktifan Sekolah</h3>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => triggerImportFile("activeDay")}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold"
                >
                  <Upload className="w-3.5 h-3.5" /> Import CSV
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadCsvFile(
                      "Template_Import_Hari_Dan_Jam_Aktif.csv",
                      ["Hari", "Status_Hari", "Urutan_Slot", "Label_Jam", "Jam_Mulai", "Jam_Selesai", "Istirahat"],
                      [
                        ["Senin", "Aktif", 1, "Jam Ke-1", "07:00", "07:45", "Tidak"],
                        ["Senin", "Aktif", 2, "Jam Ke-2", "07:45", "08:30", "Tidak"],
                        ["Senin", "Aktif", 3, "Istirahat 1", "08:30", "08:45", "Ya"],
                        ["Sabtu", "Libur", 1, "Jam Ke-1", "07:00", "07:45", "Tidak"],
                      ]
                    )
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold"
                >
                  <Download className="w-3.5 h-3.5" /> Template
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-500">
              Aktifkan atau nonaktifkan hari KBM sekolah (misal 5 hari kerja Senin–Jumat atau 6 hari kerja Senin–Sabtu).
            </p>

            <div className="space-y-2">
              {activeDays.map((day) => (
                <div
                  key={day.id}
                  onClick={() => setSelectedDayForSlot(day.id)}
                  className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                    selectedDayObjForSlots?.id === day.id
                      ? "border-blue-600 bg-blue-50/50"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <div>
                    <div className="font-bold text-slate-900 text-sm">{day.dayName}</div>
                    <div className="text-xs text-slate-500">
                      {(day.timeSlots || []).filter((ts: any) => !ts.isBreak).length} Jam Pelajaran •{" "}
                      {(day.timeSlots || []).filter((ts: any) => ts.isBreak).length} Istirahat
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      await fetch("/api/master", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          entity: "activeDay",
                          action: "toggle",
                          data: { id: day.id, isActive: !day.isActive },
                        }),
                      });
                      await loadAllData();
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-bold ${
                      day.isActive
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {day.isActive ? "Aktif KBM" : "Libur / Non-Aktif"}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Panel Kanan: Slot Jam Pelajaran pada Hari Terpilih */}
          <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            {selectedDayObjForSlots && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">
                      Pengaturan Slot Jam Pelajaran — Hari {selectedDayObjForSlots.dayName}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Slot yang ditandai sebagai Istirahat/Upacara otomatis dikecualikan dari pengisian mata pelajaran.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await fetch("/api/master", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          entity: "activeDay",
                          action: "reset_day_slots",
                          data: { activeDayId: selectedDayObjForSlots.id },
                        }),
                      });
                      showMessage("info", `Slot jam hari ${selectedDayObjForSlots.dayName} direset.`);
                      await loadAllData();
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Reset ke Jam Standar</span>
                  </button>
                </div>

                {/* Form Tambah / Update Slot Jam */}
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await fetch("/api/master", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        entity: "activeDay",
                        action: slotForm.id ? "update_slot" : "create_slot",
                        data: {
                          ...slotForm,
                          activeDayId: selectedDayObjForSlots.id,
                        },
                      }),
                    });
                    setSlotForm({
                      periodNumber: (selectedDayObjForSlots.timeSlots?.length || 0) + 1,
                      label: `Jam Ke-${(selectedDayObjForSlots.timeSlots?.length || 0) + 1}`,
                      startTime: "14:00",
                      endTime: "14:45",
                      isBreak: false,
                    });
                    await loadAllData();
                  }}
                  className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 text-sm items-end bg-slate-50 p-3.5 rounded-xl border border-slate-200"
                >
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Urutan
                    </label>
                    <input
                      type="number"
                      required
                      value={slotForm.periodNumber}
                      onChange={(e) =>
                        setSlotForm({ ...slotForm, periodNumber: Number(e.target.value) })
                      }
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Label Slot
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Jam Ke-1 / Istirahat"
                      value={slotForm.label}
                      onChange={(e) => setSlotForm({ ...slotForm, label: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Mulai
                    </label>
                    <input
                      type="time"
                      required
                      value={slotForm.startTime}
                      onChange={(e) => setSlotForm({ ...slotForm, startTime: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Selesai
                    </label>
                    <input
                      type="time"
                      required
                      value={slotForm.endTime}
                      onChange={(e) => setSlotForm({ ...slotForm, endTime: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={slotForm.isBreak}
                        onChange={(e) =>
                          setSlotForm({ ...slotForm, isBreak: e.target.checked })
                        }
                      />
                      <span>Istirahat</span>
                    </label>
                    <button
                      type="submit"
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 px-3 rounded-lg"
                    >
                      {slotForm.id ? "Update" : "+ Tambah"}
                    </button>
                  </div>
                </form>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs text-slate-500">
                        <th className="py-2.5 px-3">Urutan</th>
                        <th className="py-2.5 px-3">Label</th>
                        <th className="py-2.5 px-3">Waktu</th>
                        <th className="py-2.5 px-3">Jenis</th>
                        <th className="py-2.5 px-3 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(selectedDayObjForSlots.timeSlots || []).map((ts: any) => (
                        <tr
                          key={ts.id}
                          className={ts.isBreak ? "bg-amber-50/70" : "hover:bg-slate-50"}
                        >
                          <td className="py-2.5 px-3 font-bold">{ts.periodNumber}</td>
                          <td className="py-2.5 px-3 font-semibold text-slate-800">{ts.label}</td>
                          <td className="py-2.5 px-3 text-slate-600">
                            {ts.startTime} - {ts.endTime}
                          </td>
                          <td className="py-2.5 px-3">
                            {ts.isBreak ? (
                              <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded text-xs font-semibold">
                                Istirahat / Non-KBM
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-semibold">
                                Jam Pelajaran (KBM)
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right space-x-2">
                            <button
                              onClick={() => setSlotForm(ts)}
                              className="text-blue-600 text-xs font-semibold"
                            >
                              Edit
                            </button>
                            <button
                              onClick={async () => {
                                await fetch("/api/master", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    entity: "activeDay",
                                    action: "delete_slot",
                                    data: { id: ts.id },
                                  }),
                                });
                                await loadAllData();
                              }}
                              className="text-red-600 text-xs font-semibold"
                            >
                              Hapus
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ==================== TAB 6: BEBAN MENGAJAR (ALOKASI JP) ==================== */}
      {activeTab === "assignments" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm h-fit space-y-4">
            <h3 className="font-bold text-slate-900 text-base">
              Tambah Alokasi Beban Mengajar (JP)
            </h3>
            <p className="text-xs text-slate-500">
              Data beban mengajar digunakan oleh mesin <strong>Auto-Generate Jadwal</strong> untuk membagi jam pelajaran setiap guru di setiap kelas secara otomatis tanpa bentrok.
            </p>

            <form onSubmit={handleSaveAssignment} className="space-y-3 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kelas / Rombel *
                </label>
                <SearchableSelect
                  options={classes.map((c) => ({
                    value: c.id,
                    label: c.name,
                    badge: c.grade,
                    subLabel: c.code,
                  }))}
                  value={assignmentForm.classGroupId}
                  onChange={(val) =>
                    setAssignmentForm({ ...assignmentForm, classGroupId: val })
                  }
                  placeholder="-- Pilih Kelas --"
                  searchPlaceholder="Cari nama atau kode kelas..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mata Pelajaran *
                </label>
                <SearchableSelect
                  options={subjects.map((s) => ({
                    value: s.id,
                    label: s.name,
                    badge: s.code,
                    subLabel: s.category === "KEJURUAN" ? "Kejuruan" : "Umum",
                  }))}
                  value={assignmentForm.subjectId}
                  onChange={(val) =>
                    setAssignmentForm({ ...assignmentForm, subjectId: val })
                  }
                  placeholder="-- Pilih Mata Pelajaran --"
                  searchPlaceholder="Cari nama atau kode mapel..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Guru Pengajar (Opsional / TBD)
                </label>
                <SearchableSelect
                  options={teachers.map((t) => ({
                    value: t.id,
                    label: t.name,
                    badge: t.code,
                  }))}
                  value={assignmentForm.teacherId}
                  onChange={(val) =>
                    setAssignmentForm({ ...assignmentForm, teacherId: val })
                  }
                  placeholder="-- Belum Ditentukan (TBD) --"
                  searchPlaceholder="Ketik nama atau kode guru..."
                  allowClear
                />
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Boleh dikosongkan terlebih dahulu, guru dapat dipilih kapan saja nanti.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Keterangan / Tim Teaching (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Guru 1 (Teori), Guru 2 (Praktik)"
                  value={assignmentForm.notes}
                  onChange={(e) =>
                    setAssignmentForm({ ...assignmentForm, notes: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Total JP / Minggu
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={assignmentForm.totalPeriods}
                    onChange={(e) =>
                      setAssignmentForm({
                        ...assignmentForm,
                        totalPeriods: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Maks JP / Hari
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={6}
                    value={assignmentForm.maxPerDay}
                    onChange={(e) =>
                      setAssignmentForm({
                        ...assignmentForm,
                        maxPerDay: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ruangan Khusus (Opsional)
                </label>
                <SearchableSelect
                  options={rooms.map((r) => ({
                    value: r.id,
                    label: r.name,
                    badge: r.type,
                    subLabel: `${r.code} • Kapasitas ${r.capacity}`,
                  }))}
                  value={assignmentForm.preferredRoomId}
                  onChange={(val) =>
                    setAssignmentForm({ ...assignmentForm, preferredRoomId: val })
                  }
                  placeholder="-- Ikuti Ruang Default Kelas --"
                  searchPlaceholder="Cari nama atau tipe ruangan..."
                  allowClear
                />
              </div>

              <button
                type="submit"
                disabled={busyAction}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg"
              >
                Simpan Alokasi Beban Mengajar
              </button>
            </form>

            <div className="pt-4 border-t border-slate-200 space-y-2">
              <div className="text-xs font-bold text-slate-700 uppercase">
                Import CSV / Excel Beban Mengajar
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => triggerImportFile("assignment")}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Import CSV Beban</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadCsvFile(
                      "Template_Import_Beban_Mengajar.csv",
                      ["Kode_Guru", "Kode_Mapel", "Kode_Kelas", "Jumlah_JP", "Maks_JP_Per_Hari", "Kode_Ruangan"],
                      [
                        ["GR-01", "MAT", "X-1", 4, 2, "R-101"],
                        ["GR-03", "INF", "X-1", 2, 2, "LAB-KOM"],
                      ]
                    )
                  }
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh Template</span>
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <span>Beban Mengajar:</span>
                  {selectedClassObj ? (
                    <span className="text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-lg border border-blue-200 text-sm">
                      {selectedClassObj.name} ({selectedClassObj.code})
                    </span>
                  ) : (
                    <span className="text-slate-500 text-sm">Pilih Kelas</span>
                  )}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Menampilkan {filteredAssignments.length} mata pelajaran ({selectedClassTotalJP} JP) khusus rombel ini untuk menghemat memori & performa.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {assignments.length > 0 && (
                  <button
                    onClick={handleClearAllAssignments}
                    disabled={busyAction}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold transition-colors"
                    title="Kosongkan seluruh alokasi beban mengajar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Kosongkan Semua</span>
                  </button>
                )}
                <button
                  onClick={handleAutoGenerate}
                  disabled={busyAction}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Susun Otomatis Sekarang</span>
                </button>
              </div>
            </div>

            {/* Filter & Pemilihan Kelas */}
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap gap-2.5 items-center text-xs">
              <div className="flex items-center gap-1.5 min-w-[250px]">
                <span className="font-semibold text-slate-700 shrink-0">Pilih Kelas:</span>
                <div className="flex-1">
                  <SearchableSelect
                    options={classes.map((c) => ({
                      value: c.id,
                      label: c.name,
                      badge: c.grade,
                      subLabel: c.code,
                    }))}
                    value={assignmentFilterClass}
                    onChange={(val) => {
                      setAssignmentFilterClass(val);
                      setAssignmentForm((prev) => ({ ...prev, classGroupId: val }));
                    }}
                    placeholder="-- Pilih Kelas --"
                    searchPlaceholder="Cari rombel..."
                  />
                </div>
              </div>

              {/* Navigasi Cepat Prev / Next Kelas */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  title="Kelas Sebelumnya"
                  disabled={classes.findIndex((c) => c.id === assignmentFilterClass) <= 0}
                  onClick={() => {
                    const idx = classes.findIndex((c) => c.id === assignmentFilterClass);
                    if (idx > 0) {
                      const prevId = classes[idx - 1].id;
                      setAssignmentFilterClass(prevId);
                      setAssignmentForm((prev) => ({ ...prev, classGroupId: prevId }));
                    }
                  }}
                  className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 font-semibold transition-colors"
                >
                  &larr; Prev
                </button>
                <button
                  type="button"
                  title="Kelas Berikutnya"
                  disabled={classes.findIndex((c) => c.id === assignmentFilterClass) >= classes.length - 1}
                  onClick={() => {
                    const idx = classes.findIndex((c) => c.id === assignmentFilterClass);
                    if (idx >= 0 && idx < classes.length - 1) {
                      const nextId = classes[idx + 1].id;
                      setAssignmentFilterClass(nextId);
                      setAssignmentForm((prev) => ({ ...prev, classGroupId: nextId }));
                    }
                  }}
                  className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 font-semibold transition-colors"
                >
                  Next &rarr;
                </button>
              </div>

              <div className="flex items-center gap-1.5 ml-auto">
                <span className="font-semibold text-slate-600">Status Guru:</span>
                <select
                  value={assignmentFilterTeacherStatus}
                  onChange={(e) => setAssignmentFilterTeacherStatus(e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                >
                  <option value="ALL">Semua Guru</option>
                  <option value="ASSIGNED">Sudah Ada Guru</option>
                  <option value="UNASSIGNED">Belum Ada Guru (TBD)</option>
                </select>
              </div>

              <div className="w-48">
                <input
                  type="text"
                  placeholder="Cari mapel / guru..."
                  value={assignmentSearch}
                  onChange={(e) => setAssignmentSearch(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                />
              </div>

              {(assignmentFilterTeacherStatus !== "ALL" || assignmentSearch) && (
                <button
                  type="button"
                  onClick={() => {
                    setAssignmentFilterTeacherStatus("ALL");
                    setAssignmentSearch("");
                  }}
                  className="text-xs text-blue-600 hover:underline font-semibold"
                >
                  Reset Filter
                </button>
              )}
            </div>

            <div className="overflow-x-auto flex-1 min-h-[360px] pb-24">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs">
                    <th className="py-3 px-4 font-semibold">Kelas</th>
                    <th className="py-3 px-4 font-semibold">Mata Pelajaran</th>
                    <th className="py-3 px-4 font-semibold min-w-[240px]">Guru Pengajar (Ketik / Pilih Langsung)</th>
                    <th className="py-3 px-4 font-semibold">Keterangan</th>
                    <th className="py-3 px-4 font-semibold">Terjadwal</th>
                    <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredAssignments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-slate-400 text-xs">
                        {assignmentFilterClass
                          ? `Belum ada alokasi beban mengajar untuk ${selectedClassObj?.name || "kelas ini"}. Tambahkan mapel di formulir sebelah kiri atau terapkan standar dari Struktur Kurikulum.`
                          : "Silakan pilih salah satu kelas di atas untuk melihat beban mengajar."}
                      </td>
                    </tr>
                  ) : (
                    filteredAssignments.map((a) => {
                      const assignKey = `${a.classGroupId}_${a.subjectId}_${a.teacherId || ""}`;
                      const scheduledCount = assignmentScheduledCountMap.get(assignKey) || 0;
                      const complete = scheduledCount >= a.totalPeriods;

                      return (
                        <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2.5 px-4 font-bold text-blue-700 whitespace-nowrap">
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200 text-xs mr-1.5">
                              {a.classGroup?.grade}
                            </span>
                            {a.classGroup?.name}
                          </td>
                          <td className="py-2.5 px-4 font-medium text-slate-900">
                            <div>{a.subject?.name}</div>
                            <div className="text-[11px] text-slate-400 font-normal">
                              {a.subject?.code} • {a.subject?.category === "KEJURUAN" ? "Kejuruan" : "Umum"}
                            </div>
                          </td>
                          <td className="py-2 px-4 min-w-[240px] max-w-[280px]">
                            <SearchableSelect
                              value={a.teacherId || ""}
                              onChange={(val) => handleQuickAssignTeacher(a.id, val)}
                              options={teacherOptions}
                              placeholder="-- Belum Ada Guru (TBD) --"
                              clearLabel="-- Kosongkan / Belum Ada Guru (TBD) --"
                              searchPlaceholder="Ketik nama atau kode guru..."
                              allowClear={true}
                              size="sm"
                              buttonClassName={
                                a.teacherId
                                  ? "bg-white border-slate-300 text-slate-800 hover:border-slate-400 font-medium"
                                  : "bg-amber-50 border-amber-300 text-amber-850 hover:border-amber-400 font-medium"
                              }
                            />
                          </td>
                          <td className="py-2.5 px-4 text-xs text-slate-500 max-w-[150px] truncate" title={a.notes || ""}>
                            {a.notes || "-"}
                          </td>
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                complete
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {scheduledCount} / {a.totalPeriods} JP
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right whitespace-nowrap">
                            <button
                              onClick={() => handleDeleteEntity("assignment", a.id)}
                              className="text-red-600 hover:text-red-800 text-xs font-semibold hover:underline"
                            >
                              Hapus
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 4: TUGAS TAMBAHAN GURU ==================== */}
      {activeTab === "additional_duties" && (
        <div className="space-y-6">
          {/* Header Card & Tombol Aksi */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-2 bg-amber-100 text-amber-800 rounded-xl">
                  <Briefcase className="w-5 h-5" />
                </span>
                <h3 className="font-bold text-slate-900 text-lg">
                  Tugas Tambahan Guru & Ekuivalensi Jam (JP)
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
                Input dan kelola tugas tambahan guru (Wakasek, Wali Kelas, Kepala Bengkel/Lab, Pembina OSIS, dll.).
                Ekuivalensi JP tugas tambahan otomatis diakumulasikan ke beban kerja mingguan guru.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadDutyTemplate}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all shadow-sm"
              >
                <Download className="w-4 h-4 text-slate-600" />
                <span>Unduh Template CSV</span>
              </button>
              <button
                type="button"
                onClick={() => triggerImportFile("additional_duty")}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-all shadow-sm shadow-emerald-600/20"
              >
                <Upload className="w-4 h-4" />
                <span>Import CSV Tugas Tambahan</span>
              </button>
              {additionalDuties.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllDuties}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl text-xs font-semibold transition-all border border-red-200"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Kosongkan</span>
                </button>
              )}
            </div>
          </div>

          {/* Statistik Ringkasan Tugas Tambahan (Permendikdasmen No. 11/2025) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 font-medium">Total Tugas Tambahan</div>
              <div className="text-2xl font-black text-slate-900 mt-1">
                {additionalDuties.length}{" "}
                <span className="text-xs font-normal text-slate-400">Posisi</span>
              </div>
            </div>
            <div className="p-4 bg-white rounded-2xl border border-blue-200 bg-blue-50/20 shadow-sm">
              <div className="text-xs text-blue-700 font-semibold flex items-center gap-1">
                <span>🔵 Tugas Utama (TTU)</span>
              </div>
              <div className="text-2xl font-black text-blue-800 mt-1">
                {additionalDuties.filter((d) => d.category === "TTU" || d.equivalentHours === 12).length}{" "}
                <span className="text-xs font-normal text-blue-600">Posisi (12 JP)</span>
              </div>
            </div>
            <div className="p-4 bg-white rounded-2xl border border-emerald-200 bg-emerald-50/20 shadow-sm">
              <div className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                <span>🟢 Tugas Lain (TTLE)</span>
              </div>
              <div className="text-2xl font-black text-emerald-800 mt-1">
                {additionalDuties.filter((d) => d.category !== "TTU" && d.equivalentHours !== 12).length}{" "}
                <span className="text-xs font-normal text-emerald-600">Posisi (Maks 6 JP)</span>
              </div>
            </div>
            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 font-medium">Guru Lolos Syarat TPG</div>
              <div className="text-2xl font-black text-emerald-600 mt-1">
                {Array.from(teacherWorkloadAuditMap.values()).filter((a) => a.isValidTPG).length}{" "}
                <span className="text-xs font-normal text-slate-400">/ {teachers.length} Guru</span>
              </div>
            </div>
          </div>

          {/* Grid: Formulir Kiri + Tabel Kanan */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Formulir Input / Edit */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm h-fit space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-amber-600" />
                  <span>{dutyForm.id ? "Edit Tugas Tambahan" : "Tambah Tugas Tambahan"}</span>
                </h4>
                {dutyForm.id && (
                  <span className="text-[11px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-semibold">
                    Mode Edit
                  </span>
                )}
              </div>

              <form onSubmit={handleSaveDuty} className="space-y-4 text-xs">
                {/* Pilihan Kategori: TTU vs TTLE sesuai Permendikdasmen 11/2025 */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
                    <span>Kategori Tugas (Permendikdasmen 11/2025) *</span>
                    <span className="text-[10px] text-slate-400 font-normal">Standar Resmi</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() =>
                        setDutyForm({
                          ...dutyForm,
                          category: "TTU",
                          equivalentHours: 12,
                        })
                      }
                      className={`py-2 px-2.5 rounded-lg text-xs font-bold transition-all text-center ${
                        dutyForm.category === "TTU"
                          ? "bg-blue-600 text-white shadow-sm"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      🔵 TTU (Utama - 12 JP)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDutyForm({
                          ...dutyForm,
                          category: "TTLE",
                          equivalentHours: dutyForm.equivalentHours === 12 ? 2 : dutyForm.equivalentHours || 2,
                        })
                      }
                      className={`py-2 px-2.5 rounded-lg text-xs font-bold transition-all text-center ${
                        dutyForm.category === "TTLE"
                          ? "bg-emerald-600 text-white shadow-sm"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      🟢 TTLE (Lain - Maks 6 JP)
                    </button>
                  </div>
                </div>

                {/* Preset Cepat Berdasarkan Kategori */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    ⚡ Preset Pilihan Cepat ({dutyForm.category === "TTU" ? "Tugas Utama" : "Tugas Lain Ekuivalen"}):
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {dutyForm.category === "TTU" ? (
                      [
                        { label: "Wakil Kepala Sekolah", jp: 12 },
                        { label: "Ketua Program Keahlian (Kakomli)", jp: 12 },
                        { label: "Kepala Bengkel SMK", jp: 12 },
                        { label: "Kepala Unit Produksi / TeFa", jp: 12 },
                        { label: "Kepala Laboratorium", jp: 12 },
                        { label: "Kepala Perpustakaan", jp: 12 },
                      ].map((preset, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() =>
                            setDutyForm({
                              ...dutyForm,
                              name: preset.label,
                              equivalentHours: preset.jp,
                            })
                          }
                          className={`text-[10px] px-2 py-1 rounded-md border transition-all text-left ${
                            dutyForm.name === preset.label
                              ? "bg-blue-100 text-blue-900 border-blue-300 font-bold"
                              : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-blue-50 hover:text-blue-700"
                          }`}
                        >
                          {preset.label} (12 JP)
                        </button>
                      ))
                    ) : (
                      [
                        { label: "Wali Kelas", jp: 2 },
                        { label: "Pembina OSIS", jp: 2 },
                        { label: "Koordinator P5", jp: 2 },
                        { label: "Pembina Ekstrakurikuler", jp: 2 },
                        { label: "Koordinator TPPK", jp: 2 },
                        { label: "Anggota TPPK", jp: 1 },
                        { label: "Ketua BKK / LSP SMK", jp: 2 },
                        { label: "Guru Piket", jp: 1 },
                        { label: "Kepanitiaan Sekolah", jp: 1 },
                      ].map((preset, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() =>
                            setDutyForm({
                              ...dutyForm,
                              name: preset.label,
                              equivalentHours: preset.jp,
                            })
                          }
                          className={`text-[10px] px-2 py-1 rounded-md border transition-all text-left ${
                            dutyForm.name === preset.label
                              ? "bg-emerald-100 text-emerald-900 border-emerald-300 font-bold"
                              : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-emerald-50 hover:text-emerald-700"
                          }`}
                        >
                          {preset.label} ({preset.jp} JP)
                        </button>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nama Tugas Tambahan *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={
                      dutyForm.category === "TTU"
                        ? "cth: Wakil Kepala Sekolah Bidang Kurikulum"
                        : "cth: Wali Kelas X DKV A"
                    }
                    value={dutyForm.name}
                    onChange={(e) => setDutyForm({ ...dutyForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1 flex items-center justify-between">
                    <span>Ekuivalensi Jam (JP) *</span>
                    {dutyForm.category === "TTU" && (
                      <span className="text-[10px] font-bold text-blue-700">Terkunci 12 JP (Standar TTU)</span>
                    )}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={dutyForm.category === "TTU" ? 12 : 6}
                    required
                    disabled={dutyForm.category === "TTU"}
                    value={dutyForm.category === "TTU" ? 12 : dutyForm.equivalentHours}
                    onChange={(e) =>
                      setDutyForm({
                        ...dutyForm,
                        equivalentHours: Number(e.target.value) || 2,
                      })
                    }
                    className={`w-full px-3 py-2 border rounded-lg text-xs font-bold text-slate-800 ${
                      dutyForm.category === "TTU"
                        ? "bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed"
                        : "border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 bg-white"
                    }`}
                  />
                </div>

                {/* Info Regulasi Permendikdasmen No. 11 Tahun 2025 */}
                <div
                  className={`p-2.5 rounded-xl border text-[11px] leading-relaxed ${
                    dutyForm.category === "TTU"
                      ? "bg-blue-50/70 border-blue-200 text-blue-900"
                      : "bg-emerald-50/70 border-emerald-200 text-emerald-900"
                  }`}
                >
                  {dutyForm.category === "TTU" ? (
                    <div>
                      <strong>📌 Regulasi TTU (Permendikdasmen 11/2025):</strong>
                      <p className="mt-0.5 text-[10px]">
                        Diakui <strong>12 JP</strong> untuk ekuivalensi TPG. Guru wajib mengajar tatap muka minimal <strong>12 JP</strong> agar valid 24 JP TPG.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <strong>📌 Regulasi TTLE (Permendikdasmen 11/2025):</strong>
                      <p className="mt-0.5 text-[10px]">
                        Ekuivalensi TTLE diakui <strong>maksimal 6 JP</strong> untuk TPG. Guru wajib mengajar tatap muka minimal <strong>18 JP</strong>.
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Guru Pengampu
                  </label>
                  <SearchableSelect
                    options={[
                      { value: "", label: "-- Belum Ditugaskan / TBD --" },
                      ...teachers.map((t) => {
                        const audit = teacherWorkloadAuditMap.get(t.id);
                        const teaching = audit?.teachingHours || 0;
                        const dutyH = audit?.realDutyHours || 0;
                        return {
                          value: t.id,
                          label: t.name,
                          badge: t.code,
                          subLabel: `Tatap Muka: ${teaching} JP • Tugas: ${dutyH} JP • ${audit?.isValidTPG ? "🟢 TPG OK" : "🔴 Kurang JP"}`,
                        };
                      }),
                    ]}
                    value={dutyForm.teacherId}
                    onChange={(val) => setDutyForm({ ...dutyForm, teacherId: val })}
                    placeholder="-- Pilih Guru Pengampu --"
                    searchPlaceholder="Cari nama atau kode guru..."
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Bisa dikosongkan jika belum ada SK penetapan guru.
                  </p>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nomor SK Penugasan
                  </label>
                  <input
                    type="text"
                    placeholder="cth: 800/123/SMK2/2026"
                    value={dutyForm.nomorSk}
                    onChange={(e) => setDutyForm({ ...dutyForm, nomorSk: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Keterangan / Catatan
                  </label>
                  <textarea
                    rows={2}
                    placeholder="cth: SK Kepala Sekolah Semester Ganjil 2026/2027"
                    value={dutyForm.notes}
                    onChange={(e) => setDutyForm({ ...dutyForm, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={busyAction}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg text-xs transition-colors shadow-sm shadow-blue-600/20"
                  >
                    {dutyForm.id ? "Simpan Perubahan" : "Tambah Tugas Tambahan"}
                  </button>
                  {dutyForm.id && (
                    <button
                      type="button"
                      onClick={() =>
                        setDutyForm({
                          category: "TTLE",
                          name: "",
                          equivalentHours: 2,
                          teacherId: "",
                          nomorSk: "",
                          notes: "",
                        })
                      }
                      className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                    >
                      Batal
                    </button>
                  )}
                </div>
              </form>
            </div>

            {/* Tabel Daftar Tugas Tambahan */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-slate-900 text-sm">
                    Daftar Tugas Tambahan Terdaftar ({filteredDuties.length})
                  </h4>
                </div>

                <div className="w-full sm:w-64">
                  <input
                    type="text"
                    placeholder="Cari tugas, SK, atau guru..."
                    value={dutySearch}
                    onChange={(e) => setDutySearch(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="overflow-x-auto flex-1 min-h-[360px]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <th className="py-3 px-4">Kategori & Tugas</th>
                      <th className="py-3 px-4 text-center">Ekuivalensi JP</th>
                      <th className="py-3 px-4">Guru Pengampu</th>
                      <th className="py-3 px-4">Audit TPG Guru</th>
                      <th className="py-3 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredDuties.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-12 text-slate-400">
                          {dutySearch
                            ? "Tidak ada tugas tambahan yang cocok dengan pencarian."
                            : "Belum ada data tugas tambahan guru. Silakan tambahkan melalui form sebelah kiri atau import dari file CSV."}
                        </td>
                      </tr>
                    ) : (
                      filteredDuties.map((duty: any) => {
                        const assignedTeacher = duty.teacher;
                        const isTTU = duty.category === "TTU" || Number(duty.equivalentHours) === 12;
                        const audit = assignedTeacher ? teacherWorkloadAuditMap.get(assignedTeacher.id) : null;
                        return (
                          <tr key={duty.id} className="hover:bg-slate-50 transition-colors">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5 mb-1">
                                {isTTU ? (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                                    🔵 TTU (12 JP)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    🟢 TTLE
                                  </span>
                                )}
                              </div>
                              <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                                <span>{duty.name}</span>
                              </div>
                              {duty.nomorSk ? (
                                <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                  SK: {duty.nomorSk}
                                </div>
                              ) : (
                                <div className="text-[10px] text-slate-400 italic mt-0.5">
                                  Belum ada nomor SK
                                </div>
                              )}
                              {duty.notes && (
                                <div className="text-[10px] text-slate-500 mt-0.5">
                                  Catatan: {duty.notes}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span
                                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border shadow-sm ${
                                  isTTU
                                    ? "bg-blue-100 text-blue-900 border-blue-300"
                                    : "bg-emerald-100 text-emerald-900 border-emerald-300"
                                }`}
                              >
                                +{duty.equivalentHours} JP
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              {assignedTeacher ? (
                                <div>
                                  <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                                    <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded font-mono text-[10px]">
                                      {assignedTeacher.code}
                                    </span>
                                    <span>{assignedTeacher.name}</span>
                                  </div>
                                  {assignedTeacher.nip && (
                                    <div className="text-[10px] text-slate-400 mt-0.5">
                                      NIP: {assignedTeacher.nip}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="inline-block px-2 py-0.5 rounded text-[11px] bg-slate-100 text-slate-500 border border-slate-200 font-medium">
                                  Belum Ada Guru (TBD)
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              {audit ? (
                                <div className="space-y-1">
                                  {audit.isValidTPG ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                      🟢 Valid TPG ({audit.totalRecognizedWorkload} JP)
                                    </span>
                                  ) : !audit.isMinTeachingMet ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                      🟡 Kurang Tatap Muka ({audit.teachingHours}/{audit.minTeachingRequired} JP)
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 border border-red-300">
                                      🔴 Kurang Jam ({audit.totalRecognizedWorkload}/24 JP)
                                    </span>
                                  )}
                                  <div className="text-[10px] text-slate-500">
                                    TM: {audit.teachingHours} JP | Tugas Diakui: +{audit.recognizedDutyHours} JP
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-400 text-[11px]">-</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setDutyForm({
                                    id: duty.id,
                                    category: (duty.category as "TTU" | "TTLE") || (duty.equivalentHours === 12 ? "TTU" : "TTLE"),
                                    name: duty.name,
                                    equivalentHours: duty.equivalentHours,
                                    teacherId: duty.teacherId || "",
                                    nomorSk: duty.nomorSk || "",
                                    notes: duty.notes || "",
                                  })
                                }
                                className="text-blue-600 hover:text-blue-800 text-xs font-semibold hover:underline"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteEntity("additional_duty", duty.id)}
                                className="text-red-600 hover:text-red-800 text-xs font-semibold hover:underline"
                              >
                                Hapus
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL TAMBAH / EDIT JADWAL DENGAN VALIDASI REAL-TIME ==================== */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-visible">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between rounded-t-2xl">
              <div>
                <h3 className="font-bold text-lg">
                  {scheduleForm.id ? "Edit / Pindahkan Slot Jadwal" : "Tambah Jadwal Mengajar"}
                </h3>
                <p className="text-xs text-slate-400">
                  Sistem mengecek bentrok Guru, Kelas, Ruangan & Hari Aktif Guru secara otomatis.
                </p>
              </div>
              <button
                onClick={() => setShowScheduleModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSchedule} className="p-6 space-y-4 text-sm">
              {/* Pilihan Hari & Rentang Jam Pelajaran */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Hari Mengajar *
                  </label>
                  <select
                    required
                    value={scheduleForm.activeDayId}
                    onChange={(e) => {
                      const newDay = activeDays.find((d) => d.id === e.target.value);
                      const firstTeachSlot =
                        newDay?.timeSlots?.find((ts: any) => !ts.isBreak) ||
                        newDay?.timeSlots?.[0];
                      setScheduleForm({
                        ...scheduleForm,
                        activeDayId: e.target.value,
                        timeSlotId: firstTeachSlot?.id || "",
                        endSlotId: firstTeachSlot?.id || "",
                      });
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-semibold text-slate-800 bg-white"
                  >
                    {activeDays.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.dayName} {!d.isActive ? "(Non-Aktif / Libur)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {!scheduleForm.id ? (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-blue-900 mb-1 flex items-center gap-1">
                          <span>🕒 Dari Jam Ke- *</span>
                        </label>
                        <select
                          required
                          value={scheduleForm.timeSlotId}
                          onChange={(e) => {
                            const val = e.target.value;
                            setScheduleForm({
                              ...scheduleForm,
                              timeSlotId: val,
                              endSlotId: scheduleForm.endSlotId || val,
                            });
                          }}
                          className="w-full px-3 py-2 border-2 border-blue-300 focus:border-blue-500 rounded-lg font-semibold text-slate-800 bg-white"
                        >
                          {(
                            activeDays.find((d) => d.id === scheduleForm.activeDayId)?.timeSlots || []
                          ).map((ts: any) => (
                            <option key={ts.id} value={ts.id}>
                              {ts.label} ({ts.startTime}–{ts.endTime}) {ts.isBreak ? "[ISTIRAHAT]" : ""}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-blue-900 mb-1 flex items-center gap-1">
                          <span>🕒 Sampai Jam Ke- *</span>
                        </label>
                        <select
                          required
                          value={scheduleForm.endSlotId || scheduleForm.timeSlotId}
                          onChange={(e) =>
                            setScheduleForm({ ...scheduleForm, endSlotId: e.target.value })
                          }
                          className="w-full px-3 py-2 border-2 border-blue-300 focus:border-blue-500 rounded-lg font-semibold text-slate-800 bg-white"
                        >
                          {(
                            activeDays.find((d) => d.id === scheduleForm.activeDayId)?.timeSlots || []
                          ).map((ts: any) => (
                            <option key={ts.id} value={ts.id}>
                              {ts.label} ({ts.startTime}–{ts.endTime}) {ts.isBreak ? "[ISTIRAHAT]" : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Ringkasan Durasi & Slot Efektif */}
                    <div className="p-3 bg-blue-100/70 border border-blue-300 rounded-xl space-y-1">
                      <div className="flex items-center justify-between text-xs font-bold text-blue-950">
                        <span>Total Jam Efektif: {effectiveRangeSlots.length} JP</span>
                        <span className="text-[11px] bg-blue-600 text-white px-2 py-0.5 rounded-md">
                          {effectiveRangeSlots.length > 0
                            ? `${effectiveRangeSlots[0]?.label} s/d ${effectiveRangeSlots[effectiveRangeSlots.length - 1]?.label}`
                            : "Belum Ada Slot"}
                        </span>
                      </div>
                      <div className="text-[11px] text-blue-800">
                        Slot yang akan dibuat:{" "}
                        <span className="font-semibold">
                          {effectiveRangeSlots.map((s: any) => s.label).join(", ") || "-"}
                        </span>
                      </div>
                      {breakRangeSlots.length > 0 && (
                        <div className="mt-1 text-[11px] text-amber-900 bg-amber-100 px-2 py-1 rounded-md border border-amber-300 font-medium">
                          ☕ Waktu istirahat (<strong>{breakRangeSlots.map((b: any) => b.label).join(", ")}</strong>) otomatis dilewati dan tidak dibuatkan jadwal.
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Slot Jam Pelajaran *
                    </label>
                    <select
                      required
                      value={scheduleForm.timeSlotId}
                      onChange={(e) =>
                        setScheduleForm({ ...scheduleForm, timeSlotId: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-semibold text-slate-800 bg-white"
                    >
                      {(
                        activeDays.find((d) => d.id === scheduleForm.activeDayId)?.timeSlots || []
                      ).map((ts: any) => (
                        <option key={ts.id} value={ts.id}>
                          {ts.label} ({ts.startTime}-{ts.endTime}) {ts.isBreak ? "[ISTIRAHAT]" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kelas / Rombel *
                  </label>
                  <SearchableSelect
                    options={modalAvailableClasses.map((c) => ({
                      value: c.id,
                      label: c.name,
                      badge: c.grade,
                      subLabel: c.code,
                    }))}
                    value={scheduleForm.classGroupId}
                    onChange={(val) => {
                      const cls = classes.find((c) => c.id === val);
                      const matched =
                        assignments.find((a) => a.classGroupId === val && a.teacherId) ||
                        assignments.find((a) => a.classGroupId === val);
                      setScheduleForm({
                        ...scheduleForm,
                        classGroupId: val,
                        subjectId: matched?.subjectId || "",
                        teacherId: matched?.teacherId || "",
                        roomId: matched?.preferredRoomId || cls?.defaultRoomId || scheduleForm.roomId,
                      });
                    }}
                    placeholder="-- Pilih Kelas --"
                    searchPlaceholder="Cari kelas / rombel..."
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Ruangan *
                  </label>
                  <SearchableSelect
                    options={rooms.map((r) => ({
                      value: r.id,
                      label: r.name,
                      badge: r.type,
                      subLabel: `${r.code} • Kapasitas ${r.capacity}`,
                    }))}
                    value={scheduleForm.roomId}
                    onChange={(val) =>
                      setScheduleForm({ ...scheduleForm, roomId: val })
                    }
                    placeholder="-- Pilih Ruangan --"
                    searchPlaceholder="Cari ruangan..."
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Mata Pelajaran (Dari Beban Mengajar) *
                  </label>
                  <SearchableSelect
                    options={modalAvailableSubjects.map((s: any) => ({
                      value: s.id,
                      label: s.name,
                      badge: `${s.code} • ${s.totalPeriods ?? 0} JP`,
                      subLabel: `Guru: ${s.assignedTeacherName || "TBD"} | Sisa: ${s.remaining ?? 0} JP`,
                    }))}
                    value={scheduleForm.subjectId}
                    onChange={(val) => {
                      const matchedSubject = modalAvailableSubjects.find((s: any) => s.id === val);
                      setScheduleForm({
                        ...scheduleForm,
                        subjectId: val,
                        teacherId: matchedSubject?.assignedTeacherId || scheduleForm.teacherId,
                        roomId: matchedSubject?.preferredRoomId || scheduleForm.roomId,
                      });
                    }}
                    placeholder="-- Pilih Mata Pelajaran --"
                    searchPlaceholder="Cari mapel di kelas ini..."
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Guru Pengajar (Sesuai Beban) *
                  </label>
                  <SearchableSelect
                    options={modalAvailableTeachers.map((t) => {
                      const days = parseJsonNumberArray(t.activeDays)
                        .map((d) => DAY_NAMES[d]?.slice(0, 3))
                        .join(", ");
                      return {
                        value: t.id,
                        label: t.name,
                        badge: t.code,
                        subLabel: `Aktif: ${days}`,
                      };
                    })}
                    value={scheduleForm.teacherId}
                    onChange={(val) =>
                      setScheduleForm({ ...scheduleForm, teacherId: val })
                    }
                    placeholder="-- Pilih Guru Pengajar --"
                    searchPlaceholder="Ketik nama atau kode guru..."
                    required
                  />
                </div>
              </div>

              {/* Status Sisa Kuota Beban Mengajar */}
              {selectedModalAssignment && (
                <div
                  className={`p-3.5 rounded-xl border text-xs transition-all ${
                    isQuotaExceeded
                      ? "bg-red-50/90 border-red-300 text-red-950"
                      : "bg-indigo-50/90 border-indigo-200 text-indigo-950"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-indigo-900">📌 Beban Mengajar:</span>
                      <span className="font-bold text-slate-900">
                        {selectedModalAssignment.subject?.name}
                      </span>
                      <span className="text-slate-500">
                        ({selectedModalAssignment.teacher?.name || "Belum Ada Guru (TBD)"})
                      </span>
                    </div>
                    <div className="flex items-center gap-2 font-semibold">
                      <span className="bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-md">
                        Beban: {selectedModalAssignment.totalPeriods} JP
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-md font-bold ${
                          isQuotaExceeded
                            ? "bg-red-600 text-white shadow-sm"
                            : modalRemainingQuota === 0
                            ? "bg-amber-100 text-amber-800"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        Sisa Kuota: {modalRemainingQuota} JP
                      </span>
                    </div>
                  </div>

                  {/* Keterangan Otomatisasi Guru dari Jadwal ke Beban Mengajar jika TBD */}
                  {!selectedModalAssignment.teacherId && scheduleForm.teacherId && (
                    <div className="mt-2 pt-2 border-t border-indigo-100 flex items-center gap-1.5 text-[11px] text-blue-700 font-medium bg-blue-50/70 p-2 rounded-lg">
                      <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>
                        Guru <strong>{teachers.find((t) => t.id === scheduleForm.teacherId)?.name}</strong> otomatis akan ditetapkan pada Beban Mengajar kelas ini setelah jadwal disimpan.
                      </span>
                    </div>
                  )}

                  {/* Peringatan Blokir Ketat jika Jam Efektif Melebihi Kuota Beban */}
                  {isQuotaExceeded && (
                    <div className="mt-2.5 pt-2.5 border-t border-red-200 text-xs text-red-700 font-medium flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-red-800">
                          Total jam efektif ({requestedPeriodsCount} JP) melebihi batas beban JP ({modalRemainingQuota} JP tersisa)!
                        </span>
                        <p className="mt-0.5 text-[11px] text-red-600">
                          Sistem memblokir penyimpanan ini. Harap perkecil rentang jam pelajaran yang dipilih atau ubah alokasi beban mengajar di menu Kurikulum &gt; Beban Mengajar terlebih dahulu.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Box Hasil Validasi Real-Time */}
              {liveModalConflicts.length === 0 ? (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-2.5 text-xs text-emerald-900">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Valid & Bebas Bentrok!</p>
                    <p className="text-emerald-700 mt-0.5">
                      Guru aktif pada hari ini, Kelas belum memiliki mapel lain, dan Ruangan tersedia pada jam ini.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-red-50 border-2 border-red-300 space-y-2 text-xs text-red-900">
                  <div className="flex items-center gap-2 font-bold text-red-800">
                    <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
                    <span>
                      Peringatan Validasi: Terdeteksi {liveModalConflicts.length} Konflik!
                    </span>
                  </div>
                  <ul className="list-disc pl-5 space-y-1">
                    {liveModalConflicts.map((c, i) => (
                      <li key={i} className="font-medium">
                        {c.message}
                      </li>
                    ))}
                  </ul>

                  {liveErrorConflicts.length > 0 && (
                    <label className="flex items-center gap-2 pt-2 border-t border-red-200 cursor-pointer font-semibold text-red-800">
                      <input
                        type="checkbox"
                        checked={scheduleForm.forceSave}
                        onChange={(e) =>
                          setScheduleForm({ ...scheduleForm, forceSave: e.target.checked })
                        }
                      />
                      <span>
                        Tetap simpan paksa jadwal ini (akan ditandai merah sebagai jadwal bentrok)
                      </span>
                    </label>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scheduleForm.isLocked}
                    onChange={(e) =>
                      setScheduleForm({ ...scheduleForm, isLocked: e.target.checked })
                    }
                  />
                  <span>Kunci jadwal ini agar tidak digeser saat Auto-Generate</span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowScheduleModal(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium text-xs"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={
                      busyAction ||
                      isQuotaExceeded ||
                      (liveErrorConflicts.length > 0 && !scheduleForm.forceSave)
                    }
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg font-semibold shadow-sm text-xs transition-all"
                    title={
                      isQuotaExceeded
                        ? `Durasi jam (${requestedPeriodsCount} JP) melebihi sisa beban (${modalRemainingQuota} JP)`
                        : undefined
                    }
                  >
                    {isQuotaExceeded
                      ? `Melebihi Kuota Beban (${requestedPeriodsCount} > ${modalRemainingQuota} JP)`
                      : scheduleForm.id
                      ? "Simpan Perubahan"
                      : "Simpan Jadwal"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL PROGRESS INTERAKTIF (AUTO-GENERATE & IMPORT) ==================== */}
      <ProgressModal
        isOpen={progressModal.isOpen}
        onClose={() => setProgressModal((prev) => ({ ...prev, isOpen: false }))}
        iconType={progressModal.iconType}
        title={progressModal.title}
        subtitle={progressModal.subtitle}
        progressPercent={progressModal.progressPercent}
        steps={progressModal.steps}
        activeStepIndex={progressModal.activeStepIndex}
        status={progressModal.status}
        errorText={progressModal.errorText}
        resultStats={progressModal.resultStats}
        extraDetails={progressModal.extraDetails}
        actionButtonText={progressModal.actionButtonText}
      />
    </div>
  );
}
