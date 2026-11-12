export type ConflictType =
  | 'TEACHER_CONFLICT'
  | 'CLASS_CONFLICT'
  | 'ROOM_CONFLICT'
  | 'TEACHER_INACTIVE_DAY'
  | 'TEACHER_UNAVAILABLE_SLOT'
  | 'SCHOOL_INACTIVE_DAY'
  | 'BREAK_SLOT'
  | 'TEACHER_MAX_PERIODS';

export interface ConflictDetail {
  type: ConflictType;
  severity: 'ERROR' | 'WARNING';
  message: string;
  scheduleIds: string[];
  dayName?: string;
  timeSlotLabel?: string;
  entityName?: string;
}

export interface ScheduleWithRelations {
  id: string;
  activeDayId: string;
  timeSlotId: string;
  teacherId: string;
  subjectId: string;
  classGroupId: string;
  roomId: string;
  notes?: string | null;
  isLocked: boolean;
  activeDay: {
    id: string;
    dayNumber: number;
    dayName: string;
    isActive: boolean;
  };
  timeSlot: {
    id: string;
    periodNumber: number;
    label: string;
    startTime: string;
    endTime: string;
    isBreak: boolean;
  };
  teacher: {
    id: string;
    code: string;
    name: string;
    maxPeriods: number;
    activeDays: string;
    unavailableSlots: string;
  };
  subject: {
    id: string;
    code: string;
    name: string;
    color: string;
    requiresLab: boolean;
  };
  classGroup: {
    id: string;
    code: string;
    name: string;
    grade: string;
  };
  room: {
    id: string;
    code: string;
    name: string;
    type: string;
  };
}

export function parseJsonNumberArray(raw: string | null | undefined, fallback: number[] = [1, 2, 3, 4, 5]): number[] {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((n) => Number(n)).filter((n) => !Number.isNaN(n));
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export function parseJsonStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((s) => String(s));
    }
    return [];
  } catch {
    return [];
  }
}

export interface CandidateScheduleInput {
  id?: string; // diisi saat update jadwal
  activeDayId: string;
  timeSlotId: string;
  teacherId: string;
  subjectId: string;
  classGroupId: string;
  roomId: string;
}

