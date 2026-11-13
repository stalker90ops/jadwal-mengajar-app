const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const slots = await prisma.timeSlot.findMany({
    select: {
      id: true,
      label: true,
      isBreak: true,
      periodNumber: true,
      activeDay: { select: { dayName: true } }
    },
    orderBy: [{ activeDay: { dayNumber: 'asc' } }, { periodNumber: 'asc' }]
  });

  console.log('Total slots:', slots.length);
  const breakKeywords = ['istirahat', 'upacara', 'ishoma', 'sholat', 'jumat'];
  const suspicious = slots.filter(s => {
    const isNamedBreak = breakKeywords.some(k => s.label.toLowerCase().includes(k));
    return isNamedBreak || s.isBreak;
  });

  console.log('Break slots count:', suspicious.length);
  suspicious.forEach(s => {
    console.log(`[${s.activeDay.dayName}] Period ${s.periodNumber}: "${s.label}" -> isBreak: ${s.isBreak}`);
  });

  // Cek apakah ada jadwal (Schedule) yang berada di slot istirahat
  const invalidSchedules = await prisma.schedule.findMany({
    where: {
      timeSlot: {
        isBreak: true
      }
    },
    include: {
      timeSlot: true,
      subject: true,
      classGroup: true
    }
  });

  console.log('Schedules sitting in isBreak=true slots:', invalidSchedules.length);
}

main().catch(console.error).finally(() => prisma.$disconnect());
