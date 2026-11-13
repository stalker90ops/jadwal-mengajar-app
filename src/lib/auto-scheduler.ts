import { parseJsonNumberArray, parseJsonStringArray } from './schedule-validator';

export interface SchedulerDay {
  id: string;
  dayNumber: number;
  dayName: string;
  isActive: boolean;
  timeSlots: {
    id: string;
    activeDayId: string;
    periodNumber: number;
    label: string;
    startTime: string;
    endTime: string;
    isBreak: boolean;
  }[];
}

export interface SchedulerTeacher {
  id: string;
  code: string;
  name: string;
  maxPeriods: number;
  activeDays: string;
  unavailableSlots: string;
}

export interface SchedulerSubject {
  id: string;
  code: string;
  name: string;
  category: string;
  requiresLab: boolean;
}

export interface SchedulerRoom {
  id: string;
  code: string;
  name: string;
  type: string;
  capacity: number;
}

export interface SchedulerClassGroup {
  id: string;
  code: string;
  name: string;
  grade: string;
  defaultRoomId: string | null;
}

export interface SchedulerAssignment {
  id: string;
  teacherId?: string | null;
  subjectId: string;
  classGroupId: string;
  preferredRoomId: string | null;
  totalPeriods: number;
  maxPerDay: number;
  teacher?: SchedulerTeacher | null;
  subject: SchedulerSubject;
  classGroup: SchedulerClassGroup;
}

export interface GeneratedSlotItem {
  activeDayId: string;
  timeSlotId: string;
  teacherId: string;
  subjectId: string;
  classGroupId: string;
  roomId: string;
  notes?: string | null;
}

export interface UnscheduledReport {
  assignmentId: string;
  teacherName: string;
  subjectName: string;
  className: string;
  requestedPeriods: number;
  scheduledPeriods: number;
  reason: string;
}

