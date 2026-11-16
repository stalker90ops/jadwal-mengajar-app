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

    const [activeDays, schedules, additionalDuties, rawPrintConfig] = await Promise.all([
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
      prisma.schoolPrintConfig.findUnique({
        where: { id: "default" },
      }),
    ]);

    const printConfig = rawPrintConfig ?? {
      logoDataUrl: null,
      govLine: "PEMERINTAH PROVINSI SULAWESI SELATAN",
      deptLine: "DINAS PENDIDIKAN",
      schoolName: "UPT SMK NEGERI 2 PAREPARE",
      addressLine: "Jl. Jend. Ahmad Yani No. 151 ☎ (0421) 21962 - Fax. (0421) 28149 Parepare 91131",
      contactLine: "Email: smkn2pare2@gmail.com     Website: www.smknegeri2parepare.sch.id",
      docTitle: "JADWAL PELAKSANAAN PEMBELAJARAN TATAP MUKA DI KELAS",
      semesterTp: "Ganjil / 2026-2027",
      effectiveDate: "13 Juli 2026",
    };

    // Gunakan logo kustom dari database atau fallback ke /logo-sulsel.png
    let logoSrc = printConfig.logoDataUrl || "";
    if (!logoSrc) {
      const logoPath = path.join(process.cwd(), "public", "logo-sulsel.png");
      if (fs.existsSync(logoPath)) {
        logoSrc = `data:image/png;base64,${fs.readFileSync(logoPath).toString("base64")}`;
      }
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
    const totalRecognized = teachingHours + recognizedDutyHours;

    const minTeaching = hasTTU ? 12 : ttleHours > 0 ? 18 : 24;
    const isMinTeachingMet = teachingHours >= minTeaching;
    const isValidTPG = totalRecognized >= 24 && isMinTeachingMet;

    // Struktur baris tabel
    let tableRowsHtml = "";

    activeDays.forEach((day) => {
      const slots = [...day.timeSlots].sort((a, b) => a.periodNumber - b.periodNumber);
      const processedSlots: any[] = [];

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
            subjectName:
              slot.label.toLowerCase().includes("ishoma") || slot.label.toLowerCase().includes("sholat")
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

      const totalDayRows = finalDayRows.length;
      finalDayRows.forEach((row, rIdx) => {
        const isFirst = rIdx === 0;
        let dayCell = "";
        if (isFirst) {
          dayCell = `<td rowspan="${totalDayRows}" class="day-col">${day.dayName.toUpperCase()}</td>`;
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

    const dutiesSummaryText =
      additionalDuties.length === 0
        ? "Tidak ada"
        : additionalDuties
            .map(
              (d) =>
                `${d.name} (+${d.equivalentHours} JP${d.nomorSk ? `, SK: ${d.nomorSk}` : ""})`
            )
            .join("; ");

    const tpgStatusBadge = isValidTPG
      ? `<span class="badge badge-success">🟢 VALID TPG</span>`
      : !isMinTeachingMet
      ? `<span class="badge badge-warning">🟡 KURANG TM</span>`
      : `<span class="badge badge-danger">🔴 KURANG JP</span>`;

    const htmlDoc = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>Jadwal_${teacher.code}_${teacher.name}</title>
<style>
  @page {
    size: A4 portrait;
    margin: 5mm 7mm 5mm 7mm;
  }
  html, body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #000;
    margin: 0;
    padding: 0;
    font-size: 7pt;
    line-height: 1.15;
    background: #fff;
  }
  .kop-container {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-bottom: 3px;
  }
  .kop-logo {
    width: 50px;
    max-height: 58px;
    object-fit: contain;
  }
  .kop-text {
    flex: 1;
    text-align: center;
    line-height: 1.1;
  }
  .kop-pemerintah, .kop-dinas {
    font-size: 10pt;
    font-weight: 900;
    text-transform: uppercase;
    font-family: 'Times New Roman', serif;
  }
  .kop-sekolah {
    font-size: 11.5pt;
    font-weight: 900;
    text-transform: uppercase;
    font-family: 'Times New Roman', serif;
  }
  .kop-alamat {
    font-size: 6.8pt;
    color: #000;
    margin-top: 1px;
  }
  .double-line-1 {
    border-bottom: 2px solid #000;
    margin-bottom: 1px;
  }
  .double-line-2 {
    border-bottom: 1px solid #000;
    margin-bottom: 4px;
  }
  .doc-title {
    text-align: center;
    font-weight: 900;
    font-size: 9pt;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    margin-bottom: 4px;
  }
  .meta-grid {
    display: flex;
    justify-content: space-between;
    font-size: 7.5pt;
    font-weight: bold;
    margin-bottom: 4px;
    border-bottom: 1px solid #cbd5e1;
    padding-bottom: 3px;
  }
  .meta-col {
    width: 49%;
  }
  .meta-row {
    display: flex;
    margin-bottom: 1px;
  }
  .meta-label {
    width: 92px;
  }
  table.schedule-table {
    width: 100%;
    border-collapse: collapse;
    border: 1.5px solid #000;
    font-size: 6.7pt;
    line-height: 1.1;
  }
  table.schedule-table th {
    background-color: #fb923c;
    color: #000;
    font-weight: 900;
    text-transform: uppercase;
    border: 1px solid #000;
    padding: 2px 3px;
    text-align: center;
  }
  table.schedule-table td {
    border: 1px solid #000;
    padding: 1.2px 3px;
    vertical-align: middle;
  }
  .day-col {
    background-color: #9388a2;
    color: #000;
    font-weight: 900;
    text-align: center;
    width: 20px;
    font-size: 7.2pt;
    writing-mode: vertical-rl;
    transform: rotate(180deg);
  }
  .time-col {
    text-align: center;
    white-space: nowrap;
    width: 72px;
    font-size: 6.5pt;
  }
  .num-col {
    text-align: center;
    font-weight: bold;
    width: 18px;
  }
  .subject-col {
    font-weight: bold;
    text-transform: uppercase;
  }
  .class-col {
    text-align: center;
    font-weight: bold;
    width: 54px;
  }
  .room-col {
    text-align: center;
    font-weight: bold;
    width: 46px;
  }
  .jtm-col {
    text-align: center;
    font-weight: 900;
    font-size: 7.5pt;
    width: 32px;
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
  .rekap-bar {
    margin-top: 4px;
    border: 1.5px solid #000;
    border-radius: 3px;
    background: #f8fafc;
    padding: 4px 6px;
    font-size: 6.8pt;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  .badge {
    display: inline-block;
    padding: 1px 4px;
    border-radius: 2px;
    font-size: 6.5pt;
    font-weight: bold;
  }
  .badge-success { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
  .badge-warning { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
  .badge-danger { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
</style>
</head>
<body>
  <div id="print-root">
    <!-- KOP SURAT -->
    <div class="kop-container">
      ${logoSrc ? `<img src="${logoSrc}" class="kop-logo" alt="Logo" />` : ""}
      <div class="kop-text">
        <div class="kop-pemerintah">${printConfig.govLine}</div>
        <div class="kop-dinas">${printConfig.deptLine}</div>
        <div class="kop-sekolah">${printConfig.schoolName}</div>
        ${printConfig.addressLine ? `<div class="kop-alamat">${printConfig.addressLine}</div>` : ""}
        ${printConfig.contactLine ? `<div class="kop-alamat">${printConfig.contactLine}</div>` : ""}
      </div>
    </div>
    <div class="double-line-1"></div>
    <div class="double-line-2"></div>

    <!-- JUDUL DOKUMEN -->
    <div class="doc-title">${printConfig.docTitle}</div>

    <!-- IDENTITAS GURU -->
    <div class="meta-grid">
      <div class="meta-col">
        <div class="meta-row"><span class="meta-label">NAMA GURU</span><span>: &nbsp;${teacher.name}</span></div>
        <div class="meta-row"><span class="meta-label">NIP / GOL</span><span>: &nbsp;${teacher.nip || "-"}</span></div>
      </div>
      <div class="meta-col">
        <div class="meta-row"><span class="meta-label">SEMESTER / TP</span><span>: &nbsp;${printConfig.semesterTp}</span></div>
        <div class="meta-row"><span class="meta-label">BERLAKU</span><span>: &nbsp;${printConfig.effectiveDate}</span></div>
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

    <!-- REKAPITULASI RINGKAS 1 BARIS -->
    <div class="rekap-bar">
      <div>
        <strong>Tatap Muka:</strong> ${teachingHours} JP &nbsp;|&nbsp;
        <strong>Tugas Tambahan:</strong> ${dutiesSummaryText}
      </div>
      <div style="white-space: nowrap; font-weight: bold;">
        Total Diakui: ${totalRecognized}/24 JP &nbsp; ${tpgStatusBadge}
      </div>
    </div>
  </div>

  <script>
    (function() {
      var root = document.getElementById('print-root');
      if (root) {
        var maxH = 1040;
        var h = root.scrollHeight;
        if (h > maxH) {
          root.style.zoom = (maxH / h).toFixed(3);
        }
      }
    })();
  </script>
</body>
</html>`;

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
