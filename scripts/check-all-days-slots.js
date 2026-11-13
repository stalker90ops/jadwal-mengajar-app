const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const days = await prisma.activeDay.findMany({
    include: {
      timeSlots: { orderBy: { periodNumber: 'asc' } },
    },
    orderBy: { dayNumber: 'asc' },
  });

  for (const d of days) {
    const periods = d.timeSlots.map((s) => s.periodNumber);
    const hasGap = periods.some((p, i) => i > 0 && p !== periods[i - 1] + 1);
    console.log(
      `Hari [${d.dayName}]: total ${d.timeSlots.length} slots. Min: ${periods[0]}, Max: ${periods[periods.length - 1]}. HasGap: ${hasGap}`
    );
    if (hasGap) {
      console.log('  -> Periods:', periods);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
