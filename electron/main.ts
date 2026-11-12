import { app, BrowserWindow, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import net from 'net';
import { fork, ChildProcess } from 'child_process';

let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;
let currentPort = 3128;

function findAvailablePort(startPort: number): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(startPort, () => {
      server.once('close', () => resolve(startPort));
      server.close();
    });
    server.on('error', () => {
      resolve(findAvailablePort(startPort + 1));
    });
  });
}

function setupDatabasePath(): string {
  const appDataDir = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const targetDir = path.join(appDataDir, 'JadwalMengajar');
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  const dbFile = path.join(targetDir, 'app.db');
  return `file:${dbFile.replace(/\\/g, '/')}`;
}

async function startServer(port: number): Promise<void> {
  const dbUrl = setupDatabasePath();
  process.env.DATABASE_URL = dbUrl;
  process.env.PORT = String(port);
  process.env.HOSTNAME = '127.0.0.1';
  (process.env as any).NODE_ENV = 'production';

  // Jalur lokasi server.js Next.js standalone
  const candidatePaths = [
    path.join(process.resourcesPath, 'app', 'server.js'),
    path.join(process.resourcesPath, 'app', '.next', 'standalone', 'server.js'),
    path.join(__dirname, '..', '.next', 'standalone', 'server.js'),
    path.join(__dirname, '..', 'server.js'),
  ];

  let serverPath = candidatePaths.find((p) => fs.existsSync(p));

  return new Promise((resolve, reject) => {
    if (!serverPath) {
      return reject(
        new Error(`server.js Next.js tidak ditemukan di: \n${candidatePaths.join('\n')}`)
      );
    }

    try {
      const serverCwd = path.dirname(serverPath);

      // Gunakan ELECTRON_RUN_AS_NODE agar file server.js dijalankan oleh engine internal Electron sebagai Node runtime
      serverProcess = fork(serverPath, [], {
        cwd: serverCwd,
        env: {
          ...process.env,
          PORT: String(port),
          HOSTNAME: '127.0.0.1',
          DATABASE_URL: dbUrl,
          NODE_ENV: 'production',
          ELECTRON_RUN_AS_NODE: '1',
        },
        execPath: process.execPath,
        stdio: 'pipe',
      });

      serverProcess.stdout?.on('data', (data) => {
        const msg = data.toString();
        console.log('[Next.js]:', msg);
        if (msg.includes('Ready') || msg.includes('Listening') || msg.includes('http')) {
          resolve();
        }
      });

      serverProcess.stderr?.on('data', (data) => {
        console.error('[Next.js Error]:', data.toString());
      });

      serverProcess.on('error', (err) => {
        reject(err);
      });

      // Berikan batas waktu inisialisasi jika tidak ada keyword spesifik di stdout
      setTimeout(() => resolve(), 4000);
    } catch (err) {
      reject(err);
    }
  });
}

function createMainWindow(port: number) {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 850,
    minWidth: 1024,
    minHeight: 700,
    title: 'Aplikasi Penjadwalan Mengajar & Roster Kurikulum',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const appUrl = `http://127.0.0.1:${port}`;
  mainWindow.loadURL(appUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      currentPort = await findAvailablePort(3128);
      await startServer(currentPort);
      createMainWindow(currentPort);
    } catch (err: any) {
      dialog.showErrorBox(
        'Gagal Memulai Aplikasi',
        `Terjadi kesalahan saat memulai server internal aplikasi:\n${err?.message || err}`
      );
      app.quit();
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', () => {
    if (serverProcess) {
      serverProcess.kill();
      serverProcess = null;
    }
  });
}
