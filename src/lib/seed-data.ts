import prisma from './prisma';

export const DEFAULT_TIME_SLOTS = [
  { periodNumber: 1, label: 'Jam Ke-1', startTime: '07:00', endTime: '07:45', isBreak: false },
  { periodNumber: 2, label: 'Jam Ke-2', startTime: '07:45', endTime: '08:30', isBreak: false },
  { periodNumber: 3, label: 'Jam Ke-3', startTime: '08:30', endTime: '09:15', isBreak: false },
  { periodNumber: 4, label: 'Istirahat 1', startTime: '09:15', endTime: '09:30', isBreak: true },
  { periodNumber: 5, label: 'Jam Ke-4', startTime: '09:30', endTime: '10:15', isBreak: false },
  { periodNumber: 6, label: 'Jam Ke-5', startTime: '10:15', endTime: '11:00', isBreak: false },
  { periodNumber: 7, label: 'Jam Ke-6', startTime: '11:00', endTime: '11:45', isBreak: false },
  { periodNumber: 8, label: 'Istirahat 2 / Ishoma', startTime: '11:45', endTime: '12:30', isBreak: true },
  { periodNumber: 9, label: 'Jam Ke-7', startTime: '12:30', endTime: '13:15', isBreak: false },
  { periodNumber: 10, label: 'Jam Ke-8', startTime: '13:15', endTime: '14:00', isBreak: false },
];

export const FRIDAY_TIME_SLOTS = [
  { periodNumber: 1, label: 'Jam Ke-1', startTime: '07:00', endTime: '07:40', isBreak: false },
  { periodNumber: 2, label: 'Jam Ke-2', startTime: '07:40', endTime: '08:20', isBreak: false },
  { periodNumber: 3, label: 'Jam Ke-3', startTime: '08:20', endTime: '09:00', isBreak: false },
  { periodNumber: 4, label: 'Istirahat', startTime: '09:00', endTime: '09:15', isBreak: true },
  { periodNumber: 5, label: 'Jam Ke-4', startTime: '09:15', endTime: '09:55', isBreak: false },
  { periodNumber: 6, label: 'Jam Ke-5', startTime: '09:55', endTime: '10:35', isBreak: false },
  { periodNumber: 7, label: 'Jam Ke-6', startTime: '10:35', endTime: '11:15', isBreak: false },
];

export async function ensureDefaultActiveDays() {
  const count = await prisma.activeDay.count();
  if (count > 0) return;

  const days = [
    { dayNumber: 1, dayName: 'Senin', isActive: true },
    { dayNumber: 2, dayName: 'Selasa', isActive: true },
    { dayNumber: 3, dayName: 'Rabu', isActive: true },
    { dayNumber: 4, dayName: 'Kamis', isActive: true },
    { dayNumber: 5, dayName: 'Jumat', isActive: true },
    { dayNumber: 6, dayName: 'Sabtu', isActive: false },
  ];

  for (const d of days) {
    const createdDay = await prisma.activeDay.create({
      data: {
        dayNumber: d.dayNumber,
        dayName: d.dayName,
        isActive: d.isActive,
      },
    });

    const slots = d.dayNumber === 5 ? FRIDAY_TIME_SLOTS : DEFAULT_TIME_SLOTS;
    for (const s of slots) {
      await prisma.timeSlot.create({
        data: {
          activeDayId: createdDay.id,
          periodNumber: s.periodNumber,
          label: s.label,
          startTime: s.startTime,
          endTime: s.endTime,
          isBreak: s.isBreak,
        },
      });
    }
  }
}

