import { readFileSync, writeFileSync } from 'node:fs';

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const files = {
  package: 'package.json',
  lock: 'package-lock.json',
  cargo: 'src-tauri/Cargo.toml',
  tauri: 'src-tauri/tauri.conf.json'
};

function readVersions() {
  const packageJson = JSON.parse(readFileSync(files.package, 'utf8'));
  const packageLock = JSON.parse(readFileSync(files.lock, 'utf8'));
  const tauriConfig = JSON.parse(readFileSync(files.tauri, 'utf8'));
  const cargoToml = readFileSync(files.cargo, 'utf8');
  const cargoVersion = /^version\s*=\s*"([^"]+)"/m.exec(cargoToml)?.[1];

  return {
    [files.package]: packageJson.version,
    [`${files.lock} (root)`]: packageLock.version,
    [`${files.lock} (package)`]: packageLock.packages?.['']?.version,
    [files.cargo]: cargoVersion,
    [files.tauri]: tauriConfig.version
  };
}

function assertVersion(version) {
  if (!SEMVER_PATTERN.test(version)) {
    throw new Error(`Ungültige SemVer-Version: ${version}`);
  }
}

function check(expected) {
  if (expected) assertVersion(expected);
  const versions = readVersions();
  const unique = new Set(Object.values(versions));
  if (unique.size !== 1 || [...unique].some((version) => typeof version !== 'string')) {
    const details = Object.entries(versions).map(([file, version]) => `  ${file}: ${version ?? 'fehlt'}`).join('\n');
    throw new Error(`Versionsnummern stimmen nicht überein:\n${details}`);
  }
  const [current] = unique;
  assertVersion(current);
  if (expected && current !== expected) {
    throw new Error(`Release-Tag erwartet ${expected}, die App hat aber Version ${current}.`);
  }
  console.log(`Version ${current} ist konsistent.`);
}

function setVersion(version) {
  assertVersion(version);

  const packageJson = JSON.parse(readFileSync(files.package, 'utf8'));
  packageJson.version = version;
  writeFileSync(files.package, `${JSON.stringify(packageJson, null, 2)}\n`);

  const packageLock = JSON.parse(readFileSync(files.lock, 'utf8'));
  packageLock.version = version;
  packageLock.packages[''].version = version;
  writeFileSync(files.lock, `${JSON.stringify(packageLock, null, 2)}\n`);

  const tauriConfig = JSON.parse(readFileSync(files.tauri, 'utf8'));
  tauriConfig.version = version;
  writeFileSync(files.tauri, `${JSON.stringify(tauriConfig, null, 2)}\n`);

  const cargoToml = readFileSync(files.cargo, 'utf8');
  const cargoVersionPattern = /(^\[package\][\s\S]*?^version\s*=\s*)"[^"]+"/m;
  if (!cargoVersionPattern.test(cargoToml)) throw new Error(`Version in ${files.cargo} nicht gefunden.`);
  const nextCargoToml = cargoToml.replace(cargoVersionPattern, `$1"${version}"`);
  writeFileSync(files.cargo, nextCargoToml);

  check(version);
}

const [command, value] = process.argv.slice(2);
if (command === '--check') {
  check(value);
} else if (command) {
  setVersion(command);
} else {
  throw new Error('Verwendung: npm run version:set -- <version> oder npm run version:check -- [version]');
}