export function validateScheduleCandidate(params: {
  candidate: CandidateScheduleInput;
  existingSchedules: ScheduleWithRelations[];
  activeDay: { id: string; dayNumber: number; dayName: string; isActive: boolean };
  timeSlot: { id: string; periodNumber: number; label: string; startTime: string; endTime: string; isBreak: boolean };
  teacher: { id: string; code: string; name: string; maxPeriods: number; activeDays: string; unavailableSlots: string };
  classGroup: { id: string; code: string; name: string };
  room: { id: string; code: string; name: string; type: string };
  subject?: { id: string; code: string; name: string; requiresLab: boolean };
}): ConflictDetail[] {
  const { candidate, existingSchedules, activeDay, timeSlot, teacher, classGroup, room } = params;
  const conflicts: ConflictDetail[] = [];

  // 1. Cek apakah Hari Sekolah Aktif
  if (!activeDay.isActive) {
    conflicts.push({
      type: 'SCHOOL_INACTIVE_DAY',
      severity: 'ERROR',
      message: `Hari ${activeDay.dayName} berstatus libur / tidak aktif di pengaturan sekolah.`,
      scheduleIds: candidate.id ? [candidate.id] : [],
      dayName: activeDay.dayName,
      timeSlotLabel: timeSlot.label,
      entityName: activeDay.dayName,
    });
  }

  // 2. Cek apakah Slot Jam merupakan Jam Istirahat / Upacara
  if (timeSlot.isBreak) {
    conflicts.push({
      type: 'BREAK_SLOT',
      severity: 'ERROR',
      message: `Slot "${timeSlot.label}" (${timeSlot.startTime}-${timeSlot.endTime}) adalah waktu istirahat/non-KBM dan tidak dapat diisi mata pelajaran.`,
      scheduleIds: candidate.id ? [candidate.id] : [],
      dayName: activeDay.dayName,
      timeSlotLabel: timeSlot.label,
    });
  }

  // 3. Cek Hari Keaktifan Guru
  const teacherActiveDays = parseJsonNumberArray(teacher.activeDays);
  if (!teacherActiveDays.includes(activeDay.dayNumber)) {
    conflicts.push({
      type: 'TEACHER_INACTIVE_DAY',
      severity: 'ERROR',
      message: `Guru ${teacher.name} (${teacher.code}) tidak aktif/tidak tersedia mengajar pada hari ${activeDay.dayName}.`,
      scheduleIds: candidate.id ? [candidate.id] : [],
      dayName: activeDay.dayName,
      timeSlotLabel: timeSlot.label,
      entityName: teacher.name,
    });
  }

  // 4. Cek Slot Jam Tidak Tersedia Guru
  const unavailableSlots = parseJsonStringArray(teacher.unavailableSlots);
  if (unavailableSlots.includes(timeSlot.id)) {
    conflicts.push({
      type: 'TEACHER_UNAVAILABLE_SLOT',
      severity: 'ERROR',
      message: `Guru ${teacher.name} (${teacher.code}) menandai tidak tersedia pada ${activeDay.dayName} - ${timeSlot.label}.`,
      scheduleIds: candidate.id ? [candidate.id] : [],
      dayName: activeDay.dayName,
      timeSlotLabel: timeSlot.label,
      entityName: teacher.name,
    });
  }

  // Filter jadwal lain di slot waktu yang sama (kecuali dirinya sendiri saat edit)
  const sameSlotSchedules = existingSchedules.filter(
    (s) => s.timeSlotId === candidate.timeSlotId && s.id !== candidate.id
  );

  for (const other of sameSlotSchedules) {
    // 5. Cek Bentrok Guru
    if (other.teacherId === candidate.teacherId) {
      conflicts.push({
        type: 'TEACHER_CONFLICT',
        severity: 'ERROR',
        message: `Bentrok Guru: ${teacher.name} sudah mengajar ${other.subject.name} di kelas ${other.classGroup.name} (Ruang ${other.room.code}) pada ${activeDay.dayName}, ${timeSlot.label} (${timeSlot.startTime}-${timeSlot.endTime}).`,
        scheduleIds: [other.id, ...(candidate.id ? [candidate.id] : [])],
        dayName: activeDay.dayName,
        timeSlotLabel: timeSlot.label,
        entityName: teacher.name,
      });
    }

    // 6. Cek Bentrok Kelas / Rombel
    if (other.classGroupId === candidate.classGroupId) {
      conflicts.push({
        type: 'CLASS_CONFLICT',
        severity: 'ERROR',
        message: `Bentrok Kelas: ${classGroup.name} sudah memiliki jadwal ${other.subject.name} bersama ${other.teacher.name} pada ${activeDay.dayName}, ${timeSlot.label}.`,
        scheduleIds: [other.id, ...(candidate.id ? [candidate.id] : [])],
        dayName: activeDay.dayName,
        timeSlotLabel: timeSlot.label,
        entityName: classGroup.name,
      });
    }

    // 7. Cek Bentrok Ruangan
    if (other.roomId === candidate.roomId) {
      conflicts.push({
        type: 'ROOM_CONFLICT',
        severity: 'ERROR',
        message: `Bentrok Ruangan: Ruang ${room.name} (${room.code}) sedang digunakan oleh kelas ${other.classGroup.name} (${other.subject.name} - ${other.teacher.name}) pada ${activeDay.dayName}, ${timeSlot.label}.`,
        scheduleIds: [other.id, ...(candidate.id ? [candidate.id] : [])],
        dayName: activeDay.dayName,
        timeSlotLabel: timeSlot.label,
        entityName: room.name,
      });
    }
  }

  // 8. Cek Peringatan Maksimal JP Guru per Minggu
  const teacherPeriodCount = existingSchedules.filter(
    (s) => s.teacherId === candidate.teacherId && s.id !== candidate.id
  ).length;
  if (teacherPeriodCount + 1 > teacher.maxPeriods) {
    conflicts.push({
      type: 'TEACHER_MAX_PERIODS',
      severity: 'WARNING',
      message: `Beban mengajar Guru ${teacher.name} akan menjadi ${teacherPeriodCount + 1} JP, melebihi batas maksimal ${teacher.maxPeriods} JP/minggu.`,
      scheduleIds: candidate.id ? [candidate.id] : [],
      dayName: activeDay.dayName,
      timeSlotLabel: timeSlot.label,
      entityName: teacher.name,
    });
  }

  return conflicts;
}

/**
 * Memindai seluruh jadwal yang ada di database untuk menemukan semua bentrok / pelanggaran aturan.
 */
