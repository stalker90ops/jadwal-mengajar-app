import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from './lib/auth';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('admin_token')?.value;
  const payload = token ? await verifyToken(token) : null;

  // ---- API ----
  if (pathname.startsWith('/api/')) {
    // Login/logout selalu terbuka
    if (pathname.startsWith('/api/auth/')) return NextResponse.next();

    // Data master hanya-baca dipakai halaman jadwal publik (guru & siswa)
    if (pathname === '/api/master' && request.method === 'GET') {
      return NextResponse.next();
    }

    // Selain itu (tulis data, jadwal, setup) wajib login admin
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.next();
  }

  // ---- Halaman admin ----
  if (pathname.startsWith('/roster') && !pathname.startsWith('/roster/login')) {
    if (!payload) {
      return NextResponse.redirect(new URL('/roster/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/roster/:path*', '/api/:path*'],
};