export function generateConflictFreeSchedule(params: {
  days: SchedulerDay[];
  teachers: SchedulerTeacher[];
  subjects: SchedulerSubject[];
  rooms: SchedulerRoom[];
  classes: SchedulerClassGroup[];
  assignments: SchedulerAssignment[];
  lockedSchedules: GeneratedSlotItem[];
}): {
  generated: GeneratedSlotItem[];
  unscheduled: UnscheduledReport[];
  totalRequestedPeriods: number;
  totalScheduledPeriods: number;
} {
  const { days, rooms, assignments, lockedSchedules } = params;

  const activeDays = days
    .filter((d) => d.isActive)
    .sort((a, b) => a.dayNumber - b.dayNumber)
    .map((d) => ({
      ...d,
      teachingSlots: d.timeSlots
        .filter((ts) => !ts.isBreak)
        .sort((a, b) => a.periodNumber - b.periodNumber),
    }));

  // Lacak penggunaan slot agar O(1) saat pengecekan bentrok
  const busyTeacherSlot = new Set<string>(); // `${timeSlotId}_${teacherId}`
  const busyClassSlot = new Set<string>();   // `${timeSlotId}_${classGroupId}`
  const busyRoomSlot = new Set<string>();    // `${timeSlotId}_${roomId}`
  const teacherTotalCount = new Map<string, number>();
  const classDaySubjectCount = new Map<string, number>(); // `${activeDayId}_${classGroupId}_${subjectId}`

  // Masukkan jadwal yang sudah dikunci (locked) terlebih dahulu
  for (const locked of lockedSchedules) {
    busyTeacherSlot.add(`${locked.timeSlotId}_${locked.teacherId}`);
    busyClassSlot.add(`${locked.timeSlotId}_${locked.classGroupId}`);
    busyRoomSlot.add(`${locked.timeSlotId}_${locked.roomId}`);
    teacherTotalCount.set(locked.teacherId, (teacherTotalCount.get(locked.teacherId) || 0) + 1);
    const daySubKey = `${locked.activeDayId}_${locked.classGroupId}_${locked.subjectId}`;
    classDaySubjectCount.set(daySubKey, (classDaySubjectCount.get(daySubKey) || 0) + 1);
  }

  // Urutkan assignment dari yang paling ketat kendalanya (Most-Constrained Variable First):
  // 1. Guru dengan jumlah hari aktif paling sedikit
  // 2. Mapel yang butuh Lab / preferredRoom
  // 3. Jumlah totalPeriods terbesar
  const sortedAssignments = [...assignments].sort((a, b) => {
    const aDays = a.teacher ? parseJsonNumberArray(a.teacher.activeDays).length : 7;
    const bDays = b.teacher ? parseJsonNumberArray(b.teacher.activeDays).length : 7;
    if (aDays !== bDays) return aDays - bDays;

    const aSpecialRoom = a.preferredRoomId || a.subject.requiresLab ? 1 : 0;
    const bSpecialRoom = b.preferredRoomId || b.subject.requiresLab ? 1 : 0;
    if (aSpecialRoom !== bSpecialRoom) return bSpecialRoom - aSpecialRoom;

    return b.totalPeriods - a.totalPeriods;
  });

  const generated: GeneratedSlotItem[] = [];
  const unscheduled: UnscheduledReport[] = [];
  let totalRequestedPeriods = 0;
  let totalScheduledPeriods = 0;

  // Fungsi memilih ruangan yang tidak bentrok pada timeSlotId tertentu
  function findAvailableRoom(assignment: SchedulerAssignment, timeSlotId: string): string | null {
    // 1. Jika ada preferredRoomId pada beban mengajar
    if (assignment.preferredRoomId) {
      if (!busyRoomSlot.has(`${timeSlotId}_${assignment.preferredRoomId}`)) {
        return assignment.preferredRoomId;
      }
    }

    // 2. Jika mapel membutuhkan Lab, prioritaskan ruangan bertipe LAB
    if (assignment.subject.requiresLab) {
      const labRooms = rooms.filter((r) => r.type.toUpperCase().includes('LAB'));
      for (const lab of labRooms) {
        if (!busyRoomSlot.has(`${timeSlotId}_${lab.id}`)) {
          return lab.id;
        }
      }
    }

    // 3. Gunakan ruangan default milik Kelas/Rombel
    if (assignment.classGroup.defaultRoomId) {
      if (!busyRoomSlot.has(`${timeSlotId}_${assignment.classGroup.defaultRoomId}`)) {
        return assignment.classGroup.defaultRoomId;
      }
    }

    // 4. Cari ruangan teori (atau ruangan apa saja yang kosong)
    const theoryRooms = rooms.filter((r) => r.type === 'TEORI');
    for (const r of theoryRooms) {
      if (!busyRoomSlot.has(`${timeSlotId}_${r.id}`)) {
        return r.id;
      }
    }
    for (const r of rooms) {
      if (!busyRoomSlot.has(`${timeSlotId}_${r.id}`)) {
        return r.id;
      }
    }

    return null;
  }

  function isSlotValidForAssignment(
    assignment: SchedulerAssignment,
    day: SchedulerDay,
    timeSlotId: string
  ): { ok: boolean; roomId: string | null } {
    if (assignment.teacher && assignment.teacherId) {
      const teacherActiveDays = parseJsonNumberArray(assignment.teacher.activeDays);
      if (!teacherActiveDays.includes(day.dayNumber)) {
        return { ok: false, roomId: null };
      }

      const teacherUnavailable = parseJsonStringArray(assignment.teacher.unavailableSlots);
      if (teacherUnavailable.includes(timeSlotId)) {
        return { ok: false, roomId: null };
      }

      if (busyTeacherSlot.has(`${timeSlotId}_${assignment.teacherId}`)) {
        return { ok: false, roomId: null };
      }
    }

    if (busyClassSlot.has(`${timeSlotId}_${assignment.classGroupId}`)) {
      return { ok: false, roomId: null };
    }

    const roomId = findAvailableRoom(assignment, timeSlotId);
    if (!roomId) {
      return { ok: false, roomId: null };
    }

    return { ok: true, roomId };
  }

  for (const assignment of sortedAssignments) {
    // Jika belum ada guru yang ditentukan, lewati auto-schedule dan catat di unscheduled
    if (!assignment.teacherId) {
      unscheduled.push({
        assignmentId: assignment.id,
        teacherName: "(Belum Ditentukan)",
        subjectName: assignment.subject.name,
        className: assignment.classGroup.name,
        requestedPeriods: assignment.totalPeriods,
        scheduledPeriods: 0,
        reason: "Guru pengampu belum ditentukan (TBD). Silakan tentukan guru pengampu di Beban Mengajar.",
      });
      continue;
    }

    // Hitung berapa JP yang sudah dikunci untuk pasangan guru-mapel-kelas ini
    const alreadyLockedCount = lockedSchedules.filter(
      (l) =>
        l.teacherId === assignment.teacherId &&
        l.subjectId === assignment.subjectId &&
        l.classGroupId === assignment.classGroupId
    ).length;

    let remaining = Math.max(0, assignment.totalPeriods - alreadyLockedCount);
    totalRequestedPeriods += remaining;
    let scheduledForThis = 0;

    // Pecah ke dalam blok pertemuan (misal 4 JP dengan maxPerDay=2 -> [2, 2])
    const maxBlock = Math.max(1, assignment.maxPerDay || 2);

    // Tahap 1: Coba alokasikan blok jam berurutan di hari yang belum ada mapel ini
    for (const day of activeDays) {
      if (remaining <= 0) break;

      if (assignment.teacher) {
        const teacherActiveDays = parseJsonNumberArray(assignment.teacher.activeDays);
        if (!teacherActiveDays.includes(day.dayNumber)) continue;
      }

      const daySubKey = `${day.id}_${assignment.classGroupId}_${assignment.subjectId}`;
      const existingToday = classDaySubjectCount.get(daySubKey) || 0;
      if (existingToday >= maxBlock) continue;

      const desiredInDay = Math.min(remaining, maxBlock - existingToday);
      const slots = day.teachingSlots;

      // Cari blok berurutan sepanjang desiredInDay (atau turun ke 1 jika tidak ada)
      let placedInDay = false;
      for (let blockSize = desiredInDay; blockSize >= 1; blockSize--) {
        for (let startIdx = 0; startIdx <= slots.length - blockSize; startIdx++) {
          const candidateSlots = slots.slice(startIdx, startIdx + blockSize);
          const chosenRooms: string[] = [];
          let allValid = true;

          for (const ts of candidateSlots) {
            const check = isSlotValidForAssignment(assignment, day, ts.id);
            if (!check.ok || !check.roomId) {
              allValid = false;
              break;
            }
            chosenRooms.push(check.roomId);
          }

          if (allValid) {
            for (let k = 0; k < candidateSlots.length; k++) {
              const ts = candidateSlots[k];
              const roomId = chosenRooms[k];
              generated.push({
                activeDayId: day.id,
                timeSlotId: ts.id,
                teacherId: assignment.teacherId,
                subjectId: assignment.subjectId,
                classGroupId: assignment.classGroupId,
                roomId,
              });
              busyTeacherSlot.add(`${ts.id}_${assignment.teacherId}`);
              busyClassSlot.add(`${ts.id}_${assignment.classGroupId}`);
              busyRoomSlot.add(`${ts.id}_${roomId}`);
              teacherTotalCount.set(
                assignment.teacherId,
                (teacherTotalCount.get(assignment.teacherId) || 0) + 1
              );
              classDaySubjectCount.set(daySubKey, (classDaySubjectCount.get(daySubKey) || 0) + 1);
              remaining--;
              scheduledForThis++;
              totalScheduledPeriods++;
            }
            placedInDay = true;
            break;
          }
        }
        if (placedInDay) break;
      }
    }

    // Tahap 2: Jika masih ada sisa JP yang belum terjadwal, cari slot kosong mana saja di hari aktif guru
    if (remaining > 0) {
      for (const day of activeDays) {
        if (remaining <= 0) break;
        for (const ts of day.teachingSlots) {
          if (remaining <= 0) break;
          const check = isSlotValidForAssignment(assignment, day, ts.id);
          if (check.ok && check.roomId) {
            generated.push({
              activeDayId: day.id,
              timeSlotId: ts.id,
              teacherId: assignment.teacherId,
              subjectId: assignment.subjectId,
              classGroupId: assignment.classGroupId,
              roomId: check.roomId,
            });
            busyTeacherSlot.add(`${ts.id}_${assignment.teacherId}`);
            busyClassSlot.add(`${ts.id}_${assignment.classGroupId}`);
            busyRoomSlot.add(`${ts.id}_${check.roomId}`);
            remaining--;
            scheduledForThis++;
            totalScheduledPeriods++;
          }
        }
      }
    }

    if (remaining > 0) {
      const teacherActiveDays = assignment.teacher ? parseJsonNumberArray(assignment.teacher.activeDays) : [1, 2, 3, 4, 5, 6];
      const teacherName = assignment.teacher ? assignment.teacher.name : '(Belum Ditentukan)';
      unscheduled.push({
        assignmentId: assignment.id,
        teacherName: teacherName,
        subjectName: assignment.subject.name,
        className: assignment.classGroup.name,
        requestedPeriods: assignment.totalPeriods - alreadyLockedCount,
        scheduledPeriods: scheduledForThis,
        reason:
          teacherActiveDays.length === 0
            ? `Guru ${teacherName} tidak memiliki hari aktif sama sekali.`
            : rooms.length === 0
            ? 'Belum ada data Ruangan yang tersedia.'
            : `Slot jam untuk Kelas ${assignment.classGroup.name} / ${teacherName} sudah penuh.`,
      });
    }
  }

  return {
    generated,
    unscheduled,
    totalRequestedPeriods,
    totalScheduledPeriods,
  };
}
