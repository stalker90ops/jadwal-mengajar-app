import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SI-JADWAL | Aplikasi Penjadwalan Mengajar Anti-Bentrok",
  description: "Sistem Informasi Penyusunan Jadwal Mengajar Sekolah dengan Validasi Bentrok Multi-Dimensi & Auto-Scheduler",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
