import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import fs from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";

export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const teacherId = searchParams.get("id");

    if (!teacherId) {
      return NextResponse.json({ error: "Parameter 'id' guru diperlukan." }, { status: 400 });
    }

    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
    });

    if (!teacher) {
      return NextResponse.json({ error: "Guru tidak ditemukan." }, { status: 404 });
    }

    const [activeDays, schedules, additionalDuties] = await Promise.all([
      prisma.activeDay.findMany({
        where: { isActive: true },
        orderBy: { dayNumber: "asc" },
        include: {
          timeSlots: {
            orderBy: { periodNumber: "asc" },
          },
        },
      }),
      prisma.schedule.findMany({
        where: { teacherId },
        include: {
          activeDay: true,
          timeSlot: true,
          subject: true,
          classGroup: true,
          room: true,
        },
      }),
      prisma.additionalDuty.findMany({
        where: { teacherId },
      }),
    ]);

    // Baca logo Pemprov Sulsel ke Base64
    let logoBase64 = "";
    const logoPath = path.join(process.cwd(), "public", "logo-sulsel.png");
    if (fs.existsSync(logoPath)) {
      logoBase64 = `data:image/png;base64,${fs.readFileSync(logoPath).toString("base64")}`;
    }

    // Hitung beban kerja & audit Permendikdasmen No. 11/2025
    const teachingHours = schedules.length;
    let ttuHours = 0;
    let ttleHours = 0;

    additionalDuties.forEach((d) => {
      const h = Number(d.equivalentHours) || 0;
      if (d.category === "TTU" || h === 12) {
        ttuHours += 12;
      } else {
        ttleHours += h;
      }
    });

    const hasTTU = ttuHours > 0;
    const ttleRecognized = Math.min(6, ttleHours);
    const recognizedDutyHours = hasTTU ? 12 : ttleRecognized;
    const realDutyHours = ttuHours + ttleHours;
    const totalRecognized = teachingHours + recognizedDutyHours;
    const totalReal = teachingHours + realDutyHours;

    const minTeaching = hasTTU ? 12 : ttleHours > 0 ? 18 : 24;
    const isMinTeachingMet = teachingHours >= minTeaching;
    const isValidTPG = totalRecognized >= 24 && isMinTeachingMet;

    // Struktur baris tabel
    let tableRowsHtml = "";

    activeDays.forEach((day) => {
      const slots = [...day.timeSlots].sort((a, b) => a.periodNumber - b.periodNumber);
      const processedSlots: any[] = [];

      // Upacara Senin
      if (day.dayNumber === 1) {
        processedSlots.push({
          type: "CEREMONY",
          time: "07.00 - 08.00",
          periodNum: "",
          subjectName: "UPACARA BENDERA",
          className: "",
          roomName: "",
        });
      }

      let regularTeachingIndex = 1;
      slots.forEach((slot) => {
        if (slot.isBreak) {
          processedSlots.push({
            type: "BREAK",
            time: `${slot.startTime.replace(":", ".")} - ${slot.endTime.replace(":", ".")}`,
            periodNum: "",
            subjectName: slot.label.toLowerCase().includes("ishoma") || slot.label.toLowerCase().includes("sholat")
              ? "Istirahat / sholat"
              : "Istirahat",
          });
        } else {
          const sched = schedules.find(
            (s) => s.activeDayId === day.id && s.timeSlotId === slot.id
          );
          processedSlots.push({
            type: "TEACHING",
            time: `${slot.startTime.replace(":", ".")} - ${slot.endTime.replace(":", ".")}`,
            periodNum: regularTeachingIndex++,
            sched,
          });
        }
      });

      // Hitung JTM block merge
      const finalDayRows: any[] = [];
      let i = 0;
      while (i < processedSlots.length) {
        const item = processedSlots[i];
        if (item.type === "CEREMONY" || item.type === "BREAK") {
          finalDayRows.push({ ...item, jtmSpan: 1, jtmValue: "" });
          i++;
        } else {
          const currentSched = item.sched;
          if (!currentSched) {
            finalDayRows.push({
              type: "TEACHING",
              time: item.time,
              periodNum: item.periodNum,
              subjectName: "",
              className: "",
              roomName: "",
              jtmSpan: 1,
              jtmValue: "",
            });
            i++;
          } else {
            let count = 1;
            let j = i + 1;
            while (j < processedSlots.length) {
              const nextItem = processedSlots[j];
              if (nextItem.type !== "TEACHING" || !nextItem.sched) break;
              if (
                nextItem.sched.subjectId === currentSched.subjectId &&
                nextItem.sched.classGroupId === currentSched.classGroupId &&
                nextItem.sched.roomId === currentSched.roomId
              ) {
                count++;
                j++;
              } else {
                break;
              }
            }

            finalDayRows.push({
              type: "TEACHING",
              time: item.time,
              periodNum: item.periodNum,
              subjectName: currentSched.subject?.name?.toUpperCase() || "",
              className: currentSched.classGroup?.name?.toUpperCase() || "",
              roomName: currentSched.room?.name?.toUpperCase() || currentSched.room?.code?.toUpperCase() || "",
              jtmSpan: count,
              jtmValue: count,
            });

            for (let k = 1; k < count; k++) {
              const nextItem = processedSlots[i + k];
              finalDayRows.push({
                type: "TEACHING",
                time: nextItem.time,
                periodNum: nextItem.periodNum,
                subjectName: currentSched.subject?.name?.toUpperCase() || "",
                className: currentSched.classGroup?.name?.toUpperCase() || "",
                roomName: currentSched.room?.name?.toUpperCase() || currentSched.room?.code?.toUpperCase() || "",
                jtmSpan: 0,
                jtmValue: "",
              });
            }

            i += count;
          }
        }
      }

      // Render baris HTML
      const totalDayRows = finalDayRows.length;
      finalDayRows.forEach((row, rIdx) => {
        const isFirst = rIdx === 0;
        let dayCell = "";
        if (isFirst) {
          const spacedDay = day.dayName.split("").join(" ").toUpperCase();
          dayCell = `<td rowspan="${totalDayRows}" class="day-col">${spacedDay}</td>`;
        }

        if (row.type === "CEREMONY") {
          tableRowsHtml += `
            <tr class="ceremony-row">
              ${dayCell}
              <td class="time-col">${row.time}</td>
              <td class="num-col"></td>
              <td colspan="4" class="special-label">${row.subjectName}</td>
            </tr>
          `;
        } else if (row.type === "BREAK") {
          tableRowsHtml += `
            <tr class="break-row">
              ${dayCell}
              <td class="time-col">${row.time}</td>
              <td class="num-col"></td>
              <td colspan="4" class="break-label">${row.subjectName}</td>
            </tr>
          `;
        } else {
          let jtmCell = "";
          if (row.jtmSpan > 0) {
            jtmCell = `<td rowspan="${row.jtmSpan}" class="jtm-col">${row.jtmValue}</td>`;
          }
          tableRowsHtml += `
            <tr>
              ${dayCell}
              <td class="time-col">${row.time}</td>
              <td class="num-col">${row.periodNum}</td>
              <td class="subject-col">${row.subjectName}</td>
              <td class="class-col">${row.className}</td>
              <td class="room-col">${row.roomName}</td>
              ${jtmCell}
            </tr>
          `;
        }
      });
    });

    // Rincian Tugas Tambahan
    let dutiesListHtml = `<div style="color: #64748b; font-style: italic;">Tidak ada tugas tambahan</div>`;
    if (additionalDuties.length > 0) {
      dutiesListHtml = additionalDuties
        .map(
          (d) => `
        <div style="margin-bottom: 3px;">
          <strong>${d.category === "TTU" ? "🔵" : "🟢"} ${d.name}</strong> 
          <span style="color: #92400e; font-weight: bold;">(+${d.equivalentHours} JP)</span>
          ${d.nomorSk ? `<div style="font-size: 7pt; color: #64748b; font-family: monospace;">SK: ${d.nomorSk}</div>` : ""}
        </div>
      `
        )
        .join("");
    }

    const tpgStatusBadge = isValidTPG
      ? `<span class="badge badge-success">🟢 MEMENUHI SYARAT TPG (≥ 24 JP)</span>`
      : !isMinTeachingMet
      ? `<span class="badge badge-warning">🟡 KURANG TATAP MUKA (${teachingHours}/${minTeaching} JP)</span>`
      : `<span class="badge badge-danger">🔴 KURANG JAM TOTAL (${totalRecognized}/24 JP)</span>`;

    const htmlDoc = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>Jadwal_${teacher.code}_${teacher.name}</title>
