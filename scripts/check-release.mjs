#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function checkRelease(root, tag) {
  const read = (name) => JSON.parse(readFileSync(join(root, name), 'utf8'));
  const pkg = read('package.json');
  const lock = read('package-lock.json');
  const plugin = read('.claude-plugin/plugin.json');
  if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag ?? '')) throw new Error('Release tag must be vX.Y.Z');
  const version = tag.slice(1);
  if ([pkg.version, lock.version, lock.packages?.['']?.version, plugin.version].some((value) => value !== version)) {
    throw new Error('Release tag, package, lockfile, and plugin versions must match');
  }
  if (pkg.name !== 'linkedin-api-mcp') throw new Error('Unexpected npm package name');
  if (pkg.private === true || pkg.publishConfig?.access !== 'public') throw new Error('Package must be explicitly publishable as public');
  if (pkg.repository?.url !== 'git+https://github.com/FiredMosquito831/linkedin-api-mcp.git') throw new Error('Repository metadata must match the trusted publisher repository');
  if (pkg.license !== 'Apache-2.0' || plugin.license !== pkg.license) throw new Error('Package and plugin licenses must match');
  return { name: pkg.name, version, tag };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    console.log(JSON.stringify(checkRelease(root, process.argv[2])));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
