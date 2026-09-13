// Bundles the Node.js sidecar and compiles it into a standalone executable that
// Tauri can ship via `bundle.externalBin` (named with the Rust target triple).
import { execFileSync, execSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const pkgCli = createRequire(import.meta.url).resolve('@yao-pkg/pkg/lib-es5/bin.js');
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(projectRoot);

const SIDECAR_NAME = 'flagcount-sidecar';
const NODE_TARGET = 'node24';

const bundlePath = join(projectRoot, 'sidecar', 'dist', 'index.cjs');
const targetTriple = execSync('rustc --print host-tuple').toString().trim();
const extension = process.platform === 'win32' ? '.exe' : '';
const outputPath = join(projectRoot, 'src-tauri', 'binaries', `${SIDECAR_NAME}-${targetTriple}${extension}`);

const pkgPlatform = { win32: 'win', darwin: 'macos', linux: 'linux' }[process.platform];
if (!pkgPlatform) {
  throw new Error(`Unsupported platform: ${process.platform}`);
}

function newestModifiedTime(path) {
  const stat = statSync(path);
  if (!stat.isDirectory()) return stat.mtimeMs;
  return Math.max(...readdirSync(path).map((entry) => newestModifiedTime(join(path, entry))));
}

if (process.argv.includes('--if-needed')) {
  const inputs = [
    join(projectRoot, 'sidecar', 'src'),
    join(projectRoot, 'shared'),
    join(projectRoot, 'package-lock.json'),
    fileURLToPath(import.meta.url)
  ];
  const newestInput = Math.max(...inputs.map(newestModifiedTime));
  try {
    if (statSync(outputPath).mtimeMs >= newestInput) {
      console.log('Sidecar is up to date');
      process.exit(0);
    }
  } catch {
    // A missing output is built below.
  }
}

await build({
  // esbuild captures the working directory when it is imported, before the chdir above.
  absWorkingDir: projectRoot,
  entryPoints: ['./sidecar/src/index.ts'],
  outfile: bundlePath,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  define: { __FLAGCOUNT_VERSION__: JSON.stringify(process.env['npm_package_version'] ?? '0.0.0') },
  logLevel: 'warning'
});

mkdirSync('src-tauri/binaries', { recursive: true });

execFileSync(
  process.execPath,
  [pkgCli, bundlePath, '--targets', `${NODE_TARGET}-${pkgPlatform}-${process.arch}`, '--output', outputPath],
  { stdio: 'inherit' }
);

console.log(`Sidecar written to ${outputPath}`);
