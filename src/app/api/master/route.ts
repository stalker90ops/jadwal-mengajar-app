import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { ensureDefaultActiveDays, seedSampleSchoolData, DEFAULT_TIME_SLOTS, FRIDAY_TIME_SLOTS } from '@/lib/seed-data';
import { auditAllSchedules, ScheduleWithRelations } from '@/lib/schedule-validator';
import { parseActiveDaysInput } from '@/lib/csv-helper';

let hasEnsuredActiveDays = false;

export async function GET() {
  try {
    if (!hasEnsuredActiveDays) {
      await ensureDefaultActiveDays();
      hasEnsuredActiveDays = true;
    }

    const [activeDays, teachers, subjects, rooms, classes, assignments, schedules, curriculumStandards] = await Promise.all([
      prisma.activeDay.findMany({
        orderBy: { dayNumber: 'asc' },
        include: {
          timeSlots: {
            orderBy: { periodNumber: 'asc' },
          },
        },
      }),
      prisma.teacher.findMany({
        orderBy: { code: 'asc' },
      }),
      prisma.subject.findMany({
        orderBy: { code: 'asc' },
        include: {
          curriculumStandards: true,
        },
      }),
      prisma.room.findMany({
        orderBy: { code: 'asc' },
      }),
      prisma.classGroup.findMany({
        orderBy: { code: 'asc' },
        include: {
          defaultRoom: true,
        },
      }),
      prisma.teachingAssignment.findMany({
        include: {
          teacher: true,
          subject: true,
          classGroup: true,
        },
        orderBy: [{ classGroup: { code: 'asc' } }, { subject: { code: 'asc' } }],
      }),
      prisma.schedule.findMany({
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
      }),
      prisma.curriculumStandard.findMany({
        include: {
          subject: true,
        },
      }),
    ]);

    const audit = auditAllSchedules(schedules as unknown as ScheduleWithRelations[]);

    return NextResponse.json(
      {
        activeDays,
        teachers,
        subjects,
        rooms,
        classes,
        assignments,
        schedules,
        curriculumStandards,
        audit,
      },
      {
        headers: {
          'Cache-Control': 'private, no-cache, stale-while-revalidate=15',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching master data:', error);
    return NextResponse.json({ error: 'Gagal memuat data master' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { entity, action, data } = body;

    if (entity === 'seed') {
      await seedSampleSchoolData();
      return NextResponse.json({
        success: true,
        message: 'Data contoh sekolah berhasil dimuat.',
      });
    }

    // ==================== GURU ====================
    if (entity === 'teacher') {
      if (action === 'create') {
        const activeDaysStr = Array.isArray(data.activeDays)
          ? JSON.stringify(data.activeDays)
          : data.activeDays || '[1,2,3,4,5]';
        const unavailableStr = Array.isArray(data.unavailableSlots)
          ? JSON.stringify(data.unavailableSlots)
          : data.unavailableSlots || '[]';

        const created = await prisma.teacher.create({
          data: {
            code: String(data.code).trim().toUpperCase(),
            nip: data.nip ? String(data.nip).trim() : null,
            name: String(data.name).trim(),
            phone: data.phone ? String(data.phone).trim() : null,
            maxPeriods: Number(data.maxPeriods) || 24,
            activeDays: activeDaysStr,
            unavailableSlots: unavailableStr,
          },
        });
        return NextResponse.json({ success: true, item: created });
      }

      if (action === 'update') {
        const activeDaysStr = Array.isArray(data.activeDays)
          ? JSON.stringify(data.activeDays)
          : data.activeDays;
        const unavailableStr = Array.isArray(data.unavailableSlots)
          ? JSON.stringify(data.unavailableSlots)
          : data.unavailableSlots;

        const updated = await prisma.teacher.update({
          where: { id: data.id },
          data: {
            code: String(data.code).trim().toUpperCase(),
            nip: data.nip ? String(data.nip).trim() : null,
            name: String(data.name).trim(),
            phone: data.phone ? String(data.phone).trim() : null,
            maxPeriods: Number(data.maxPeriods) || 24,
            ...(activeDaysStr !== undefined ? { activeDays: activeDaysStr } : {}),
            ...(unavailableStr !== undefined ? { unavailableSlots: unavailableStr } : {}),
          },
        });
        return NextResponse.json({ success: true, item: updated });
      }

      if (action === 'delete') {
        await prisma.teacher.delete({ where: { id: data.id } });
        return NextResponse.json({ success: true });
      }

      if (action === 'import') {
        const rows = Array.isArray(data.rows) ? data.rows : [];
        let imported = 0;
        for (const r of rows) {
          const code = (r.kode_guru || r.kode || r.code || '').trim().toUpperCase();
          const name = (r.nama_guru || r.nama || r.name || '').trim();
          if (!code || !name) continue;
          const nip = (r.nip || '').trim() || null;
          const phone = (r.no_hp || r.telepon || r.phone || '').trim() || null;
          const maxPeriods = Number(r.maks_jp || r.max_jp || r.maxperiods) || 24;
          const rawDays = r.hari_aktif || r.hari_keaktifan || r.activedays || 'Senin,Selasa,Rabu,Kamis,Jumat';
          const parsedDays = parseActiveDaysInput(rawDays);

          await prisma.teacher.upsert({
            where: { code },
            update: {
              name,
              nip,
              phone,
              maxPeriods,
              activeDays: JSON.stringify(parsedDays),
            },
            create: {
              code,
              name,
              nip,
              phone,
              maxPeriods,
              activeDays: JSON.stringify(parsedDays),
            },
          });
          imported++;
        }
        return NextResponse.json({
          success: true,
          message: `Berhasil mengimpor ${imported} data guru beserta hari keaktifannya.`,
        });
      }
    }

    // ==================== MATA PELAJARAN ====================
    if (entity === 'subject') {
      if (action === 'create') {
        const created = await prisma.subject.create({
          data: {
            code: String(data.code).trim().toUpperCase(),
            name: String(data.name).trim(),
            category: data.category || 'UMUM',
            color: data.color || '#2563eb',
            requiresLab: Boolean(data.requiresLab),
          },
        });
        return NextResponse.json({ success: true, item: created });
      }

      if (action === 'update') {
        const updated = await prisma.subject.update({
          where: { id: data.id },
          data: {
            code: String(data.code).trim().toUpperCase(),
            name: String(data.name).trim(),
            category: data.category || 'UMUM',
            color: data.color || '#2563eb',
            requiresLab: Boolean(data.requiresLab),
          },
        });
        return NextResponse.json({ success: true, item: updated });
      }

      if (action === 'delete') {
        await prisma.subject.delete({ where: { id: data.id } });
        return NextResponse.json({ success: true });
      }

      if (action === 'import') {
        const rows = Array.isArray(data.rows) ? data.rows : [];
        const palette = ['#2563eb', '#059669', '#7c3aed', '#0891b2', '#d97706', '#dc2626', '#db2777', '#4f46e5'];
        let imported = 0;
        for (const r of rows) {
          const code = (r.kode_mapel || r.kode || r.code || '').trim().toUpperCase();
          const name = (r.nama_mapel || r.nama || r.name || '').trim();
          if (!code || !name) continue;
          const category = (r.kategori || r.category || 'UMUM').trim().toUpperCase();
          const color = (r.warna || r.color || palette[imported % palette.length]).trim();
          const reqLabRaw = String(r.butuh_lab || r.requires_lab || r.lab || '').toLowerCase();
          const requiresLab = reqLabRaw === 'ya' || reqLabRaw === 'true' || reqLabRaw === '1' || reqLabRaw === 'yes';

          await prisma.subject.upsert({
            where: { code },
            update: { name, category, color, requiresLab },
            create: { code, name, category, color, requiresLab },
          });
          imported++;
        }
        return NextResponse.json({
          success: true,
          message: `Berhasil mengimpor ${imported} data mata pelajaran.`,
        });
      }
    }

    // ==================== RUANGAN ====================
    if (entity === 'room') {
      if (action === 'create') {
        const created = await prisma.room.create({
          data: {
            code: String(data.code).trim().toUpperCase(),
            name: String(data.name).trim(),
            type: data.type || 'TEORI',
            capacity: Number(data.capacity) || 36,
          },
        });
        return NextResponse.json({ success: true, item: created });
      }

      if (action === 'update') {
        const updated = await prisma.room.update({
          where: { id: data.id },
          data: {
            code: String(data.code).trim().toUpperCase(),
            name: String(data.name).trim(),
            type: data.type || 'TEORI',
            capacity: Number(data.capacity) || 36,
          },
        });
        return NextResponse.json({ success: true, item: updated });
      }

      if (action === 'delete') {
        await prisma.room.delete({ where: { id: data.id } });
        return NextResponse.json({ success: true });
      }

      if (action === 'import') {
        const rows = Array.isArray(data.rows) ? data.rows : [];
        let imported = 0;
        for (const r of rows) {
          const code = (r.kode_ruangan || r.kode_ruang || r.kode || r.code || '').trim().toUpperCase();
          const name = (r.nama_ruangan || r.nama_ruang || r.nama || r.name || '').trim();
          if (!code || !name) continue;
          const type = (r.tipe || r.jenis || r.type || 'TEORI').trim().toUpperCase();
          const capacity = Number(r.kapasitas || r.capacity) || 36;

          await prisma.room.upsert({
            where: { code },
            update: { name, type, capacity },
            create: { code, name, type, capacity },
          });
          imported++;
        }
        return NextResponse.json({
          success: true,
          message: `Berhasil mengimpor ${imported} data ruangan.`,
        });
      }
    }

    // ==================== KELAS / ROMBEL ====================
    if (entity === 'class') {
      if (action === 'create') {
        const created = await prisma.classGroup.create({
          data: {
            code: String(data.code).trim().toUpperCase(),
            name: String(data.name).trim(),
            grade: String(data.grade || 'X').trim().toUpperCase(),
            defaultRoomId: data.defaultRoomId || null,
          },
        });
        return NextResponse.json({ success: true, item: created });
      }

      if (action === 'update') {
        const updated = await prisma.classGroup.update({
          where: { id: data.id },
          data: {
            code: String(data.code).trim().toUpperCase(),
            name: String(data.name).trim(),
            grade: String(data.grade || 'X').trim().toUpperCase(),
            defaultRoomId: data.defaultRoomId || null,
          },
        });
        return NextResponse.json({ success: true, item: updated });
      }

      if (action === 'delete') {
        await prisma.classGroup.delete({ where: { id: data.id } });
        return NextResponse.json({ success: true });
      }

      if (action === 'import') {
        const rows = Array.isArray(data.rows) ? data.rows : [];
        const allRooms = await prisma.room.findMany();
        const roomByCode = new Map(allRooms.map((rm) => [rm.code.toUpperCase(), rm.id]));
        let imported = 0;

        for (const r of rows) {
          const code = (r.kode_kelas || r.kode || r.code || '').trim().toUpperCase();
          const name = (r.nama_kelas || r.nama || r.name || '').trim();
          if (!code || !name) continue;
          const grade = (r.tingkat || r.grade || 'X').trim().toUpperCase();
          const roomCode = (r.kode_ruangan_default || r.kode_ruangan || r.ruangan || '').trim().toUpperCase();
          const defaultRoomId = roomByCode.get(roomCode) || null;

          await prisma.classGroup.upsert({
            where: { code },
            update: { name, grade, defaultRoomId },
            create: { code, name, grade, defaultRoomId },
          });
          imported++;
        }
        return NextResponse.json({
          success: true,
          message: `Berhasil mengimpor ${imported} data kelas/rombel.`,
        });
      }
    }

    // ==================== HARI & JAM KEAKTIFAN SEKOLAH ====================
    if (entity === 'activeDay') {
      if (action === 'toggle') {
        const updated = await prisma.activeDay.update({
          where: { id: data.id },
          data: { isActive: Boolean(data.isActive) },
        });
        return NextResponse.json({ success: true, item: updated });
      }

      if (action === 'create_slot') {
        const created = await prisma.timeSlot.create({
          data: {
            activeDayId: data.activeDayId,
            periodNumber: Number(data.periodNumber),
            label: String(data.label).trim(),
            startTime: String(data.startTime).trim(),
            endTime: String(data.endTime).trim(),
            isBreak: Boolean(data.isBreak),
          },
        });
        return NextResponse.json({ success: true, item: created });
      }

      if (action === 'update_slot') {
        const updated = await prisma.timeSlot.update({
          where: { id: data.id },
          data: {
            periodNumber: Number(data.periodNumber),
            label: String(data.label).trim(),
            startTime: String(data.startTime).trim(),
            endTime: String(data.endTime).trim(),
            isBreak: Boolean(data.isBreak),
          },
        });
        return NextResponse.json({ success: true, item: updated });
      }

      if (action === 'delete_slot') {
        await prisma.timeSlot.delete({ where: { id: data.id } });
        return NextResponse.json({ success: true });
      }

      if (action === 'reset_day_slots') {
        const day = await prisma.activeDay.findUnique({ where: { id: data.activeDayId } });
        if (!day) {
          return NextResponse.json({ error: 'Hari tidak ditemukan' }, { status: 404 });
        }
        await prisma.timeSlot.deleteMany({ where: { activeDayId: day.id } });
        const template = day.dayNumber === 5 ? FRIDAY_TIME_SLOTS : DEFAULT_TIME_SLOTS;
        for (const s of template) {
          await prisma.timeSlot.create({
            data: {
              activeDayId: day.id,
              periodNumber: s.periodNumber,
              label: s.label,
              startTime: s.startTime,
              endTime: s.endTime,
              isBreak: s.isBreak,
            },
          });
        }
        return NextResponse.json({
          success: true,
          message: `Slot jam pelajaran hari ${day.dayName} direset ke pengaturan standar.`,
        });
      }

      if (action === 'import') {
        // Import konfigurasi hari & slot jam dari CSV
        const rows = Array.isArray(data.rows) ? data.rows : [];
        const allDays = await prisma.activeDay.findMany();
        const dayMap = new Map<string, { id: string; dayNumber: number }>();
        for (const d of allDays) {
          dayMap.set(d.dayName.toLowerCase(), d);
          dayMap.set(String(d.dayNumber), d);
        }

        let imported = 0;
        for (const r of rows) {
          const dayKey = (r.hari || r.day || '').trim().toLowerCase();
          const dayObj = dayMap.get(dayKey);
          if (!dayObj) continue;

          const activeRaw = (r.status_hari || r.aktif || 'ya').trim().toLowerCase();
          const isDayActive = activeRaw !== 'tidak' && activeRaw !== 'false' && activeRaw !== '0' && activeRaw !== 'libur';
          await prisma.activeDay.update({
            where: { id: dayObj.id },
            data: { isActive: isDayActive },
          });

          const periodNumber = Number(r.urutan_slot || r.jam_ke || r.period);
          const label = (r.label_jam || r.label || '').trim();
          const startTime = (r.jam_mulai || r.mulai || r.start || '').trim();
          const endTime = (r.jam_selesai || r.selesai || r.end || '').trim();
          const breakRaw = (r.istirahat || r.is_break || 'tidak').trim().toLowerCase();
          const isBreak = breakRaw === 'ya' || breakRaw === 'true' || breakRaw === '1';

          if (periodNumber && label && startTime && endTime) {
            await prisma.timeSlot.upsert({
              where: {
                activeDayId_periodNumber: {
                  activeDayId: dayObj.id,
                  periodNumber,
                },
              },
              update: { label, startTime, endTime, isBreak },
              create: {
                activeDayId: dayObj.id,
                periodNumber,
                label,
                startTime,
                endTime,
                isBreak,
              },
            });
            imported++;
          }
        }
        return NextResponse.json({
          success: true,
          message: `Berhasil mengimpor ${imported} konfigurasi slot jam & hari keaktifan.`,
        });
      }
    }

    // ==================== BEBAN MENGAJAR (ASSIGNMENT) ====================
    if (entity === 'assignment') {
      if (action === 'create') {
        const item = await prisma.teachingAssignment.create({
          data: {
            teacherId: data.teacherId || null,
            subjectId: data.subjectId,
            classGroupId: data.classGroupId,
            totalPeriods: Number(data.totalPeriods) || 2,
            maxPerDay: Number(data.maxPerDay) || 2,
            preferredRoomId: data.preferredRoomId || null,
            notes: data.notes || null,
          },
          include: {
            teacher: true,
            subject: true,
            classGroup: true,
          },
        });
        return NextResponse.json({ success: true, item });
      }

      if (action === 'update') {
        const updated = await prisma.teachingAssignment.update({
          where: { id: data.id },
          data: {
            teacherId: data.teacherId || null,
            subjectId: data.subjectId,
            classGroupId: data.classGroupId,
            totalPeriods: Number(data.totalPeriods) || 2,
            maxPerDay: Number(data.maxPerDay) || 2,
            preferredRoomId: data.preferredRoomId || null,
            notes: data.notes || null,
          },
          include: {
            teacher: true,
            subject: true,
            classGroup: true,
          },
        });
        return NextResponse.json({ success: true, item: updated });
      }

      if (action === 'delete') {
        await prisma.teachingAssignment.delete({ where: { id: data.id } });
        return NextResponse.json({ success: true });
      }

      if (action === 'clear_all') {
        const deleted = await prisma.teachingAssignment.deleteMany({});
        return NextResponse.json({
          success: true,
          message: `Berhasil mengosongkan seluruh (${deleted.count}) data alokasi beban mengajar.`,
        });
      }

      if (action === 'assign_teacher') {
        // Cepat pasang / ganti guru pada beban mengajar tertentu
        const updated = await prisma.teachingAssignment.update({
          where: { id: data.id },
          data: {
            teacherId: data.teacherId || null,
          },
        });
        return NextResponse.json({ success: true, item: updated });
      }

      if (action === 'import') {
        const rows = Array.isArray(data.rows) ? data.rows : [];
        const [teachers, subjects, classes, rooms] = await Promise.all([
          prisma.teacher.findMany(),
          prisma.subject.findMany(),
          prisma.classGroup.findMany(),
          prisma.room.findMany(),
        ]);

        const tMap = new Map(teachers.map((t) => [t.code.toUpperCase(), t.id]));
        const sMap = new Map(subjects.map((s) => [s.code.toUpperCase(), s.id]));
        const cMap = new Map(classes.map((c) => [c.code.toUpperCase(), c.id]));
        const rMap = new Map(rooms.map((rm) => [rm.code.toUpperCase(), rm.id]));

        let imported = 0;
        for (const r of rows) {
          const tCode = (r.kode_guru || r.guru || '').trim().toUpperCase();
          const sCode = (r.kode_mapel || r.mapel || '').trim().toUpperCase();
          const cCode = (r.kode_kelas || r.kelas || '').trim().toUpperCase();
          const rCode = (r.kode_ruangan || r.ruangan || '').trim().toUpperCase();

          const teacherId = tMap.get(tCode);
          const subjectId = sMap.get(sCode);
          const classGroupId = cMap.get(cCode);
          if (!teacherId || !subjectId || !classGroupId) continue;

          const totalPeriods = Number(r.jumlah_jp || r.total_jp || r.jp) || 2;
          const maxPerDay = Number(r.maks_jp_per_hari || r.max_per_day) || 2;
          const preferredRoomId = rMap.get(rCode) || null;

          const existing = await prisma.teachingAssignment.findFirst({
            where: {
              teacherId,
              subjectId,
              classGroupId,
            },
          });

          if (existing) {
            await prisma.teachingAssignment.update({
              where: { id: existing.id },
              data: { totalPeriods, maxPerDay, preferredRoomId },
            });
          } else {
            await prisma.teachingAssignment.create({
              data: { teacherId, subjectId, classGroupId, totalPeriods, maxPerDay, preferredRoomId },
            });
          }
          imported++;
        }

        return NextResponse.json({
          success: true,
          message: `Berhasil mengimpor ${imported} alokasi beban mengajar.`,
        });
      }
    }

    // ==================== STRUKTUR KURIKULUM & GENERATE OTOMATIS MAPEL UMUM ====================
    if (entity === 'curriculum_standard') {
      if (action === 'save_batch') {
        // Simpan matriks standar JP untuk mapel umum secara massal & ultra-cepat
        const standards = Array.isArray(data.standards) ? data.standards : [];
        const validStandards = standards
          .filter((s: any) => s.subjectId && s.grade)
          .map((item: any) => ({
            subjectId: item.subjectId,
            grade: item.grade,
            totalPeriods: Number(item.totalPeriods) || 0,
            maxPerDay: Number(item.maxPerDay) || 2,
            preferredTimeSlotPeriods: Array.isArray(item.preferredTimeSlotPeriods)
              ? JSON.stringify(item.preferredTimeSlotPeriods)
              : (item.preferredTimeSlotPeriods || '[]'),
          }));

        await prisma.curriculumStandard.deleteMany({});
        if (validStandards.length > 0) {
          await prisma.curriculumStandard.createMany({
            data: validStandards,
          });
        }
        return NextResponse.json({ success: true, message: 'Standar kurikulum berhasil disimpan.' });
      }

      if (action === 'save_slot_pins') {
        // Simpan preferredTimeSlotPeriods per subjectId+grade
        // data.pins = [{ subjectId, grade, preferredTimeSlotPeriods: number[] }, ...]
        const pins = Array.isArray(data.pins) ? data.pins : [];
        await Promise.all(
          pins.map((pin: any) =>
            prisma.curriculumStandard.updateMany({
              where: { subjectId: pin.subjectId, grade: pin.grade },
              data: {
                preferredTimeSlotPeriods: Array.isArray(pin.preferredTimeSlotPeriods)
                  ? JSON.stringify(pin.preferredTimeSlotPeriods)
                  : '[]',
              },
            })
          )
        );
        return NextResponse.json({ success: true, message: 'Slot jam pilihan berhasil disimpan.' });
      }

      if (action === 'clear_all') {
        const deleted = await prisma.curriculumStandard.deleteMany({});
        return NextResponse.json({
          success: true,
          message: `Berhasil mengosongkan seluruh (${deleted.count}) data standar kurikulum.`,
        });
      }

      if (action === 'import') {
        const rows = Array.isArray(data.rows) ? data.rows : [];
        const subjects = await prisma.subject.findMany();
        const sMapByCode = new Map<string, string>();
        const sMapByName = new Map<string, string>();

        for (const s of subjects) {
          sMapByCode.set(s.code.trim().toUpperCase(), s.id);
          sMapByName.set(s.name.trim().toUpperCase(), s.id);
        }

        let imported = 0;

        for (const r of rows) {
          const rawCode = String(r.kode_mapel || r.kode || r.subject_code || '').trim().toUpperCase();
          const rawName = String(r.nama_mapel || r.nama || r.subject_name || '').trim().toUpperCase();
          const subjectId = sMapByCode.get(rawCode) || sMapByName.get(rawName) || sMapByName.get(rawCode);

          if (!subjectId) continue;

          const defaultMax = Number(r.maks_jp_per_hari || r.max_per_day || r.max_jp || r.maks_per_hari) || 2;

          // Cek apakah format kolom per tingkat (Wide Matrix: jp_kelas_x, jp_kelas_xi, jp_kelas_xii)
          const hasWideCols =
            'jp_kelas_x' in r ||
            'x' in r ||
            'jp_x' in r ||
            'jp_kelas_xi' in r ||
            'xi' in r ||
            'jp_kelas_xii' in r ||
            'xii' in r;

          if (hasWideCols) {
            const gradesData = [
              { grade: 'X', jp: Number(r.jp_kelas_x || r.x || r.jp_x || 0) },
              { grade: 'XI', jp: Number(r.jp_kelas_xi || r.xi || r.jp_xi || 0) },
              { grade: 'XII', jp: Number(r.jp_kelas_xii || r.xii || r.jp_xii || 0) },
            ];

            for (const gd of gradesData) {
              await prisma.curriculumStandard.upsert({
                where: {
                  subjectId_grade: {
                    subjectId,
                    grade: gd.grade,
                  },
                },
                update: {
                  totalPeriods: gd.jp,
                  maxPerDay: defaultMax,
                },
                create: {
                  subjectId,
                  grade: gd.grade,
                  totalPeriods: gd.jp,
                  maxPerDay: defaultMax,
                },
              });
              imported++;
            }
          } else {
            // Standard Row Format: tingkat / grade
            let rawGrade = String(r.tingkat || r.grade || r.tingkatan || r.kelas || '').trim().toUpperCase();
            if (rawGrade === '10' || rawGrade === 'KELAS 10' || rawGrade === 'KELAS X') rawGrade = 'X';
            if (rawGrade === '11' || rawGrade === 'KELAS 11' || rawGrade === 'KELAS XI') rawGrade = 'XI';
            if (rawGrade === '12' || rawGrade === 'KELAS 12' || rawGrade === 'KELAS XII') rawGrade = 'XII';

            if (!['X', 'XI', 'XII'].includes(rawGrade)) continue;

            const totalPeriods = Number(r.jumlah_jp || r.total_jp || r.jp || r.periode) || 0;
            const maxPerDay = Number(r.maks_jp_per_hari || r.max_per_day || r.max_jp || r.maks_per_hari) || defaultMax;

            await prisma.curriculumStandard.upsert({
              where: {
                subjectId_grade: {
                  subjectId,
                  grade: rawGrade,
                },
              },
              update: {
                totalPeriods,
                maxPerDay,
              },
              create: {
                subjectId,
                grade: rawGrade,
                totalPeriods,
                maxPerDay,
              },
            });
            imported++;
          }
        }

        return NextResponse.json({
          success: true,
          message: `Berhasil mengimpor ${imported} data standar alokasi JP kurikulum.`,
        });
      }

      if (action === 'apply_to_classes') {
        // Terapkan standar mapel umum ke semua rombel sesuai tingkatannya (X, XI, XII) secara batch massal
        const [standards, classes, existingAssignments] = await Promise.all([
          prisma.curriculumStandard.findMany(),
          prisma.classGroup.findMany(),
          prisma.teachingAssignment.findMany({
            select: { id: true, classGroupId: true, subjectId: true },
          }),
        ]);

        const validStandards = standards.filter((s) => s.totalPeriods > 0);
        const existingMap = new Map<string, string>();
        for (const a of existingAssignments) {
          existingMap.set(`${a.classGroupId}_${a.subjectId}`, a.id);
        }

        const toCreate: any[] = [];
        const toUpdate: { id: string; totalPeriods: number; maxPerDay: number }[] = [];

        for (const cls of classes) {
          const matchedStandards = validStandards.filter((s) => s.grade === cls.grade);

          for (const std of matchedStandards) {
            const key = `${cls.id}_${std.subjectId}`;
            const existingId = existingMap.get(key);

            if (existingId) {
              toUpdate.push({
                id: existingId,
                totalPeriods: std.totalPeriods,
                maxPerDay: std.maxPerDay,
              });
            } else {
              toCreate.push({
                classGroupId: cls.id,
                subjectId: std.subjectId,
                teacherId: null,
                totalPeriods: std.totalPeriods,
                maxPerDay: std.maxPerDay,
                preferredRoomId: cls.defaultRoomId || null,
                notes: 'Otomatis dari Standar Kurikulum',
              });
            }
          }
        }

        // 1 SINGLE INSERT QUERY untuk semua beban mengajar baru (super cepat < 100ms!)
        if (toCreate.length > 0) {
          await prisma.teachingAssignment.createMany({
            data: toCreate,
            skipDuplicates: true,
          });
        }

        // Batch update paralel jika ada data yang diupdate
        if (toUpdate.length > 0) {
          const chunkSize = 50;
          for (let i = 0; i < toUpdate.length; i += chunkSize) {
            const chunk = toUpdate.slice(i, i + chunkSize);
            await Promise.all(
              chunk.map((item) =>
                prisma.teachingAssignment.update({
                  where: { id: item.id },
                  data: {
                    totalPeriods: item.totalPeriods,
                    maxPerDay: item.maxPerDay,
                  },
                })
              )
            );
          }
        }

        return NextResponse.json({
          success: true,
          message: `Berhasil menerapkan beban mengajar mapel umum: ${toCreate.length} baru dibuat, ${toUpdate.length} diperbarui di seluruh rombel.`,
        });
      }
    }

    return NextResponse.json({ error: 'Entitas atau aksi tidak dikenali' }, { status: 400 });
  } catch (error: any) {
    console.error('Master POST error:', error);
    return NextResponse.json(
      { error: error?.message || 'Gagal memproses data master. Pastikan kode unik belum terpakai.' },
      { status: 500 }
    );
  }
}