<style>
  @page {
    size: A4 portrait;
    margin: 8mm 8mm 8mm 8mm;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #000;
    margin: 0;
    padding: 0;
    font-size: 8pt;
    line-height: 1.25;
    background: #fff;
  }
  .kop-container {
    display: flex;
    align-items: center;
    gap: 15px;
    padding-bottom: 4px;
  }
  .kop-logo {
    width: 68px;
    height: auto;
  }
  .kop-text {
    flex: 1;
    text-align: center;
    line-height: 1.15;
  }
  .kop-pemerintah {
    font-size: 11pt;
    font-weight: 900;
    text-transform: uppercase;
    font-family: 'Times New Roman', serif;
  }
  .kop-dinas {
    font-size: 11pt;
    font-weight: 900;
    text-transform: uppercase;
    font-family: 'Times New Roman', serif;
  }
  .kop-sekolah {
    font-size: 13pt;
    font-weight: 900;
    text-transform: uppercase;
    font-family: 'Times New Roman', serif;
  }
  .kop-alamat {
    font-size: 7.5pt;
    color: #000;
    margin-top: 2px;
  }
  .double-line-1 {
    border-bottom: 2.5px solid #000;
    margin-bottom: 1px;
  }
  .double-line-2 {
    border-bottom: 1px solid #000;
    margin-bottom: 8px;
  }
  .doc-title {
    text-align: center;
    font-weight: 900;
    font-size: 10.5pt;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
  }
  .meta-grid {
    display: flex;
    justify-content: space-between;
    font-size: 8.5pt;
    font-weight: bold;
    margin-bottom: 8px;
    border-bottom: 1px solid #cbd5e1;
    padding-bottom: 4px;
  }
  .meta-col {
    width: 48%;
  }
  .meta-row {
    display: flex;
    margin-bottom: 2px;
  }
  .meta-label {
    width: 105px;
  }
  table.schedule-table {
    width: 100%;
    border-collapse: collapse;
    border: 2px solid #000;
    font-size: 7.8pt;
  }
  table.schedule-table th {
    background-color: #fb923c;
    color: #000;
    font-weight: 900;
    text-transform: uppercase;
    border: 1px solid #000;
    padding: 3px 4px;
    text-align: center;
  }
  table.schedule-table td {
    border: 1px solid #000;
    padding: 2.5px 3px;
    vertical-align: middle;
  }
  .day-col {
    background-color: #9388a2;
    color: #000;
    font-weight: 900;
    text-align: center;
    width: 24px;
    font-size: 8.5pt;
    writing-mode: vertical-rl;
    transform: rotate(180deg);
  }
  .time-col {
    text-align: center;
    white-space: nowrap;
    width: 78px;
    font-size: 7.5pt;
  }
  .num-col {
    text-align: center;
    font-weight: bold;
    width: 22px;
  }
  .subject-col {
    font-weight: bold;
    text-transform: uppercase;
  }
  .class-col {
    text-align: center;
    font-weight: bold;
    width: 58px;
  }
  .room-col {
    text-align: center;
    font-weight: bold;
    width: 50px;
  }
  .jtm-col {
    text-align: center;
    font-weight: 900;
    font-size: 9pt;
    width: 38px;
    background: #fafafa;
  }
  .ceremony-row {
    background-color: #fef08a;
  }
  .special-label {
    text-align: center;
    font-weight: 900;
    text-transform: uppercase;
  }
  .break-row {
    background-color: #bae6fd;
  }
  .break-label {
    text-align: center;
    font-weight: 900;
    color: #dc2626;
  }
  .rekap-card {
    margin-top: 8px;
    border: 1.5px solid #000;
    border-radius: 4px;
    background: #f8fafc;
    padding: 6px 8px;
    font-size: 8pt;
  }
  .rekap-header {
    font-weight: 900;
    text-transform: uppercase;
    border-bottom: 1px solid #cbd5e1;
    padding-bottom: 3px;
    margin-bottom: 5px;
    display: flex;
    justify-content: space-between;
  }
  .rekap-grid {
    display: flex;
    gap: 8px;
  }
  .rekap-box {
    flex: 1;
    background: #fff;
    border: 1px solid #cbd5e1;
    border-radius: 3px;
    padding: 5px;
  }
  .rekap-box-title {
    font-size: 7pt;
    font-weight: bold;
    text-transform: uppercase;
    color: #64748b;
  }
  .rekap-box-value {
    font-size: 11pt;
    font-weight: 900;
    margin: 1px 0;
  }
  .badge {
    display: inline-block;
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 7pt;
    font-weight: bold;
  }
  .badge-success { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
  .badge-warning { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
  .badge-danger { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
  .footer-note {
    margin-top: 4px;
    font-size: 6.8pt;
    color: #64748b;
    text-align: right;
    font-style: italic;
  }
</style>
</head>
<body>

  <!-- KOP SURAT -->
  <div class="kop-container">
    ${logoBase64 ? `<img src="${logoBase64}" class="kop-logo" alt="Logo" />` : ""}
    <div class="kop-text">
      <div class="kop-pemerintah">PEMERINTAH PROVINSI SULAWESI SELATAN</div>
      <div class="kop-dinas">DINAS PENDIDIKAN</div>
      <div class="kop-sekolah">UPT SMK NEGERI 2 PAREPARE</div>
      <div class="kop-alamat">Jl. Jend. Ahmad Yani No. 151 ☎ (0421) 21962 - Fax. (0421) 28149 Parepare 91131</div>
      <div class="kop-alamat">Email: smkn2pare2@gmail.com &nbsp;&nbsp;&nbsp; Website: www.smknegeri2parepare.sch.id</div>
    </div>
  </div>
  <div class="double-line-1"></div>
  <div class="double-line-2"></div>

  <!-- JUDUL DOKUMEN -->
  <div class="doc-title">JADWAL PELAKSANAAN PEMBELAJARAN TATAP MUKA DI KELAS</div>

  <!-- IDENTITAS GURU -->
  <div class="meta-grid">
    <div class="meta-col">
      <div class="meta-row"><span class="meta-label">NAMA GURU</span><span>: &nbsp;${teacher.name}</span></div>
      <div class="meta-row"><span class="meta-label">NIP / GOL</span><span>: &nbsp;${teacher.nip || "-"}</span></div>
    </div>
    <div class="meta-col">
      <div class="meta-row"><span class="meta-label">SEMESTER / TP</span><span>: &nbsp;Ganjil / 2026-2027</span></div>
      <div class="meta-row"><span class="meta-label">BERLAKU</span><span>: &nbsp;13 Juli 2026</span></div>
    </div>
  </div>

  <!-- TABEL JADWAL -->
  <table class="schedule-table">
    <thead>
      <tr>
        <th colspan="2">JAM</th>
        <th>No</th>
        <th>MATA PELAJARAN</th>
        <th>KELAS</th>
        <th>RUANG</th>
        <th>JTM</th>
      </tr>
    </thead>
    <tbody>
      ${tableRowsHtml}
    </tbody>
  </table>

  <!-- REKAPITULASI -->
  <div class="rekap-card">
    <div class="rekap-header">
      <span>REKAPITULASI BEBAN KERJA &amp; TUGAS TAMBAHAN GURU</span>
      <span style="font-size: 7pt; font-weight: normal; color: #475569;">Permendikdasmen No. 11 Tahun 2025</span>
    </div>
    <div class="rekap-grid">
      <div class="rekap-box">
        <div class="rekap-box-title">Beban Tatap Muka (KBM)</div>
        <div class="rekap-box-value" style="color: #1e3a8a;">${teachingHours} <span style="font-size: 7.5pt; font-weight: normal;">JP / Minggu</span></div>
        <div style="font-size: 7pt; color: #475569;">Syarat Min: <strong>${minTeaching} JP</strong> ${isMinTeachingMet ? "(✓ Terpenuhi)" : "(✗ Belum)"}</div>
      </div>
      <div class="rekap-box">
        <div class="rekap-box-title">Tugas Tambahan Diampu</div>
        <div style="margin-top: 3px;">${dutiesListHtml}</div>
        <div style="font-size: 7pt; color: #475569; margin-top: 3px; border-top: 1px solid #e2e8f0; padding-top: 2px;">
          Diakui TPG: <strong>+${recognizedDutyHours} JP</strong>
        </div>
      </div>
      <div class="rekap-box">
        <div class="rekap-box-title">Status Kelayakan Sertifikasi</div>
        <div class="rekap-box-value">${totalRecognized} <span style="font-size: 7.5pt; font-weight: normal;">/ 24 JP Diakui</span></div>
        <div style="margin-top: 2px;">${tpgStatusBadge}</div>
        <div style="font-size: 7pt; color: #64748b; margin-top: 2px;">Beban Riil Sekolah: <strong>${totalReal} JP</strong></div>
      </div>
    </div>
  </div>

  <div class="footer-note">
    Dicetak secara otomatis melalui Sistem Penjadwalan &amp; Audit Beban Kerja UPT SMK Negeri 2 Parepare
  </div>

</body>
</html>`;

    // Tulis ke temporary HTML dan jalankan Edge headless jika di Windows
    const tmpDir = os.tmpdir();
    const tmpHtml = path.join(tmpDir, `jadwal_${teacher.id}_${Date.now()}.html`);
    const tmpPdf = path.join(tmpDir, `jadwal_${teacher.id}_${Date.now()}.pdf`);

    fs.writeFileSync(tmpHtml, htmlDoc, "utf-8");

    const edgePaths = [
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    ];

    let edgeExe = null;
    for (const ep of edgePaths) {
      if (fs.existsSync(ep)) {
        edgeExe = ep;
        break;
      }
    }

    if (edgeExe) {
      try {
        await execFileAsync(edgeExe, [
          "--headless",
          "--disable-gpu",
          "--no-pdf-header-footer",
          `--print-to-pdf=${tmpPdf}`,
          tmpHtml,
        ]);

        if (fs.existsSync(tmpPdf) && fs.statSync(tmpPdf).size > 0) {
          const pdfBuffer = fs.readFileSync(tmpPdf);

          // Cleanup
          try {
            fs.unlinkSync(tmpHtml);
            fs.unlinkSync(tmpPdf);
          } catch {}

          const cleanTeacherName = teacher.name.replace(/[^a-zA-Z0-9_-]/g, "_");
          return new NextResponse(pdfBuffer, {
            status: 200,
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": `attachment; filename="Jadwal_${teacher.code}_${cleanTeacherName}.pdf"`,
            },
          });
        }
      } catch (edgeErr) {
        console.error("Gagal menjalankan Edge headless untuk PDF:", edgeErr);
      }
    }

    // Jika di environment tanpa Edge headless (misal Vercel Linux), kembalikan HTML dengan header print otomatis
    return new NextResponse(htmlDoc, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (err: any) {
    console.error("Error generating teacher schedule PDF:", err);
    return NextResponse.json({ error: err.message || "Gagal mencetak jadwal guru" }, { status: 500 });
  }
}
