import { jwtVerify, SignJWT } from 'jose';

// Secret dibaca saat dipakai (bukan saat import) supaya `next build` tidak gagal
// jika JWT_SECRET belum di-set. Di production nilai ini WAJIB diisi.
function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET wajib di-set pada environment production.');
    }
    return new TextEncoder().encode('super-secret-key-change-this');
  }
  return new TextEncoder().encode(secret);
}

export async function signToken(payload: any) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(getSecret());
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload;
  } catch (error) {
    return null;
  }
}
