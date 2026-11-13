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

type TabKey =
  | "schedule"
  | "curriculum"
  | "teachers"
  | "subjects"
  | "rooms_classes"
  | "days"
  | "assignments";

export default function AdminScheduleDashboard() {
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

  // Filter & Search Beban Mengajar
  const [assignmentFilterClass, setAssignmentFilterClass] = useState<string>("ALL");
  const [assignmentFilterTeacherStatus, setAssignmentFilterTeacherStatus] = useState<string>("ALL");
  const [assignmentSearch, setAssignmentSearch] = useState<string>("");

  useEffect(() => {
    // Bangun map standar yang sudah ada
    const initial: Record<string, { totalPeriods: number; maxPerDay: number }> = {};
    for (const std of curriculumStandards) {
      initial[`${std.subjectId}_${std.grade}`] = {
        totalPeriods: std.totalPeriods,
        maxPerDay: std.maxPerDay,
      };
    }
    setStandardInputs(initial);
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

  const handleApplyStandardsToClasses = async () => {
    if (!confirm("Terapkan standar JP mapel umum ke semua rombel (X, XI, XII)? Beban mengajar akan otomatis dibuat tanpa guru (guru bisa dipilih belakangan).")) return;
    setBusyAction(true);
    try {
      // Pastikan standar terbaru tersimpan dulu
      await handleSaveCurriculumStandards();

      const res = await fetch("/api/master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "curriculum_standard",
          action: "apply_to_classes",
          data: {},
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showMessage("success", data.message);
        await loadAllData();
      } else {
        showMessage("error", data.error || "Gagal menerapkan standar");
      }
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
              ? { ...a, teacherId, teacher: teachers.find((t) => t.id === teacherId) || null }
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
        setAudit(data.audit || { conflicts: [], conflictingScheduleIds: [] });

        if (!gridFilterId && data.classes?.length > 0) {
          setGridFilterId(data.classes[0].id);
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
  }, [gridFilterMode, classes, teachers, rooms, gridFilterId]);

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
    try {
      const res = await fetch("/api/roster/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "auto_generate" }),
      });
      const data = await res.json();
      if (res.ok) {
        const extra =
          data.unscheduled?.length > 0
            ? ` (${data.unscheduled.length} beban mengajar belum kebagian slot penuh karena keterbatasan hari aktif/ruang)`
            : "";
        showMessage("success", `${data.message}${extra}`);
        await loadAllData();
      } else {
        showMessage("error", data.error || "Gagal melakukan auto-generate jadwal");
      }
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
        : classes[0]?.id || "";
    const defaultClassObj = classes.find((c) => c.id === defaultClassId);

    const defaultTeacherId =
      gridFilterMode === "TEACHER" && gridFilterId
        ? gridFilterId
        : teachers[0]?.id || "";

    const defaultRoomId =
      gridFilterMode === "ROOM" && gridFilterId
        ? gridFilterId
        : defaultClassObj?.defaultRoomId || rooms[0]?.id || "";

    setScheduleForm({
      id: undefined,
      activeDayId: defaultDay?.id || "",
      timeSlotId: defaultSlot?.id || "",
      classGroupId: defaultClassId,
      subjectId: subjects[0]?.id || "",
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
    setBusyAction(true);
    try {
      const action = scheduleForm.id ? "update" : "create";
      const res = await fetch("/api/roster/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          data: {
            ...scheduleForm,
            force: scheduleForm.forceSave,
          },
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowScheduleModal(false);
        showMessage(
          data.valid ? "success" : "info",
          data.valid
            ? "Jadwal berhasil disimpan & tervalidasi bebas bentrok!"
            : "Jadwal disimpan dengan catatan konflik bentrok."
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
    setBusyAction(true);
    try {
      await fetch("/api/roster/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", data: { id } }),
      });
      await loadAllData();
    } finally {
      setBusyAction(false);
    }
  };

  const handleToggleLockSchedule = async (item: any) => {
    await fetch("/api/roster/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "toggle_lock",
        data: { id: item.id, isLocked: !item.isLocked },
      }),
    });
    await loadAllData();
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
      if (res.ok) {
        setTeacherForm({
          code: "",
          nip: "",
          name: "",
          phone: "",
          maxPeriods: 24,
          activeDays: [1, 2, 3, 4, 5],
        });
        showMessage("success", "Data guru & hari keaktifan berhasil disimpan.");
        await loadAllData();
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
      if (res.ok) {
        setSubjectForm({
          code: "",
          name: "",
          category: "UMUM",
          color: "#2563eb",
          requiresLab: false,
        });
        showMessage("success", "Data mata pelajaran berhasil disimpan.");
        await loadAllData();
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
      if (res.ok) {
        setRoomForm({ code: "", name: "", type: "TEORI", capacity: 36 });
        showMessage("success", "Data ruangan berhasil disimpan.");
        await loadAllData();
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
      if (res.ok) {
        setClassForm({ code: "", name: "", grade: "X", defaultRoomId: "" });
        showMessage("success", "Data kelas/rombel berhasil disimpan.");
        await loadAllData();
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
      if (res.ok) {
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
        showMessage("success", "Alokasi beban mengajar berhasil disimpan.");
        await loadAllData();
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
    try {
      await fetch("/api/master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity, action: "delete", data: { id } }),
      });
      await loadAllData();
    } finally {
      setBusyAction(false);
    }
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

    const text = await file.text();
    const rows = parseCsvText(text);
    if (rows.length === 0) {
      showMessage("error", "File CSV kosong atau format kolom tidak terbaca.");
      return;
    }

    setBusyAction(true);
    try {
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
        showMessage("success", data.message || "Import berhasil!");
        await loadAllData();
      } else {
        showMessage("error", data.error || "Gagal melakukan import data");
      }
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
  }, [schoolActiveDays]);

  const filteredGridSchedules = useMemo(() => {
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
  }, [schedules, gridFilterMode, gridFilterId]);

  const totalTargetJP = useMemo(
    () => assignments.reduce((acc, a) => acc + (a.totalPeriods || 0), 0),
    [assignments]
  );

  const filteredAssignments = useMemo(() => {
    return assignments.filter((a) => {
      if (assignmentFilterClass !== "ALL" && a.classGroupId !== assignmentFilterClass) {
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
        const clsName = a.classGroup?.name?.toLowerCase() || "";
        const subName = a.subject?.name?.toLowerCase() || "";
        const subCode = a.subject?.code?.toLowerCase() || "";
        const teaName = a.teacher?.name?.toLowerCase() || "";
        const notes = a.notes?.toLowerCase() || "";
        if (
          !clsName.includes(q) &&
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
  }, [assignments, assignmentFilterClass, assignmentFilterTeacherStatus, assignmentSearch]);

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

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
        {[
          {
            key: "schedule",
            label: "1. Tabel Jadwal & Validasi Bentrok",
            icon: Calendar,
            badge: errorConflictList.length > 0 ? errorConflictList.length : undefined,
          },
          { key: "curriculum", label: "2. Struktur Kurikulum (Standar JP)", icon: Sparkles },
          { key: "assignments", label: "3. Beban Mengajar (JP)", icon: Layers },
          { key: "teachers", label: "4. Data Guru & Hari Aktif", icon: Users },
          { key: "subjects", label: "5. Mata Pelajaran", icon: BookOpen },
          { key: "rooms_classes", label: "6. Ruangan & Kelas", icon: DoorOpen },
          { key: "days", label: "7. Hari Keaktifan & Jam Sekolah", icon: Clock },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as TabKey)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                isActive
                  ? "bg-slate-900 text-white shadow-sm"
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

              <select
                value={gridFilterId}
                onChange={(e) => setGridFilterId(e.target.value)}
                className="ml-1 px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 min-w-[230px]"
              >
                {gridFilterMode === "CLASS" &&
                  classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                {gridFilterMode === "TEACHER" &&
                  teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.code})
                    </option>
                  ))}
                {gridFilterMode === "ROOM" &&
                  rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.code}) - {r.type}
                    </option>
                  ))}
              </select>
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

                        return (
                          <th
                            key={day.id}
                            className="py-3.5 px-4 text-left font-semibold border-r border-slate-800 min-w-[220px]"
                          >
                            <div className="flex items-center justify-between">
                              <span>{day.dayName}</span>
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
                    {allPeriodRows.map((row) => (
                      <tr
                        key={row.periodNumber}
                        className={row.isBreak ? "bg-amber-50/70" : "hover:bg-slate-50/50"}
                      >
                        <td className="py-3 px-4 border-r border-slate-200 align-top bg-slate-50">
                          <div className="font-bold text-slate-800">{row.label}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
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

                          const cellSchedules = filteredGridSchedules.filter(
                            (s) => s.activeDayId === day.id && s.timeSlotId === daySlot.id
                          );

                          return (
                            <td key={day.id} className="p-2.5 border-r border-slate-200 align-top">
                              <div className="space-y-2">
                                {cellSchedules.map((item) => {
                                  const isConflicting = audit.conflictingScheduleIds.includes(
                                    item.id
                                  );
                                  return (
                                    <div
                                      key={item.id}
                                      className={`p-2.5 rounded-xl border shadow-sm transition-all ${
                                        isConflicting
                                          ? "bg-red-50 border-red-500 ring-2 ring-red-300"
                                          : "bg-white border-slate-200 hover:border-blue-300"
                                      }`}
                                      style={{
                                        borderLeftWidth: "5px",
                                        borderLeftColor: isConflicting
                                          ? "#dc2626"
                                          : item.subject?.color || "#2563eb",
                                      }}
                                    >
                                      <div className="flex items-start justify-between gap-1">
                                        <span className="font-bold text-slate-900 text-xs sm:text-sm">
                                          {item.subject?.name}
                                        </span>
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                                          {item.room?.code}
                                        </span>
                                      </div>

                                      <div className="mt-1 space-y-0.5 text-xs text-slate-600">
                                        <div>👨‍🏫 {item.teacher?.name}</div>
                                        <div className="font-semibold text-blue-700">
                                          🎓 {item.classGroup?.name}
                                        </div>
                                      </div>

                                      {isConflicting && (
                                        <div className="mt-1.5 text-[11px] font-bold text-red-600 flex items-center gap-1">
                                          <AlertTriangle className="w-3.5 h-3.5" />
                                          <span>BENTROK TERDETEKSI!</span>
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
                    ))}
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
              <h3 className="font-bold text-slate-900">
                Daftar Guru & Ketersediaan Hari Aktif ({teachers.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <th className="py-3 px-4 font-semibold">Kode</th>
                    <th className="py-3 px-4 font-semibold">Nama Guru</th>
                    <th className="py-3 px-4 font-semibold">Hari Keaktifan</th>
                    <th className="py-3 px-4 font-semibold">Terjadwal / Maks JP</th>
                    <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {teachers.map((t) => {
                    const days = parseJsonNumberArray(t.activeDays);
                    const scheduledCount = schedules.filter((s) => s.teacherId === t.id).length;
                    return (
                      <tr key={t.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-bold text-blue-700">{t.code}</td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{t.name}</div>
                          {t.nip && <div className="text-xs text-slate-500">NIP: {t.nip}</div>}
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
                        <td className="py-3 px-4 font-semibold text-slate-700">
                          {scheduledCount} / {t.maxPeriods} JP
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
                <select
                  required
                  value={assignmentForm.classGroupId}
                  onChange={(e) =>
                    setAssignmentForm({ ...assignmentForm, classGroupId: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                >
                  <option value="">-- Pilih Kelas --</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mata Pelajaran *
                </label>
                <select
                  required
                  value={assignmentForm.subjectId}
                  onChange={(e) =>
                    setAssignmentForm({ ...assignmentForm, subjectId: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                >
                  <option value="">-- Pilih Mata Pelajaran --</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Guru Pengajar (Opsional / TBD)
                </label>
                <select
                  value={assignmentForm.teacherId}
                  onChange={(e) =>
                    setAssignmentForm({ ...assignmentForm, teacherId: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                >
                  <option value="">-- Belum Ditentukan (TBD) --</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.code})
                    </option>
                  ))}
                </select>
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
                <select
                  value={assignmentForm.preferredRoomId}
                  onChange={(e) =>
                    setAssignmentForm({ ...assignmentForm, preferredRoomId: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                >
                  <option value="">-- Ikuti Ruang Default Kelas --</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.code})
                    </option>
                  ))}
                </select>
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
                <h3 className="font-bold text-slate-900">
                  Daftar Alokasi Tugas Mengajar ({assignments.length} Item — Total {totalTargetJP} JP)
                </h3>
                <p className="text-xs text-slate-500">
                  Guru dapat dipilih langsung melalui menu dropdown di setiap baris tabel.
                </p>
              </div>
              <button
                onClick={handleAutoGenerate}
                disabled={busyAction}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Susun Otomatis Sekarang</span>
              </button>
            </div>

            {/* Filter & Pencarian Cepat */}
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap gap-2.5 items-center text-xs">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-slate-600">Filter Kelas:</span>
                <select
                  value={assignmentFilterClass}
                  onChange={(e) => setAssignmentFilterClass(e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                >
                  <option value="ALL">Semua Kelas ({classes.length})</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-slate-600">Status Guru:</span>
                <select
                  value={assignmentFilterTeacherStatus}
                  onChange={(e) => setAssignmentFilterTeacherStatus(e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                >
                  <option value="ALL">Semua Status</option>
                  <option value="ASSIGNED">Sudah Ada Guru</option>
                  <option value="UNASSIGNED">Belum Ada Guru (TBD)</option>
                </select>
              </div>

              <div className="flex-1 min-w-[180px]">
                <input
                  type="text"
                  placeholder="Cari mapel, guru, rombel..."
                  value={assignmentSearch}
                  onChange={(e) => setAssignmentSearch(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                />
              </div>

              {(assignmentFilterClass !== "ALL" ||
                assignmentFilterTeacherStatus !== "ALL" ||
                assignmentSearch) && (
                <button
                  type="button"
                  onClick={() => {
                    setAssignmentFilterClass("ALL");
                    setAssignmentFilterTeacherStatus("ALL");
                    setAssignmentSearch("");
                  }}
                  className="text-xs text-blue-600 hover:underline font-semibold"
                >
                  Reset Filter
                </button>
              )}
            </div>

            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs">
                    <th className="py-3 px-4 font-semibold">Kelas</th>
                    <th className="py-3 px-4 font-semibold">Mata Pelajaran</th>
                    <th className="py-3 px-4 font-semibold">Guru Pengajar (Pilih Langsung)</th>
                    <th className="py-3 px-4 font-semibold">Keterangan</th>
                    <th className="py-3 px-4 font-semibold">Terjadwal</th>
                    <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredAssignments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-400 text-xs">
                        Tidak ada alokasi beban mengajar yang cocok dengan filter.
                      </td>
                    </tr>
                  ) : (
                    filteredAssignments.map((a) => {
                      const scheduledCount = schedules.filter(
                        (s) =>
                          s.teacherId === a.teacherId &&
                          s.subjectId === a.subjectId &&
                          s.classGroupId === a.classGroupId
                      ).length;
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
                          <td className="py-2.5 px-4">
                            <select
                              value={a.teacherId || ""}
                              onChange={(e) => handleQuickAssignTeacher(a.id, e.target.value)}
                              className={`text-xs px-2.5 py-1 rounded-lg border font-medium w-full max-w-[200px] transition-colors ${
                                a.teacherId
                                  ? "border-slate-300 bg-white text-slate-800"
                                  : "border-amber-300 bg-amber-50 text-amber-800"
                              }`}
                            >
                              <option value="">-- Belum Ada Guru (TBD) --</option>
                              {teachers.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name} ({t.code})
                                </option>
                              ))}
                            </select>
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

      {/* ==================== MODAL TAMBAH / EDIT JADWAL DENGAN VALIDASI REAL-TIME ==================== */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
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

            <form onSubmit={handleSaveSchedule} className="p-5 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Hari *
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
                      });
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-medium"
                  >
                    {activeDays.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.dayName} {!d.isActive ? "(Non-Aktif/Libur)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Slot Jam Pelajaran *
                  </label>
                  <select
                    required
                    value={scheduleForm.timeSlotId}
                    onChange={(e) =>
                      setScheduleForm({ ...scheduleForm, timeSlotId: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-medium"
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
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kelas / Rombel *
                  </label>
                  <select
                    required
                    value={scheduleForm.classGroupId}
                    onChange={(e) => {
                      const cls = classes.find((c) => c.id === e.target.value);
                      setScheduleForm({
                        ...scheduleForm,
                        classGroupId: e.target.value,
                        roomId: cls?.defaultRoomId || scheduleForm.roomId,
                      });
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-medium"
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Ruangan *
                  </label>
                  <select
                    required
                    value={scheduleForm.roomId}
                    onChange={(e) =>
                      setScheduleForm({ ...scheduleForm, roomId: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-medium"
                  >
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.code}) - {r.type}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Mata Pelajaran *
                  </label>
                  <select
                    required
                    value={scheduleForm.subjectId}
                    onChange={(e) =>
                      setScheduleForm({ ...scheduleForm, subjectId: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-medium"
                  >
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Guru Pengajar *
                  </label>
                  <select
                    required
                    value={scheduleForm.teacherId}
                    onChange={(e) =>
                      setScheduleForm({ ...scheduleForm, teacherId: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-medium"
                  >
                    {teachers.map((t) => {
                      const days = parseJsonNumberArray(t.activeDays)
                        .map((d) => DAY_NAMES[d]?.slice(0, 3))
                        .join(",");
                      return (
                        <option key={t.id} value={t.id}>
                          {t.name} [Aktif: {days}]
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

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
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={
                      busyAction || (liveErrorConflicts.length > 0 && !scheduleForm.forceSave)
                    }
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg font-semibold shadow-sm"
                  >
                    {scheduleForm.id ? "Simpan Perubahan" : "Simpan Jadwal"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
