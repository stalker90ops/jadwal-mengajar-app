import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import bcrypt from 'bcrypt';
import { ensureDefaultActiveDays, seedSampleSchoolData } from '@/lib/seed-data';

export async function GET() {
  try {
    await ensureDefaultActiveDays();

    let admin = await prisma.user.findFirst();
    if (!admin) {
      const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'password123', 10);
      admin = await prisma.user.create({
        data: {
          name: 'Wakasek Kurikulum',
          email: process.env.ADMIN_EMAIL || 'admin@sekolah.com',
          password_hash: hashedPassword,
          role: 'ADMIN',
        },
      });
    }

    return NextResponse.json({
      message: 'Inisialisasi Admin Kurikulum & Hari Aktif siap.',
      email: admin.email,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Gagal menyiapkan admin' }, { status: 500 });
  }
}

export async function POST() {
  try {
    await seedSampleSchoolData();
    return NextResponse.json({
      success: true,
      message: 'Data contoh (Guru, Mapel, Kelas, Ruangan, Hari Aktif, dan Beban Mengajar) berhasil dimuat!',
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Gagal memuat data contoh' }, { status: 500 });
  }
}
