#!/usr/bin/env node
// Keep the npm package, lockfile, and plugin at one version.
// Usage: node scripts/bump.mjs patch|minor|major|X.Y.Z
// Commit the bump together with the change it ships; this never tags or publishes.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const write = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

function components(value) {
  if (typeof value !== 'string' || !SEMVER.test(value)) throw new Error(`version "${value}" is not X.Y.Z`);
  const parts = value.split('.').map(Number);
  if (!parts.every(Number.isSafeInteger)) throw new Error('Version components must be safe integers');
  return parts;
}

export function nextVersion(current, spec) {
  const parts = components(current);
  const bumps = { major: 0, minor: 1, patch: 2 };
  const index = Object.hasOwn(bumps, spec) ? bumps[spec] : undefined;
  if (index !== undefined) {
    parts[index] += 1;
    if (!Number.isSafeInteger(parts[index])) throw new Error('Version component overflow');
    for (let i = index + 1; i < 3; i += 1) parts[i] = 0;
    return parts.join('.');
  }
  let target;
  try { target = components(spec); } catch { throw new Error(`"${spec}" is not patch, minor, major or X.Y.Z`); }
  const firstDifference = target.findIndex((part, i) => part !== parts[i]);
  if (firstDifference === -1 || target[firstDifference] < parts[firstDifference]) throw new Error(`${spec} is not newer than ${current}`);
  return spec;
}

export function bumpVersion(root, spec) {
  const files = [join(root, 'package.json'), join(root, 'package-lock.json'), join(root, '.claude-plugin', 'plugin.json')];
  // Parse and check all files before writing any; a broken lock/plugin cannot
  // leave the package manifest bumped by itself.
  const [pkg, lock, plugin] = files.map(read);
  const current = pkg.version;
  const next = nextVersion(current, spec);
  if (lock.version !== current || lock.packages?.['']?.version !== current || plugin.version !== current) {
    throw new Error('Package, lockfile, and plugin versions must agree before a bump');
  }
  pkg.version = next;
  lock.version = next;
  lock.packages[''].version = next;
  // The lockfile records the package name too; keep it identical to the manifest.
  lock.name = pkg.name;
  lock.packages[''].name = pkg.name;
  plugin.version = next;
  [pkg, lock, plugin].forEach((value, i) => write(files[i], value));
  return { current, next, files };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3) throw new Error('usage: node scripts/bump.mjs patch|minor|major|X.Y.Z');
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const { current, next } = bumpVersion(root, process.argv[2]);
    console.log(`linkedin-api-mcp moved from ${current} to ${next} (package, lockfile, plugin)`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
