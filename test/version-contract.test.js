// The release rule for this project: one version, in every file that carries it.
//
// The npm release workflow compares the git tag with package.json. The plugin is
// the same repository, so the plugin manifest has to carry the same version or a
// plugin install would keep serving an older server after an npm release. A bump
// that misses a file has to fail in ordinary CI, not at release time.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));

test('package.json, package-lock.json, and the plugin manifest agree on the version', () => {
  const pkg = readJson('package.json');
  const lock = readJson('package-lock.json');
  const plugin = readJson('.claude-plugin/plugin.json');

  assert.match(pkg.version, /^\d+\.\d+\.\d+$/, 'package version must be X.Y.Z');
  assert.equal(lock.version, pkg.version, 'package-lock.json must match package.json');
  assert.equal(lock.packages?.['']?.version, pkg.version, 'the lockfile root entry must match package.json');
  assert.equal(lock.name, pkg.name, 'the lockfile name must match package.json');
  assert.equal(lock.packages?.['']?.name, pkg.name, 'the lockfile root entry name must match package.json');
  assert.equal(plugin.version, pkg.version, 'the plugin manifest must match the npm package version');
});

test('the bump script moves every versioned file together', async () => {
  const { bumpVersion, nextVersion } = await import('../scripts/bump.mjs');

  assert.equal(nextVersion('0.2.0', 'patch'), '0.2.1');
  assert.equal(nextVersion('0.2.0', 'minor'), '0.3.0');
  assert.equal(nextVersion('0.2.0', 'major'), '1.0.0');
  assert.equal(nextVersion('0.2.0', '9.9.9'), '9.9.9');
  assert.throws(() => nextVersion('0.2.0', '0.2.0'), /not newer/);
  assert.throws(() => nextVersion('0.2.0', 'nope'), /not patch, minor, major/);
  assert.throws(() => nextVersion('nope', 'patch'), /not X.Y.Z/);
  assert.throws(() => nextVersion('0.2.0', 'constructor'), /not patch, minor, major/);
  assert.throws(() => nextVersion('0.2.0', '0.02.1'), /not patch, minor, major/);

  // A throwaway copy, so the real files are never touched.
  const { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'linkedin-bump-'));
  try {
    mkdirSync(join(dir, '.claude-plugin'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'linkedin-api-mcp', version: '0.2.0' }, null, 2));
    writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({ name: 'linkedin-api-mcp', version: '0.2.0', packages: { '': { name: 'linkedin-api-mcp', version: '0.2.0' } } }, null, 2));
    writeFileSync(join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify({ version: '0.2.0' }, null, 2));

    const result = bumpVersion(dir, 'minor');
    assert.equal(result.next, '0.3.0');
    assert.equal(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version, '0.3.0');
    assert.equal(JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8')).version, '0.3.0');
    assert.equal(JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8')).packages[''].version, '0.3.0');
    assert.equal(JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8')).name, 'linkedin-api-mcp');
    assert.equal(JSON.parse(readFileSync(join(dir, '.claude-plugin', 'plugin.json'), 'utf8')).version, '0.3.0');
    assert.ok(result.files.every((file) => existsSync(file)));
    const packageBefore = readFileSync(join(dir, 'package.json'), 'utf8');
    writeFileSync(join(dir, '.claude-plugin', 'plugin.json'), '{broken');
    assert.throws(() => bumpVersion(dir, 'patch'));
    assert.equal(readFileSync(join(dir, 'package.json'), 'utf8'), packageBefore, 'bad companion metadata must not leave the package bumped');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('MCP runtime version comes from package metadata', async () => {
  const { VERSION } = await import('../src/version.js');
  assert.equal(VERSION, readJson('package.json').version);
});

test('release guards reject mismatched tags and unsafe metadata', async () => {
  const { checkRelease } = await import('../scripts/check-release.mjs');
  const pkg = readJson('package.json');
  assert.equal(checkRelease(root, `v${pkg.version}`).version, pkg.version);
  assert.throws(() => checkRelease(root, pkg.version), /vX.Y.Z/);
  assert.throws(() => checkRelease(root, 'v9999.0.0'), /must match/);
});

test('npm workflow publishes only successful main pushes or explicit releases, with registry guards', () => {
  const workflow = readFileSync(join(root, '.github/workflows/npm.yml'), 'utf8');
  assert.match(workflow, /release:\s*\n\s*types: \[published\]/);
  assert.doesNotMatch(workflow, /^\s*push:/m, 'publishing waits for completed CI rather than a raw push event');
  assert.match(workflow, /workflow_run:\s*\n\s*workflows: \[ci\]/);
  assert.match(workflow, /branches: \[main\]/);
  assert.match(workflow, /workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /workflow_run\.event == 'push'/);
  assert.match(workflow, /workflow_run\.head_repository\.full_name == github\.repository/);
  assert.match(workflow, /needs\.verify\.outputs\.sha/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /check-release\.mjs/);
  assert.match(workflow, /refs\/tags\//);
  assert.match(workflow, /response\.status === 404/);
  assert.match(workflow, /--ignore-scripts/);
  assert.match(workflow, /--provenance=false/);
  assert.match(workflow, /Verify the version directly on npm/);
  assert.doesNotMatch(workflow, /secrets\.NPM_TOKEN/);
});

test('the npm package declares the same repository, license, and engines as the release expects', () => {
  const pkg = readJson('package.json');
  assert.equal(pkg.license, 'Apache-2.0');
  assert.equal(pkg.repository.type, 'git');
  assert.match(pkg.repository.url, /FiredMosquito831\/linkedin-api-mcp\.git$/);
  assert.equal(pkg.publishConfig?.access, 'public');
  assert.match(pkg.engines.node, />=/);
  // A LICENSE file is required by the npm package and by the plugin directory validator.
  assert.doesNotThrow(() => readFileSync(join(root, 'LICENSE'), 'utf8'));
});
