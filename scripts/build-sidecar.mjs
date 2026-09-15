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
const targetIndex = process.argv.indexOf('--target');
const requestedTarget = targetIndex >= 0 ? process.argv[targetIndex + 1] : undefined;
if (targetIndex >= 0 && !requestedTarget) throw new Error('--target requires a Rust target triple');
const targetTriple = requestedTarget ?? execSync('rustc --print host-tuple').toString().trim();
const TARGETS = {
  'x86_64-pc-windows-msvc': { platform: 'win', arch: 'x64', extension: '.exe' },
  'aarch64-pc-windows-msvc': { platform: 'win', arch: 'arm64', extension: '.exe' },
  'x86_64-apple-darwin': { platform: 'macos', arch: 'x64', extension: '' },
  'aarch64-apple-darwin': { platform: 'macos', arch: 'arm64', extension: '' },
  'x86_64-unknown-linux-gnu': { platform: 'linux', arch: 'x64', extension: '' },
  'aarch64-unknown-linux-gnu': { platform: 'linux', arch: 'arm64', extension: '' }
};
const selected = TARGETS[targetTriple];
if (!selected) throw new Error(`Unsupported Rust target: ${targetTriple}`);
const extension = selected.extension;
const outputPath = join(projectRoot, 'src-tauri', 'binaries', `${SIDECAR_NAME}-${targetTriple}${extension}`);

const pkgPlatform = selected.platform;

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
  entryPoints: [join(projectRoot, 'sidecar', 'src', 'index.ts')],
  outfile: bundlePath,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  logLevel: 'warning'
});

mkdirSync('src-tauri/binaries', { recursive: true });

execFileSync(
  process.execPath,
  [pkgCli, bundlePath, '--targets', `${NODE_TARGET}-${pkgPlatform}-${selected.arch}`, '--output', outputPath],
  { stdio: 'inherit' }
);

console.log(`Sidecar written to ${outputPath}`);