export async function seedSampleSchoolData() {
  await ensureDefaultActiveDays();

  // 1. Seed Ruangan
  const roomsData = [
    { code: 'R-101', name: 'Ruang Kelas X-1', type: 'TEORI', capacity: 36 },
    { code: 'R-102', name: 'Ruang Kelas X-2', type: 'TEORI', capacity: 36 },
    { code: 'R-201', name: 'Ruang Kelas XI-1', type: 'TEORI', capacity: 36 },
    { code: 'LAB-KOM', name: 'Laboratorium Komputer', type: 'LAB', capacity: 40 },
    { code: 'LAB-IPA', name: 'Laboratorium IPA Terpadu', type: 'LAB', capacity: 36 },
    { code: 'LAP-OR', name: 'Lapangan Olahraga', type: 'OLAHRAGA', capacity: 45 },
  ];

  const roomMap = new Map<string, string>();
  for (const r of roomsData) {
    const upserted = await prisma.room.upsert({
      where: { code: r.code },
      update: { name: r.name, type: r.type, capacity: r.capacity },
      create: r,
    });
    roomMap.set(r.code, upserted.id);
  }

  // 2. Seed Kelas / Rombel
  const classesData = [
    { code: 'X-1', name: 'Kelas X Merdeka 1', grade: 'X', defaultRoomId: roomMap.get('R-101') || null },
    { code: 'X-2', name: 'Kelas X Merdeka 2', grade: 'X', defaultRoomId: roomMap.get('R-102') || null },
    { code: 'XI-1', name: 'Kelas XI Saintek 1', grade: 'XI', defaultRoomId: roomMap.get('R-201') || null },
  ];

  const classMap = new Map<string, string>();
  for (const c of classesData) {
    const upserted = await prisma.classGroup.upsert({
      where: { code: c.code },
      update: { name: c.name, grade: c.grade, defaultRoomId: c.defaultRoomId },
      create: c,
    });
    classMap.set(c.code, upserted.id);
  }

  // 3. Seed Mata Pelajaran
  const subjectsData = [
    { code: 'MAT', name: 'Matematika', category: 'UMUM', color: '#2563eb', requiresLab: false },
    { code: 'BIN', name: 'Bahasa Indonesia', category: 'UMUM', color: '#059669', requiresLab: false },
    { code: 'BIG', name: 'Bahasa Inggris', category: 'UMUM', color: '#7c3aed', requiresLab: false },
    { code: 'INF', name: 'Informatika', category: 'KEJURUAN', color: '#0891b2', requiresLab: true },
    { code: 'IPA', name: 'IPA / Fisika-Biologi', category: 'UMUM', color: '#d97706', requiresLab: true },
    { code: 'PJOK', name: 'PJOK (Olahraga)', category: 'UMUM', color: '#dc2626', requiresLab: false },
    { code: 'PAI', name: 'Pendidikan Agama & Budi Pekerti', category: 'UMUM', color: '#16a34a', requiresLab: false },
  ];

  const subjectMap = new Map<string, string>();
  for (const s of subjectsData) {
    const upserted = await prisma.subject.upsert({
      where: { code: s.code },
      update: { name: s.name, category: s.category, color: s.color, requiresLab: s.requiresLab },
      create: s,
    });
    subjectMap.set(s.code, upserted.id);
  }

  // 4. Seed Guru beserta Hari Keaktifannya (termasuk contoh guru yang hanya aktif hari tertentu)
  const teachersData = [
    {
      code: 'GR-01',
      nip: '198501122010011001',
      name: 'Budi Santoso, S.Pd., M.Pd.',
      phone: '081234567801',
      maxPeriods: 24,
      activeDays: '[1,2,3,4,5]', // Senin - Jumat
    },
    {
      code: 'GR-02',
      nip: '198804202014022002',
      name: 'Siti Aminah, M.Hum.',
      phone: '081234567802',
      maxPeriods: 24,
      activeDays: '[1,2,3,4,5]',
    },
    {
      code: 'GR-03',
      nip: '199007152019031003',
      name: 'Andi Wijaya, S.Kom.',
      phone: '081234567803',
      maxPeriods: 24,
      activeDays: '[1,3,5]', // Hanya aktif Senin, Rabu, Jumat
    },
    {
      code: 'GR-04',
      nip: '198711032012012004',
      name: 'Dewi Lestari, S.Si.',
      phone: '081234567804',
      maxPeriods: 24,
      activeDays: '[2,3,4]', // Hanya aktif Selasa, Rabu, Kamis
    },
    {
      code: 'GR-05',
      nip: '199203192020121005',
      name: 'Rizky Pratama, S.Pd.',
      phone: '081234567805',
      maxPeriods: 24,
      activeDays: '[1,2,4,5]', // Aktif Senin, Selasa, Kamis, Jumat (Rabu MGMP)
    },
    {
      code: 'GR-06',
      nip: '198409092009021006',
      name: 'H. Ahmad Fauzi, S.Ag.',
      phone: '081234567806',
      maxPeriods: 24,
      activeDays: '[1,2,3,4,5]',
    },
  ];

  const teacherMap = new Map<string, string>();
  for (const t of teachersData) {
    const upserted = await prisma.teacher.upsert({
      where: { code: t.code },
      update: {
        nip: t.nip,
        name: t.name,
        phone: t.phone,
        maxPeriods: t.maxPeriods,
        activeDays: t.activeDays,
      },
      create: t,
    });
    teacherMap.set(t.code, upserted.id);
  }

  // 5. Seed Beban Mengajar (TeachingAssignments)
  const assignmentsData = [
    // Kelas X-1
    { teacher: 'GR-01', subject: 'MAT', classCode: 'X-1', totalPeriods: 4, maxPerDay: 2, room: null },
    { teacher: 'GR-02', subject: 'BIN', classCode: 'X-1', totalPeriods: 4, maxPerDay: 2, room: null },
    { teacher: 'GR-03', subject: 'INF', classCode: 'X-1', totalPeriods: 2, maxPerDay: 2, room: 'LAB-KOM' },
    { teacher: 'GR-04', subject: 'IPA', classCode: 'X-1', totalPeriods: 3, maxPerDay: 2, room: 'LAB-IPA' },
    { teacher: 'GR-05', subject: 'PJOK', classCode: 'X-1', totalPeriods: 2, maxPerDay: 2, room: 'LAP-OR' },
    { teacher: 'GR-06', subject: 'PAI', classCode: 'X-1', totalPeriods: 2, maxPerDay: 2, room: null },

    // Kelas X-2
    { teacher: 'GR-01', subject: 'MAT', classCode: 'X-2', totalPeriods: 4, maxPerDay: 2, room: null },
    { teacher: 'GR-02', subject: 'BIN', classCode: 'X-2', totalPeriods: 4, maxPerDay: 2, room: null },
    { teacher: 'GR-03', subject: 'INF', classCode: 'X-2', totalPeriods: 2, maxPerDay: 2, room: 'LAB-KOM' },
    { teacher: 'GR-04', subject: 'IPA', classCode: 'X-2', totalPeriods: 3, maxPerDay: 2, room: null },
    { teacher: 'GR-05', subject: 'PJOK', classCode: 'X-2', totalPeriods: 2, maxPerDay: 2, room: 'LAP-OR' },
    { teacher: 'GR-06', subject: 'PAI', classCode: 'X-2', totalPeriods: 2, maxPerDay: 2, room: null },

    // Kelas XI-1
    { teacher: 'GR-01', subject: 'MAT', classCode: 'XI-1', totalPeriods: 4, maxPerDay: 2, room: null },
    { teacher: 'GR-02', subject: 'BIG', classCode: 'XI-1', totalPeriods: 3, maxPerDay: 2, room: null },
    { teacher: 'GR-03', subject: 'INF', classCode: 'XI-1', totalPeriods: 2, maxPerDay: 2, room: 'LAB-KOM' },
    { teacher: 'GR-04', subject: 'IPA', classCode: 'XI-1', totalPeriods: 4, maxPerDay: 2, room: 'LAB-IPA' },
    { teacher: 'GR-06', subject: 'PAI', classCode: 'XI-1', totalPeriods: 2, maxPerDay: 2, room: null },
  ];

  for (const a of assignmentsData) {
    const teacherId = teacherMap.get(a.teacher);
    const subjectId = subjectMap.get(a.subject);
    const classGroupId = classMap.get(a.classCode);
    const preferredRoomId = a.room ? roomMap.get(a.room) || null : null;

    if (teacherId && subjectId && classGroupId) {
      await prisma.teachingAssignment.upsert({
        where: {
          teacherId_subjectId_classGroupId: {
            teacherId,
            subjectId,
            classGroupId,
          },
        },
        update: {
          totalPeriods: a.totalPeriods,
          maxPerDay: a.maxPerDay,
          preferredRoomId,
        },
        create: {
          teacherId,
          subjectId,
          classGroupId,
          totalPeriods: a.totalPeriods,
          maxPerDay: a.maxPerDay,
          preferredRoomId,
        },
      });
    }
  }
}
