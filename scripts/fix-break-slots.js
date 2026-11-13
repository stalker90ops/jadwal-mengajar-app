const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const keywords = ['istirahat', 'ishoma', 'upacara', 'literasi alquran'];
  
  const allSlots = await prisma.timeSlot.findMany({
    include: { activeDay: true }
  });

  let updated = 0;
  for (const s of allSlots) {
    const isKeyword = keywords.some(k => s.label.toLowerCase().includes(k));
    if (isKeyword && !s.isBreak) {
      console.log(`Setting isBreak=true for [${s.activeDay.dayName}] Period ${s.periodNumber}: "${s.label}"`);
      await prisma.timeSlot.update({
        where: { id: s.id },
        data: { isBreak: true }
      });
      updated++;
    }
  }

  console.log(`Updated ${updated} slots to isBreak=true.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
