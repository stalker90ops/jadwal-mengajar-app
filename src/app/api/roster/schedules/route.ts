import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  auditAllSchedules,
  ScheduleWithRelations,
  validateScheduleCandidate,
} from '@/lib/schedule-validator';
import { generateConflictFreeSchedule } from '@/lib/auto-scheduler';

async function getFullSchedules(): Promise<ScheduleWithRelations[]> {
  const rows = await prisma.schedule.findMany({
    include: {
      activeDay: true,
      timeSlot: true,
      teacher: true,
      subject: true,
      classGroup: true,
      room: true,
    },
    orderBy: [
      { activeDay: { dayNumber: 'asc' } },
      { timeSlot: { periodNumber: 'asc' } },
    ],
  });
  return rows as unknown as ScheduleWithRelations[];
}

export async function GET() {
  try {
    const schedules = await getFullSchedules();
    const audit = auditAllSchedules(schedules);
    return NextResponse.json(
      { schedules, audit },
      {
        headers: {
          'Cache-Control': 'private, no-cache, stale-while-revalidate=15',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching schedules:', error);
    return NextResponse.json({ error: 'Gagal memuat jadwal' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, data } = body;

    if (action === 'create' || action === 'update' || action === 'validate') {
      const {
        id,
        activeDayId,
        timeSlotId,
        teacherId,
        subjectId,
        classGroupId,
        roomId,
        notes,
        isLocked,
        force,
      } = data;

      const [activeDay, timeSlot, teacher, subject, classGroup, room, existingSchedules] =
        await Promise.all([
          prisma.activeDay.findUnique({ where: { id: activeDayId } }),
          prisma.timeSlot.findUnique({ where: { id: timeSlotId } }),
          prisma.teacher.findUnique({ where: { id: teacherId } }),
          prisma.subject.findUnique({ where: { id: subjectId } }),
          prisma.classGroup.findUnique({ where: { id: classGroupId } }),
          prisma.room.findUnique({ where: { id: roomId } }),
          getFullSchedules(),
        ]);

      if (!activeDay || !timeSlot || !teacher || !subject || !classGroup || !room) {
        return NextResponse.json(
          { error: 'Data Hari, Jam Pelajaran, Guru, Mapel, Kelas, atau Ruangan tidak lengkap/tidak ditemukan.' },
          { status: 400 }
        );
      }

      const conflicts = validateScheduleCandidate({
        candidate: {
          id,
          activeDayId,
          timeSlotId,
          teacherId,
          subjectId,
          classGroupId,
          roomId,
        },
        existingSchedules,
        activeDay,
        timeSlot,
        teacher,
        classGroup,
        room,
        subject,
      });

      const errorConflicts = conflicts.filter((c) => c.severity === 'ERROR');

      if (action === 'validate') {
        return NextResponse.json({
          valid: errorConflicts.length === 0,
          conflicts,
        });
      }

      if (errorConflicts.length > 0 && !force) {
        return NextResponse.json(
          {
            valid: false,
            error: errorConflicts[0].message,
            conflicts,
          },
          { status: 409 }
        );
      }

      if (action === 'create') {
        // Validasi Batasan Kuota Beban Mengajar (JP)
        const assignment = await prisma.teachingAssignment.findFirst({
          where: { classGroupId, subjectId },
        });
        if (assignment) {
          const scheduledCount = await prisma.schedule.count({
            where: { classGroupId, subjectId },
          });
          if (scheduledCount + 1 > assignment.totalPeriods) {
            const sisa = Math.max(0, assignment.totalPeriods - scheduledCount);
            return NextResponse.json(
              {
                error: `Jumlah jam melebihi beban JP (${assignment.totalPeriods} JP). Sisa kuota hanya ${sisa} JP.`,
              },
              { status: 400 }
            );
          }
        }

        const created = await prisma.schedule.create({
          data: {
            activeDayId,
            timeSlotId,
            teacherId,
            subjectId,
            classGroupId,
            roomId,
            notes: notes || null,
            isLocked: Boolean(isLocked),
          },
        });

        // Sinkronisasi otomatis guru ke Beban Mengajar jika sebelumnya TBD (belum ada guru)
        let autoAssignedTeacher = false;
        if (teacherId) {
          const unassignedAssignment = await prisma.teachingAssignment.findFirst({
            where: {
              classGroupId,
              subjectId,
              OR: [{ teacherId: null }, { teacherId: '' }],
            },
          });
          if (unassignedAssignment) {
            await prisma.teachingAssignment.update({
              where: { id: unassignedAssignment.id },
              data: { teacherId },
            });
            autoAssignedTeacher = true;
          }
        }

        return NextResponse.json({
          success: true,
          valid: errorConflicts.length === 0,
          conflicts,
          item: created,
          message: `Jadwal berhasil disimpan!${
            autoAssignedTeacher
              ? ` Guru ${teacher.name} otomatis ditetapkan pada Beban Mengajar.`
              : ''
          }`,
        });
      }

      if (action === 'update') {
        const assignment = await prisma.teachingAssignment.findFirst({
          where: { classGroupId, subjectId },
        });
        if (assignment) {
          const scheduledCount = await prisma.schedule.count({
            where: {
              classGroupId,
              subjectId,
              id: { not: id },
            },
          });
          if (scheduledCount + 1 > assignment.totalPeriods) {
            const sisa = Math.max(0, assignment.totalPeriods - scheduledCount);
            return NextResponse.json(
              {
                error: `Jumlah jam melebihi beban JP (${assignment.totalPeriods} JP). Sisa kuota hanya ${sisa} JP.`,
              },
              { status: 400 }
            );
          }
        }

        const updated = await prisma.schedule.update({
          where: { id },
          data: {
            activeDayId,
            timeSlotId,
            teacherId,
            subjectId,
            classGroupId,
            roomId,
            notes: notes || null,
            ...(isLocked !== undefined ? { isLocked: Boolean(isLocked) } : {}),
          },
        });

        let autoAssignedTeacher = false;
        if (teacherId) {
          const unassignedAssignment = await prisma.teachingAssignment.findFirst({
            where: {
              classGroupId,
              subjectId,
              OR: [{ teacherId: null }, { teacherId: '' }],
            },
          });
          if (unassignedAssignment) {
            await prisma.teachingAssignment.update({
              where: { id: unassignedAssignment.id },
              data: { teacherId },
            });
            autoAssignedTeacher = true;
          }
        }

        return NextResponse.json({
          success: true,
          valid: errorConflicts.length === 0,
          conflicts,
          item: updated,
          message: `Jadwal berhasil diperbarui!${
            autoAssignedTeacher
              ? ` Guru ${teacher.name} otomatis ditetapkan pada Beban Mengajar.`
              : ''
          }`,
        });
      }
    }

    if (action === 'delete') {
      await prisma.schedule.delete({ where: { id: data.id } });
      return NextResponse.json({ success: true });
    }

    if (action === 'create_batch') {
      const {
        activeDayId,
        timeSlotIds,
        teacherId,
        subjectId,
        classGroupId,
        roomId,
        notes,
        isLocked,
        force,
      } = data;

      if (
        !activeDayId ||
        !Array.isArray(timeSlotIds) ||
        timeSlotIds.length === 0 ||
        !teacherId ||
        !subjectId ||
        !classGroupId ||
        !roomId
      ) {
        return NextResponse.json(
          { error: 'Data Hari, Rentang Jam, Guru, Mapel, Kelas, atau Ruangan tidak lengkap.' },
          { status: 400 }
        );
      }

      const [activeDay, teacher, subject, classGroup, room, existingSchedules] =
        await Promise.all([
          prisma.activeDay.findUnique({
            where: { id: activeDayId },
            include: { timeSlots: true },
          }),
          prisma.teacher.findUnique({ where: { id: teacherId } }),
          prisma.subject.findUnique({ where: { id: subjectId } }),
          prisma.classGroup.findUnique({ where: { id: classGroupId } }),
          prisma.room.findUnique({ where: { id: roomId } }),
          getFullSchedules(),
        ]);

      if (!activeDay || !teacher || !subject || !classGroup || !room) {
        return NextResponse.json(
          { error: 'Entitas Master tidak ditemukan.' },
          { status: 400 }
        );
      }

      // Ambil hanya slot non-break dari timeSlotIds yang dikirimkan (otomatis skip istirahat)
      const validSlots = activeDay.timeSlots
        .filter(
          (ts) =>
            timeSlotIds.includes(ts.id) &&
            !ts.isBreak &&
            !['istirahat', 'ishoma', 'upacara', 'literasi'].some((k) =>
              ts.label.toLowerCase().includes(k)
            )
        )
        .sort((a, b) => a.periodNumber - b.periodNumber);

      if (validSlots.length === 0) {
        return NextResponse.json(
          {
            error:
              'Tidak ada slot jam efektif mengajar pada rentang yang dipilih (semua merupakan waktu istirahat).',
          },
          { status: 400 }
        );
      }

      // Validasi Batasan Kuota Beban Mengajar (JP)
      const assignment = await prisma.teachingAssignment.findFirst({
        where: { classGroupId, subjectId },
      });
      if (assignment) {
        const scheduledCount = await prisma.schedule.count({
          where: { classGroupId, subjectId },
        });
        if (scheduledCount + validSlots.length > assignment.totalPeriods) {
          const sisa = Math.max(0, assignment.totalPeriods - scheduledCount);
          return NextResponse.json(
            {
              error: `Jumlah total jam efektif (${validSlots.length} JP) melebihi batas beban mengajar (${assignment.totalPeriods} JP). Sisa kuota hanya ${sisa} JP.`,
            },
            { status: 400 }
          );
        }
      }

      const createdItems: any[] = [];
      const allConflicts: any[] = [];

      for (const slot of validSlots) {
        const conflicts = validateScheduleCandidate({
          candidate: {
            activeDayId,
            timeSlotId: slot.id,
            teacherId,
            subjectId,
            classGroupId,
            roomId,
          },
          existingSchedules: [...existingSchedules, ...createdItems],
          activeDay,
          timeSlot: slot,
          teacher,
          classGroup,
          room,
          subject,
        });

        const errorConflicts = conflicts.filter((c) => c.severity === 'ERROR');
        allConflicts.push(...conflicts);

        if (errorConflicts.length > 0 && !force) {
          return NextResponse.json(
            {
              valid: false,
              error: `Slot ${slot.label}: ${errorConflicts[0].message}`,
              conflicts: allConflicts,
            },
            { status: 409 }
          );
        }

        const item = await prisma.schedule.create({
          data: {
            activeDayId,
            timeSlotId: slot.id,
            teacherId,
            subjectId,
            classGroupId,
            roomId,
            notes: notes || null,
            isLocked: Boolean(isLocked),
          },
        });
        createdItems.push(item);
      }

      // Sinkronisasi otomatis guru ke Beban Mengajar jika sebelumnya TBD (belum ada guru)
      let autoAssignedTeacher = false;
      if (teacherId) {
        const unassignedAssignment = await prisma.teachingAssignment.findFirst({
          where: {
            classGroupId,
            subjectId,
            OR: [{ teacherId: null }, { teacherId: '' }],
          },
        });
        if (unassignedAssignment) {
          await prisma.teachingAssignment.update({
            where: { id: unassignedAssignment.id },
            data: { teacherId },
          });
          autoAssignedTeacher = true;
        }
      }

      return NextResponse.json({
        success: true,
        valid: allConflicts.filter((c) => c.severity === 'ERROR').length === 0,
        message: `Berhasil menambahkan ${createdItems.length} slot jadwal sekaligus.${
          autoAssignedTeacher
            ? ` Guru ${teacher.name} otomatis ditetapkan pada Beban Mengajar.`
            : ''
        }`,
        createdCount: createdItems.length,
        items: createdItems,
        conflicts: allConflicts,
      });
    }

    if (action === 'toggle_lock') {
      const updated = await prisma.schedule.update({
        where: { id: data.id },
        data: { isLocked: Boolean(data.isLocked) },
      });
      return NextResponse.json({ success: true, item: updated });
    }

    if (action === 'clear_unlocked') {
      const deleted = await prisma.schedule.deleteMany({
        where: { isLocked: false },
      });
      return NextResponse.json({
        success: true,
        message: `${deleted.count} jadwal yang tidak dikunci berhasil dibersihkan.`,
      });
    }

    if (action === 'auto_generate') {
      // Hapus semua jadwal yang tidak dikunci
      await prisma.schedule.deleteMany({
        where: { isLocked: false },
      });

      const [days, teachers, subjects, rooms, classes, assignments, lockedRows] =
        await Promise.all([
          prisma.activeDay.findMany({
            orderBy: { dayNumber: 'asc' },
            include: {
              timeSlots: {
                orderBy: { periodNumber: 'asc' },
              },
            },
          }),
          prisma.teacher.findMany(),
          prisma.subject.findMany({
            include: { curriculumStandards: true },
          }),
          prisma.room.findMany(),
          prisma.classGroup.findMany(),
          prisma.teachingAssignment.findMany({
            include: {
              teacher: true,
              subject: true,
              classGroup: true,
            },
          }),
          prisma.schedule.findMany({
            where: { isLocked: true },
          }),
        ]);

      if (assignments.length === 0) {
        return NextResponse.json(
          {
            error:
              'Belum ada data Beban Mengajar (Alokasi JP). Silakan tambahkan beban mengajar terlebih dahulu atau klik "Muat Data Contoh".',
          },
          { status: 400 }
        );
      }

      const result = generateConflictFreeSchedule({
        days,
        teachers,
        subjects,
        rooms,
        classes,
        assignments: assignments.map((a) => ({
          ...a,
          // Pass preferredTimeSlotPeriods dari CurriculumStandard yang sesuai grade rombel
          preferredTimeSlotPeriods: (() => {
            // Ambil dari subject.curriculumStandards jika ada (di-include dari Prisma)
            const subjectWithStandards = subjects.find((s) => s.id === a.subjectId) as any;
            const grade = a.classGroup?.grade;
            if (subjectWithStandards?.curriculumStandards && grade) {
              const std = subjectWithStandards.curriculumStandards.find(
                (cs: any) => cs.grade === grade
              );
              return std?.preferredTimeSlotPeriods || '[]';
            }
            return '[]';
          })(),
        })),
        lockedSchedules: lockedRows,
      });

      for (const item of result.generated) {
        await prisma.schedule.create({
          data: {
            activeDayId: item.activeDayId,
            timeSlotId: item.timeSlotId,
            teacherId: item.teacherId,
            subjectId: item.subjectId,
            classGroupId: item.classGroupId,
            roomId: item.roomId,
            isLocked: false,
          },
        });
      }

      return NextResponse.json({
        success: true,
        message: `Auto-Generate selesai! ${result.totalScheduledPeriods} dari ${result.totalRequestedPeriods} JP berhasil dijadwalkan tanpa bentrok.`,
        ...result,
      });
    }

    return NextResponse.json({ error: 'Aksi jadwal tidak valid' }, { status: 400 });
  } catch (error: any) {
    console.error('Schedule POST error:', error);
    return NextResponse.json(
      { error: error?.message || 'Gagal memproses jadwal' },
      { status: 500 }
    );
  }
}
