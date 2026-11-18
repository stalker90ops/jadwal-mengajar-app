const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = process.cwd();
const standaloneDir = path.join(rootDir, '.next', 'standalone');
const staticDir = path.join(rootDir, '.next', 'static');
const publicDir = path.join(rootDir, 'public');
const envPath = path.join(rootDir, '.env');
const outDir = path.join(rootDir, 'dist-directadmin');
const tarPath = path.join(rootDir, 'jadwal-standalone.tar.gz');

if (!fs.existsSync(standaloneDir)) {
  console.error('Error: .next/standalone tidak ditemukan. Jalankan npm run build terlebih dahulu.');
  process.exit(1);
}

// 1. Bersihkan folder output & arsip lama
fs.rmSync(outDir, { recursive: true, force: true });
fs.rmSync(tarPath, { force: true });
fs.mkdirSync(outDir, { recursive: true });

// Helper copy recursive yang juga skip item tertentu
function copyRecursive(src, dest, shouldSkip) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      const srcChild = path.join(src, entry);
      const destChild = path.join(dest, entry);
      if (shouldSkip && shouldSkip(srcChild, entry)) continue;
      copyRecursive(srcChild, destChild, shouldSkip);
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

console.log('1. Menyalin .next/standalone -> dist-directadmin...');
copyRecursive(standaloneDir, outDir, (srcPath, name) => {
  // Jangan ikutkan .env asli mentah (akan kita tulis bersih) & hapus binary Windows
  if (srcPath === path.join(standaloneDir, '.env')) return true;
  if (name === 'query_engine-windows.dll.node') return true;
  // Jangan ikutkan folder unrelated jika ikut ter-trace
  if (name === 'app pelaporan' || name === 'koreksi ketikan' || name === 'configwin') return true;
  return false;
});

console.log('2. Menyalin .next/static...');
copyRecursive(staticDir, path.join(outDir, '.next', 'static'));

console.log('3. Menyalin public...');
if (fs.existsSync(publicDir)) {
  copyRecursive(publicDir, path.join(outDir, 'public'));
}

console.log('4. Membuat .env produksi dengan database Neon...');
let envContent = '';
if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf8').replace(/\r\n/g, '\n').trim() + '\n';
}
if (!/^JWT_SECRET=/m.test(envContent)) {
  envContent += 'JWT_SECRET="smkn2parepare-jadwal-jwt-secret-key-2026"\n';
}
if (!/^NODE_ENV=/m.test(envContent)) {
  envContent += 'NODE_ENV="production"\n';
}
fs.writeFileSync(path.join(outDir, '.env'), envContent, 'utf8');

console.log('5. Membuat entrypoint server.cjs untuk CloudLinux Passenger...');
const originalServerJs = fs.readFileSync(path.join(standaloneDir, 'server.js'), 'utf8');
// Ekstrak nextConfig JSON dari standalone/server.js
const configMatch = originalServerJs.match(/const nextConfig = (\{[\s\S]*?\})\s*\n/);
const serializedConfig = configMatch ? configMatch[1] : '{"output":"standalone"}';

const serverCjs = `const fs = require('fs');
const path = require('path');

// Load .env di folder aplikasi secara sinkron sebelum Next.js / Prisma dimulai
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, 'utf8').split(/\\r?\\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

const dir = path.join(__dirname);
process.env.NODE_ENV = 'production';
process.chdir(__dirname);

const currentPort = parseInt(process.env.PORT, 10) || 3000;
const hostname = process.env.HOSTNAME || '0.0.0.0';

let keepAliveTimeout = parseInt(process.env.KEEP_ALIVE_TIMEOUT, 10);
const nextConfig = ${serializedConfig};

process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(nextConfig);

require('next');
const { startServer } = require('next/dist/server/lib/start-server');

if (
  Number.isNaN(keepAliveTimeout) ||
  !Number.isFinite(keepAliveTimeout) ||
  keepAliveTimeout < 0
) {
  keepAliveTimeout = undefined;
}

startServer({
  dir,
  isDev: false,
  config: nextConfig,
  hostname,
  port: currentPort,
  allowRetry: false,
  keepAliveTimeout,
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
`;

fs.writeFileSync(path.join(outDir, 'server.cjs'), serverCjs, 'utf8');

console.log('6. Mengarsipkan ke jadwal-standalone.tar.gz...');
const pyScript = [
  'import tarfile, os',
  `out_dir = r"${outDir}"`,
  `tar_path = r"${tarPath}"`,
  'with tarfile.open(tar_path, "w:gz") as tar:',
  '    for root, dirs, files in os.walk(out_dir):',
  '        for d in dirs:',
  '            full = os.path.join(root, d)',
  '            rel = os.path.relpath(full, out_dir).replace("\\\\", "/")',
  '            ti = tar.gettarinfo(full, arcname=rel)',
  '            ti.mode = 0o755',
  '            tar.addfile(ti)',
  '        for f in files:',
  '            full = os.path.join(root, f)',
  '            rel = os.path.relpath(full, out_dir).replace("\\\\", "/")',
  '            ti = tar.gettarinfo(full, arcname=rel)',
  '            ti.mode = 0o755 if (rel.endswith(".so.node") or rel.endswith(".sh") or "/.bin/" in rel) else 0o644',
  '            with open(full, "rb") as fp:',
  '                tar.addfile(ti, fp)',
].join('\n');
require('child_process').execFileSync('python', ['-c', pyScript], { stdio: 'inherit' });

const tarSizeMb = (fs.statSync(tarPath).size / (1024 * 1024)).toFixed(2);
console.log(`Selesai! Paket siap upload: ${tarPath} (${tarSizeMb} MB)`);
