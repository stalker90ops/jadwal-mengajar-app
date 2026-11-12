import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail', // Atau SMTP provider lain
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendStatusUpdateEmail = async (to: string, ticketCode: string, newStatus: string, adminNotes: string | null) => {
  let statusText = '';
  switch (newStatus) {
    case 'PROCESSED': statusText = 'sedang DIPROSES'; break;
    case 'RESOLVED': statusText = 'telah SELESAI ditangani'; break;
    case 'REJECTED': statusText = 'DITOLAK'; break;
    default: statusText = newStatus;
  }

  const mailOptions = {
    from: `"Tim Anti-Bullying" <${process.env.EMAIL_USER}>`,
    to,
    subject: `Update Status Pengaduan: ${ticketCode}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #1e293b;">Pemberitahuan Status Pengaduan</h2>
        <p>Halo,</p>
        <p>Laporan pengaduan Anda dengan kode tiket <strong style="background: #e2e8f0; padding: 4px 8px; border-radius: 4px;">${ticketCode}</strong> ${statusText}.</p>
        ${adminNotes ? `<div style="background-color: #f1f5f9; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #3b82f6;"><p style="margin: 0; color: #334155;"><strong>Catatan dari Tim:</strong><br/>${adminNotes}</p></div>` : ''}
        <p>Terima kasih atas keberanian Anda melapor. Kami mendengarkan dan akan membantu.</p>
        <p style="color: #64748b; font-size: 12px; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 10px;">Identitas Anda tetap dijaga kerahasiaannya. Pesan ini dibuat otomatis oleh sistem.</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error("Gagal mengirim email:", error);
    return false;
  }
};
