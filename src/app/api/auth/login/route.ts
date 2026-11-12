import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import bcrypt from 'bcrypt';
import { signToken } from '@/lib/auth';
import { cookies } from 'next/headers';
import { ensureDefaultActiveDays } from '@/lib/seed-data';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    // Pastikan jika database baru di-reset, akun admin default dibuat otomatis
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'password123', 10);
      await prisma.user.create({
        data: {
          name: 'Wakasek Kurikulum',
          email: process.env.ADMIN_EMAIL || 'admin@sekolah.com',
          password_hash: hashedPassword,
          role: 'ADMIN',
        },
      });
      await ensureDefaultActiveDays();
    }

    const admin = await prisma.user.findUnique({ where: { email } });

    if (!admin) {
      return NextResponse.json({ error: 'Email atau password salah' }, { status: 401 });
    }

    const isValid = await bcrypt.compare(password, admin.password_hash);
    if (!isValid) {
      return NextResponse.json({ error: 'Email atau password salah' }, { status: 401 });
    }

    const token = await signToken({ id: admin.id, email: admin.email, role: admin.role });

    cookies().set({
      name: 'admin_token',
      value: token,
      httpOnly: true,
      path: '/',
      // Set COOKIE_SECURE=false jika hosting masih lewat HTTP (tanpa HTTPS)
      secure:
        process.env.COOKIE_SECURE !== undefined
          ? process.env.COOKIE_SECURE === 'true'
          : process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Terjadi kesalahan pada server' }, { status: 500 });
  }
}
