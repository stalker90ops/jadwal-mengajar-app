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

export type SchedulerTimeSlot = SchedulerDay['timeSlots'][number];

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
  // JSON array berisi periodNumber slot jam pilihan, misal "[1,2,3]" - jika kosong = bebas
  preferredTimeSlotPeriods?: string;
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
        .filter(
          (ts) =>
            !ts.isBreak &&
            !['istirahat', 'ishoma', 'upacara', 'literasi'].some((k) =>
              ts.label.toLowerCase().includes(k)
            )
        )
        .sort((a, b) => a.periodNumber - b.periodNumber),
    }));

  // Lacak penggunaan slot agar O(1) saat pengecekan bentrok
  const busyTeacherSlot = new Set<string>(); // `${timeSlotId}_${teacherId}`
  const busyClassSlot = new Set<string>();   // `${timeSlotId}_${classGroupId}`
  const busyRoomSlot = new Set<string>();    // `${timeSlotId}_${roomId}`
  const teacherTotalCount = new Map<string, number>();
  const classDaySubjectCount = new Map<string, number>(); // `${activeDayId}_${classGroupId}_${subjectId}`

  // Lacak berapa hari yang sudah dipakai per rombel (untuk distribusi merata)
  // Key: `${classGroupId}_${activeDayId}` → jumlah JP di hari itu
  const classDayUsage = new Map<string, number>(); // `${classGroupId}_${activeDayId}` → jumlah JP

  // Masukkan jadwal yang sudah dikunci (locked) terlebih dahulu
  for (const locked of lockedSchedules) {
    busyTeacherSlot.add(`${locked.timeSlotId}_${locked.teacherId}`);
    busyClassSlot.add(`${locked.timeSlotId}_${locked.classGroupId}`);
    busyRoomSlot.add(`${locked.timeSlotId}_${locked.roomId}`);
    teacherTotalCount.set(locked.teacherId, (teacherTotalCount.get(locked.teacherId) || 0) + 1);
    const daySubKey = `${locked.activeDayId}_${locked.classGroupId}_${locked.subjectId}`;
    classDaySubjectCount.set(daySubKey, (classDaySubjectCount.get(daySubKey) || 0) + 1);
    const dayUsageKey = `${locked.classGroupId}_${locked.activeDayId}`;
    classDayUsage.set(dayUsageKey, (classDayUsage.get(dayUsageKey) || 0) + 1);
  }

  // Urutkan assignment dari yang paling ketat kendalanya (Most-Constrained Variable First):
  // 1. Guru dengan jumlah hari aktif paling sedikit
  // 2. Mapel yang butuh Lab / preferredRoom
  // 3. Mapel umum dengan blok jam wajib berurutan (prioritas agar dapat blok utuh tidak terjepit)
  // 4. Jumlah totalPeriods terbesar
  const sortedAssignments = [...assignments].sort((a, b) => {
    const aDays = a.teacher ? parseJsonNumberArray(a.teacher.activeDays).length : 7;
    const bDays = b.teacher ? parseJsonNumberArray(b.teacher.activeDays).length : 7;
    if (aDays !== bDays) return aDays - bDays;

    const aSpecialRoom = a.preferredRoomId || a.subject.requiresLab ? 1 : 0;
    const bSpecialRoom = b.preferredRoomId || b.subject.requiresLab ? 1 : 0;
    if (aSpecialRoom !== bSpecialRoom) return bSpecialRoom - aSpecialRoom;

    const aIsUmum = a.subject.category === 'UMUM' ? 1 : 0;
    const bIsUmum = b.subject.category === 'UMUM' ? 1 : 0;
    if (aIsUmum !== bIsUmum) return bIsUmum - aIsUmum;

    return b.totalPeriods - a.totalPeriods;
  });

  const generated: GeneratedSlotItem[] = [];
  const unscheduled: UnscheduledReport[] = [];
  let totalRequestedPeriods = 0;
  let totalScheduledPeriods = 0;

  // Fungsi memilih ruangan konsisten yang kosong untuk seluruh slot dalam satu blok berurutan
  function findBlockRoom(
    assignment: SchedulerAssignment,
    candidateSlots: SchedulerTimeSlot[]
  ): string | null {
    // 1. Jika ada preferredRoomId pada beban mengajar
    if (assignment.preferredRoomId) {
      if (candidateSlots.every((ts) => !busyRoomSlot.has(`${ts.id}_${assignment.preferredRoomId}`))) {
        return assignment.preferredRoomId;
      }
    }

    // 2. Jika mapel membutuhkan Lab, prioritaskan ruangan bertipe LAB
    if (assignment.subject.requiresLab) {
      const labRooms = rooms.filter((r) => r.type.toUpperCase().includes('LAB'));
      for (const lab of labRooms) {
        if (candidateSlots.every((ts) => !busyRoomSlot.has(`${ts.id}_${lab.id}`))) {
          return lab.id;
        }
      }
    }

    // 3. Gunakan ruangan default milik Kelas/Rombel
    if (assignment.classGroup.defaultRoomId) {
      if (candidateSlots.every((ts) => !busyRoomSlot.has(`${ts.id}_${assignment.classGroup.defaultRoomId}`))) {
        return assignment.classGroup.defaultRoomId;
      }
    }

    // 4. Cari ruangan teori
    const theoryRooms = rooms.filter((r) => r.type === 'TEORI');
    for (const r of theoryRooms) {
      if (candidateSlots.every((ts) => !busyRoomSlot.has(`${ts.id}_${r.id}`))) {
        return r.id;
      }
    }

    // 5. Ruangan apa saja yang kosong untuk seluruh blok
    for (const r of rooms) {
      if (candidateSlots.every((ts) => !busyRoomSlot.has(`${ts.id}_${r.id}`))) {
        return r.id;
      }
    }

    return null;
  }

  // Fungsi pengecekan apakah kandidat blok slot berurutan valid untuk guru dan kelas
  function canPlaceBlock(
    assignment: SchedulerAssignment,
    day: SchedulerDay,
    candidateSlots: SchedulerTimeSlot[]
  ): { ok: boolean; roomId: string | null } {
    if (assignment.teacher && assignment.teacherId) {
      const teacherActiveDays = parseJsonNumberArray(assignment.teacher.activeDays);
      if (!teacherActiveDays.includes(day.dayNumber)) {
        return { ok: false, roomId: null };
      }

      const teacherUnavailable = parseJsonStringArray(assignment.teacher.unavailableSlots);
      for (const ts of candidateSlots) {
        if (teacherUnavailable.includes(ts.id)) {
          return { ok: false, roomId: null };
        }
        if (busyTeacherSlot.has(`${ts.id}_${assignment.teacherId}`)) {
          return { ok: false, roomId: null };
        }
      }
    }

    for (const ts of candidateSlots) {
      if (busyClassSlot.has(`${ts.id}_${assignment.classGroupId}`)) {
        return { ok: false, roomId: null };
      }
    }

    const roomId = findBlockRoom(assignment, candidateSlots);
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

    if (remaining <= 0) continue;

    const isGeneral = assignment.subject.category === 'UMUM';

    // Parse preferred time slot periods (dari CurriculumStandard via field di assignment)
    const preferredPeriods = parseJsonNumberArray(assignment.preferredTimeSlotPeriods || '[]');

    // Rancang rencana blok jam berurutan (tidak boleh ada mapel yang dipecah tercecer 1 JP)
    // Sesuai preferensi: Mapel umum 4 JP diutamakan 1 hari 4 JP berurutan (fallback: 2 JP + 2 JP berurutan di 2 hari)
    let blockPlans: number[][] = [];
    if (isGeneral) {
      if (remaining === 4) {
        blockPlans = [[4], [2, 2]];
      } else if (remaining === 3) {
        blockPlans = [[3]];
      } else if (remaining === 2) {
        blockPlans = [[2]];
      } else if (remaining === 1) {
        blockPlans = [[1]];
      } else if (remaining >= 6) {
        blockPlans = [[remaining], [3, 3], [4, 2]];
      } else {
        blockPlans = [[remaining]];
      }
    } else {
      // Mapel Kejuruan / Produktif / Lainnya (blok besar, minimal 2 JP)
      if (remaining >= 6) {
        blockPlans = [[remaining], [4, remaining - 4], [3, 3]];
      } else if (remaining === 5) {
        blockPlans = [[3, 2]];
      } else if (remaining === 4) {
        blockPlans = [[4], [2, 2]];
      } else if (remaining === 3) {
        blockPlans = [[3]];
      } else if (remaining === 2) {
        blockPlans = [[2]];
      } else {
        blockPlans = [[remaining]];
      }
    }

    // Fungsi penempatan blok jam berurutan secara atomik (rollback jika blok gagal lengkap)
    // Prioritas hari: urutkan aktiveDays berdasarkan usage terkecil dulu (distribusi merata)
    const tryScheduleBlocks = (blockPlan: number[]): boolean => {
      const tempGenerated: GeneratedSlotItem[] = [];
      const tempBusyTeacher = new Set<string>();
      const tempBusyClass = new Set<string>();
      const tempBusyRoom = new Set<string>();
      const tempClassDayCount = new Map<string, number>();
      const tempDayUsage = new Map<string, number>();

      let successAll = true;

      for (const blockSize of blockPlan) {
        let placedBlock = false;

        // Strategi Distribusi Sama Rata (Balanced Daily Load Senin - Jumat):
        // Pastikan semua slot di hari Senin s/d Jumat terisi dan jumlah jam tatap muka per hari sama rata
        const sortedDays = [...activeDays].sort((a, b) => {
          const usageA =
            (classDayUsage.get(`${assignment.classGroupId}_${a.id}`) || 0) +
            (tempDayUsage.get(`${assignment.classGroupId}_${a.id}`) || 0);
          const usageB =
            (classDayUsage.get(`${assignment.classGroupId}_${b.id}`) || 0) +
            (tempDayUsage.get(`${assignment.classGroupId}_${b.id}`) || 0);

          // 1. Hari dengan jam paling sedikit diisi duluan agar beban tiap hari berimbang dan sama rata
          if (usageA !== usageB) {
            return usageA - usageB;
          }

          // 2. Jika beban jam sama, ikuti urutan hari sekolah (Senin -> Selasa -> dst)
          return a.dayNumber - b.dayNumber;
        });

        for (const day of sortedDays) {
          if (assignment.teacher) {
            const teacherActiveDays = parseJsonNumberArray(assignment.teacher.activeDays);
            if (!teacherActiveDays.includes(day.dayNumber)) continue;
          }

          const daySubKey = `${day.id}_${assignment.classGroupId}_${assignment.subjectId}`;
          const countToday =
            (classDaySubjectCount.get(daySubKey) || 0) +
            (tempClassDayCount.get(daySubKey) || 0);

          // Jika ada lebih dari 1 blok pertemuan dalam seminggu, sebar ke hari yang berbeda
          if (countToday > 0 && blockPlan.length > 1) {
            continue;
          }

          const allSlots = day.teachingSlots;

          // Siapkan dua lintasan pencarian slot:
          // Lintasan 1: Coba letakkan di slot jam pilihan pengguna (Slot Pinning, misal Jam 1,2,3)
          // Lintasan 2: Jika slot pilihan bentrok, fallback ke seluruh slot kosong di hari tersebut
          const attempts: SchedulerTimeSlot[][] = [];
          if (preferredPeriods.length > 0) {
            const pinnedSlots = allSlots.filter((ts) => preferredPeriods.includes(ts.periodNumber));
            if (pinnedSlots.length >= blockSize) {
              attempts.push(pinnedSlots);
            }
          }
          attempts.push(allSlots);

          for (const candidateSlotsPool of attempts) {
            for (let startIdx = 0; startIdx <= candidateSlotsPool.length - blockSize; startIdx++) {
              const candidateSlots = candidateSlotsPool.slice(startIdx, startIdx + blockSize);

              // Pastikan slot benar-benar berurutan (periodNumber consecutive)
              const isConsecutive = candidateSlots.every(
                (ts, i) => i === 0 || ts.periodNumber === candidateSlots[i - 1].periodNumber + 1
              );
              if (!isConsecutive) continue;

              const hasConflictWithTemp = candidateSlots.some(
                (ts) =>
                  tempBusyTeacher.has(`${ts.id}_${assignment.teacherId}`) ||
                  tempBusyClass.has(`${ts.id}_${assignment.classGroupId}`)
              );
              if (hasConflictWithTemp) continue;

              const check = canPlaceBlock(assignment, day, candidateSlots);
              if (check.ok && check.roomId) {
                const roomId = check.roomId;
                if (candidateSlots.some((ts) => tempBusyRoom.has(`${ts.id}_${roomId}`))) {
                  continue;
                }

                for (const ts of candidateSlots) {
                  tempGenerated.push({
                    activeDayId: day.id,
                    timeSlotId: ts.id,
                    teacherId: assignment.teacherId!,
                    subjectId: assignment.subjectId,
                    classGroupId: assignment.classGroupId,
                    roomId,
                  });
                  tempBusyTeacher.add(`${ts.id}_${assignment.teacherId}`);
                  tempBusyClass.add(`${ts.id}_${assignment.classGroupId}`);
                  tempBusyRoom.add(`${ts.id}_${roomId}`);
                }

                tempClassDayCount.set(daySubKey, countToday + blockSize);
                const dayUsageKey = `${assignment.classGroupId}_${day.id}`;
                tempDayUsage.set(dayUsageKey, (tempDayUsage.get(dayUsageKey) || 0) + blockSize);
                placedBlock = true;
                break;
              }
            }
            if (placedBlock) break;
          }

          if (placedBlock) break;
        }

        if (!placedBlock) {
          successAll = false;
          break;
        }
      }

      if (successAll) {
        for (const g of tempGenerated) {
          generated.push(g);
          busyTeacherSlot.add(`${g.timeSlotId}_${g.teacherId}`);
          busyClassSlot.add(`${g.timeSlotId}_${g.classGroupId}`);
          busyRoomSlot.add(`${g.timeSlotId}_${g.roomId}`);
          teacherTotalCount.set(g.teacherId, (teacherTotalCount.get(g.teacherId) || 0) + 1);
          const key = `${g.activeDayId}_${g.classGroupId}_${g.subjectId}`;
          classDaySubjectCount.set(key, (classDaySubjectCount.get(key) || 0) + 1);
          const dayUsageKey = `${g.classGroupId}_${g.activeDayId}`;
          classDayUsage.set(dayUsageKey, (classDayUsage.get(dayUsageKey) || 0) + 1);
          remaining--;
          scheduledForThis++;
          totalScheduledPeriods++;
        }
        return true;
      }

      return false;
    };

    // Eksekusi pemilihan rencana blok
    let isScheduled = false;
    for (const plan of blockPlans) {
      if (tryScheduleBlocks(plan)) {
        isScheduled = true;
        break;
      }
    }

    if (remaining > 0) {
      const teacherActiveDays = assignment.teacher
        ? parseJsonNumberArray(assignment.teacher.activeDays)
        : [1, 2, 3, 4, 5, 6];
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
            : `Mapel ${assignment.subject.name} (${assignment.subject.category}) membutuhkan ${blockPlans[0]?.join('+') || assignment.totalPeriods} JP berurutan untuk kelas ${assignment.classGroup.name}, namun slot berurutan tidak tersedia di hari aktif guru.`,
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
