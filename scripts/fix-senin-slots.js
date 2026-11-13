const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const senin = await prisma.activeDay.findFirst({
    where: { dayName: 'Senin' },
    include: {
      timeSlots: {
        orderBy: { periodNumber: 'asc' },
      },
    },
  });

  if (!senin) {
    console.error('Hari Senin tidak ditemukan di database.');
    return;
  }

  console.log(`Ditemukan ${senin.timeSlots.length} slot jam pada hari Senin.`);

  // 1. Ubah sementara ke nomor period tinggi agar tidak melanggar unique constraint [activeDayId, periodNumber]
  console.log('Mengubah nomor urut sementara...');
  for (let i = 0; i < senin.timeSlots.length; i++) {
    const slot = senin.timeSlots[i];
    await prisma.timeSlot.update({
      where: { id: slot.id },
      data: { periodNumber: 500 + i },
    });
  }

  // 2. Beri nomor urut baru yang rapi dari 1, 2, 3, 4, 5, ...
  console.log('Menata ulang nomor urut menjadi 1..N...');
  for (let i = 0; i < senin.timeSlots.length; i++) {
    const slot = senin.timeSlots[i];
    const newPeriod = i + 1;
    await prisma.timeSlot.update({
      where: { id: slot.id },
      data: { periodNumber: newPeriod },
    });
    console.log(`Slot "${slot.label}" (${slot.startTime}-${slot.endTime}) sebelumnya Period ${slot.periodNumber} -> sekarang Period ${newPeriod}`);
  }

  // 3. Verifikasi hasil akhir
  const updatedSenin = await prisma.activeDay.findFirst({
    where: { dayName: 'Senin' },
    include: {
      timeSlots: {
        orderBy: { periodNumber: 'asc' },
      },
    },
  });

  console.log('\nHasil akhir slot hari Senin:');
  console.table(
    updatedSenin.timeSlots.map((s) => ({
      periodNumber: s.periodNumber,
      label: s.label,
      time: `${s.startTime}-${s.endTime}`,
      isBreak: s.isBreak,
    }))
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