export function auditAllSchedules(schedules: ScheduleWithRelations[]): {
  conflicts: ConflictDetail[];
  conflictingScheduleIds: string[];
} {
  const conflicts: ConflictDetail[] = [];
  const conflictingIdSet = new Set<string>();
  const seenPairKeys = new Set<string>();

  for (const item of schedules) {
    // 1. Hari tidak aktif
    if (!item.activeDay.isActive) {
      conflicts.push({
        type: 'SCHOOL_INACTIVE_DAY',
        severity: 'ERROR',
        message: `Jadwal ${item.subject.name} (${item.classGroup.name}) berada di hari non-aktif sekolah (${item.activeDay.dayName}).`,
        scheduleIds: [item.id],
        dayName: item.activeDay.dayName,
        timeSlotLabel: item.timeSlot.label,
        entityName: item.activeDay.dayName,
      });
      conflictingIdSet.add(item.id);
    }

    // 2. Jam istirahat
    if (item.timeSlot.isBreak) {
      conflicts.push({
        type: 'BREAK_SLOT',
        severity: 'ERROR',
        message: `Jadwal ${item.subject.name} (${item.classGroup.name}) berada di jam istirahat (${item.activeDay.dayName} - ${item.timeSlot.label}).`,
        scheduleIds: [item.id],
        dayName: item.activeDay.dayName,
        timeSlotLabel: item.timeSlot.label,
      });
      conflictingIdSet.add(item.id);
    }

    // 3. Hari keaktifan guru
    const activeDays = parseJsonNumberArray(item.teacher.activeDays);
    if (!activeDays.includes(item.activeDay.dayNumber)) {
      conflicts.push({
        type: 'TEACHER_INACTIVE_DAY',
        severity: 'ERROR',
        message: `Pelanggaran Hari Aktif Guru: ${item.teacher.name} dijadwalkan mengajar ${item.subject.name} (${item.classGroup.name}) pada hari ${item.activeDay.dayName}, padahal tidak aktif di hari tersebut.`,
        scheduleIds: [item.id],
        dayName: item.activeDay.dayName,
        timeSlotLabel: item.timeSlot.label,
        entityName: item.teacher.name,
      });
      conflictingIdSet.add(item.id);
    }

    // 4. Slot tidak tersedia guru
    const unavailable = parseJsonStringArray(item.teacher.unavailableSlots);
    if (unavailable.includes(item.timeSlotId)) {
      conflicts.push({
        type: 'TEACHER_UNAVAILABLE_SLOT',
        severity: 'ERROR',
        message: `Guru ${item.teacher.name} tidak tersedia pada ${item.activeDay.dayName}, ${item.timeSlot.label} (${item.classGroup.name}).`,
        scheduleIds: [item.id],
        dayName: item.activeDay.dayName,
        timeSlotLabel: item.timeSlot.label,
        entityName: item.teacher.name,
      });
      conflictingIdSet.add(item.id);
    }
  }

  // Bandingkan pasangan jadwal pada timeSlotId yang sama
  const byTimeSlot = new Map<string, ScheduleWithRelations[]>();
  for (const s of schedules) {
    const list = byTimeSlot.get(s.timeSlotId) || [];
    list.push(s);
    byTimeSlot.set(s.timeSlotId, list);
  }

  for (const [, slotSchedules] of Array.from(byTimeSlot.entries())) {
    if (slotSchedules.length < 2) continue;
    for (let i = 0; i < slotSchedules.length; i++) {
      for (let j = i + 1; j < slotSchedules.length; j++) {
        const a = slotSchedules[i];
        const b = slotSchedules[j];
        const pairIds = [a.id, b.id].sort().join('_');

        if (a.teacherId === b.teacherId) {
          const key = `TEACHER_${pairIds}`;
          if (!seenPairKeys.has(key)) {
            seenPairKeys.add(key);
            conflicts.push({
              type: 'TEACHER_CONFLICT',
              severity: 'ERROR',
              message: `Bentrok Guru (${a.teacher.name}): Mengajar di ${a.classGroup.name} (${a.subject.name}) dan ${b.classGroup.name} (${b.subject.name}) secara bersamaan pada ${a.activeDay.dayName}, ${a.timeSlot.label}.`,
              scheduleIds: [a.id, b.id],
              dayName: a.activeDay.dayName,
              timeSlotLabel: a.timeSlot.label,
              entityName: a.teacher.name,
            });
            conflictingIdSet.add(a.id);
            conflictingIdSet.add(b.id);
          }
        }

        if (a.classGroupId === b.classGroupId) {
          const key = `CLASS_${pairIds}`;
          if (!seenPairKeys.has(key)) {
            seenPairKeys.add(key);
            conflicts.push({
              type: 'CLASS_CONFLICT',
              severity: 'ERROR',
              message: `Bentrok Kelas (${a.classGroup.name}): Memiliki 2 mapel sekaligus (${a.subject.name} - ${a.teacher.name} & ${b.subject.name} - ${b.teacher.name}) pada ${a.activeDay.dayName}, ${a.timeSlot.label}.`,
              scheduleIds: [a.id, b.id],
              dayName: a.activeDay.dayName,
              timeSlotLabel: a.timeSlot.label,
              entityName: a.classGroup.name,
            });
            conflictingIdSet.add(a.id);
            conflictingIdSet.add(b.id);
          }
        }

        if (a.roomId === b.roomId) {
          const key = `ROOM_${pairIds}`;
          if (!seenPairKeys.has(key)) {
            seenPairKeys.add(key);
            conflicts.push({
              type: 'ROOM_CONFLICT',
              severity: 'ERROR',
              message: `Bentrok Ruangan (${a.room.name}): Dipakai bersamaan oleh ${a.classGroup.name} (${a.subject.name}) dan ${b.classGroup.name} (${b.subject.name}) pada ${a.activeDay.dayName}, ${a.timeSlot.label}.`,
              scheduleIds: [a.id, b.id],
              dayName: a.activeDay.dayName,
              timeSlotLabel: a.timeSlot.label,
              entityName: a.room.name,
            });
            conflictingIdSet.add(a.id);
            conflictingIdSet.add(b.id);
          }
        }
      }
    }
  }

  return {
    conflicts,
    conflictingScheduleIds: Array.from(conflictingIdSet),
  };
}
