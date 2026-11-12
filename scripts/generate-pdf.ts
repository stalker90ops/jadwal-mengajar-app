import { app, BrowserWindow } from 'electron';
import path from 'path';

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
    },
  });

  const htmlPath = path.join(process.cwd(), 'public', 'panduan-jadwal-mengajar.html');
  await win.loadFile(htmlPath);

  const pdfData = await win.webContents.printToPDF({
    pageSize: 'A4',
    printBackground: true,
    margins: {
      marginType: 'custom',
      top: 0.5,
      bottom: 0.5,
      left: 0.5,
      right: 0.5,
    },
  });

  const fs = await import('fs');
  const outPath = path.join(process.cwd(), 'public', 'Buku-Panduan-Aplikasi-Jadwal-Mengajar.pdf');
  fs.writeFileSync(outPath, pdfData);
  console.log('PDF_GENERATED_SUCCESS:', outPath);

  app.quit();
});
