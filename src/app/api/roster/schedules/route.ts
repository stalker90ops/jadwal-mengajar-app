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
    return NextResponse.json({ schedules, audit });
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
        return NextResponse.json({
          success: true,
          valid: errorConflicts.length === 0,
          conflicts,
          item: created,
        });
      }

      if (action === 'update') {
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
        return NextResponse.json({
          success: true,
          valid: errorConflicts.length === 0,
          conflicts,
          item: updated,
        });
      }
    }

    if (action === 'delete') {
      await prisma.schedule.delete({ where: { id: data.id } });
      return NextResponse.json({ success: true });
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
          prisma.subject.findMany(),
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
        assignments,
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
