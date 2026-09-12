// Bundles the Node.js sidecar and compiles it into a standalone executable that
// Tauri can ship via `bundle.externalBin` (named with the Rust target triple).
import { execFileSync, execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const pkgCli = createRequire(import.meta.url).resolve('@yao-pkg/pkg/lib-es5/bin.js');

const SIDECAR_NAME = 'flagcount-sidecar';
const NODE_TARGET = 'node24';

const bundlePath = 'sidecar/dist/index.cjs';
const targetTriple = execSync('rustc --print host-tuple').toString().trim();
const extension = process.platform === 'win32' ? '.exe' : '';
const outputPath = `src-tauri/binaries/${SIDECAR_NAME}-${targetTriple}${extension}`;

const pkgPlatform = { win32: 'win', darwin: 'macos', linux: 'linux' }[process.platform];
if (!pkgPlatform) {
  throw new Error(`Unsupported platform: ${process.platform}`);
}

await build({
  entryPoints: ['sidecar/src/index.ts'],
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
  [pkgCli, bundlePath, '--targets', `${NODE_TARGET}-${pkgPlatform}-${process.arch}`, '--output', outputPath],
  { stdio: 'inherit' }
);

console.log(`Sidecar written to ${outputPath}`);
