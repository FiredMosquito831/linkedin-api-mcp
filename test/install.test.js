// Install surface: harness adapters, environment doctor, Chromium download,
// and the command registrations. No real harness CLI ever runs: the command
// runner and PATH lookup are injected, and every file operation happens in a
// temporary home and project directory.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { Command } from 'commander';
import { HARNESSES, harnessDefinitions } from '../src/install/harnesses.js';
import { checkEnvironment, installChromium } from '../src/install/doctor.js';
import { registerInstallCommands } from '../src/install/cli.js';

function sink() {
  return { value: '', write(value) { this.value += value; } };
}

async function workspace(t, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'linkedin-install-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const home = join(dir, 'home');
  const projectDir = join(dir, 'project');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(projectDir, { recursive: true });
  const calls = [];
  const execute = options.execute ?? (async (command, args) => {
    calls.push({ command, args });
    return { code: 0, stdout: '', stderr: '' };
  });
  const which = options.which ?? (() => true);
  const definitions = harnessDefinitions({
    home,
    projectDir,
    source: 'owner/repo',
    marketplace: 'test-marketplace',
    plugin: 'linkedin',
    serverCommand: 'node',
    serverArgs: ['server.js', 'mcp'],
    execute,
    which,
  });
  return { dir, home, projectDir, calls, execute, which, definitions };
}

function details(steps) {
  return steps.map((entry) => entry.detail);
}

function statuses(steps) {
  return steps.map((entry) => entry.status);
}

test('HARNESSES names every adapter and its supported scopes', () => {
  assert.deepEqual(Object.keys(HARNESSES), ['claude', 'codex', 'opencode', 'antigravity']);
  for (const definition of Object.values(HARNESSES)) {
    assert.equal(typeof definition.name, 'string');
    assert.equal(typeof definition.notes, 'string');
    assert.ok(definition.scopes.length > 0, 'every harness lists its scopes');
  }
  assert.equal(HARNESSES.antigravity.cli, 'agy');
  assert.deepEqual(HARNESSES.antigravity.scopes, ['global']);
  assert.equal(HARNESSES.opencode.cli, null, 'opencode has no CLI');
});

test('claude install and uninstall record the CLI calls and keep settings keys', async (t) => {
  const { calls, definitions, projectDir, home } = await workspace(t);
  const file = join(projectDir, '.claude', 'settings.json');
  fs.mkdirSync(dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({
    theme: 'dark',
    enabledPlugins: { 'keep-me@other-marketplace': true },
    extraKnownMarketplaces: { 'other-marketplace': { source: { source: 'github', repo: 'x/y' } } },
  }, null, 2));

  let steps = await definitions.claude.install('global');
  assert.deepEqual(statuses(steps), ['ok', 'ok']);
  assert.deepEqual(calls[0], { command: 'claude', args: ['plugin', 'marketplace', 'add', 'owner/repo', '--scope', 'user'] });
  assert.deepEqual(calls[1], { command: 'claude', args: ['plugin', 'install', 'linkedin@test-marketplace', '--scope', 'user', '-y'] });
  assert.ok(!fs.existsSync(join(home, '.claude', 'settings.json')), 'global install leaves no user settings file behind');

  steps = await definitions.claude.install('project');
  assert.equal(statuses(steps).includes('failed'), false);
  const merged = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(merged.theme, 'dark', 'unrelated keys survive the merge');
  assert.equal(merged.enabledPlugins['keep-me@other-marketplace'], true);
  assert.equal(merged.extraKnownMarketplaces['other-marketplace'].source.repo, 'x/y');
  assert.equal(merged.extraKnownMarketplaces['test-marketplace'].source.repo, 'owner/repo');
  assert.equal(merged.enabledPlugins['linkedin@test-marketplace'], true);

  steps = await definitions.claude.uninstall('project');
  assert.equal(statuses(steps).includes('failed'), false);
  const afterUninstall = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(afterUninstall.enabledPlugins['linkedin@test-marketplace'], undefined, 'the plugin entry is removed');
  assert.equal(afterUninstall.extraKnownMarketplaces['test-marketplace'], undefined, 'the project install does not add a marketplace entry');
  assert.equal(afterUninstall.enabledPlugins['keep-me@other-marketplace'], true);
  assert.equal(afterUninstall.theme, 'dark');
  const commands = calls.map((entry) => entry.args.join(' ')).join('\n');
  assert.match(commands, /mcp +remove +linkedin +--scope +user/);
  assert.match(commands, /mcp +remove +linkedin +--scope +project/);
});

test('a missing claude CLI is a single skipped step without any command execution', async (t) => {
  const { calls, definitions } = await workspace(t, { which: () => false });
  for (const action of ['install', 'uninstall', 'doctor']) {
    const steps = await definitions.claude[action]('global');
    assert.equal(steps.length, 1, `${action} returns one step`);
    assert.equal(steps[0].status, 'skipped');
    assert.match(steps[0].detail, /not found on PATH/i);
  }
  assert.equal(calls.length, 0);
});

test('codex install adds the TOML table, never duplicates it, and uninstall leaves the other tables', async (t) => {
  const { calls, definitions, home, projectDir } = await workspace(t);
  const global = join(home, '.codex', 'config.toml');
  fs.mkdirSync(dirname(global), { recursive: true });
  const seed = `[analytics]\nenabled = true\n\n[mcp_servers.other]\ncommand = "keep"\n`;
  fs.writeFileSync(global, seed);

  let steps = await definitions.codex.install('global');
  assert.equal(statuses(steps).includes('failed'), false);
  assert.deepEqual(calls[0], { command: 'codex', args: ['plugin', 'marketplace', 'add', 'owner/repo'] });
  assert.deepEqual(calls[1], { command: 'codex', args: ['plugin', 'add', 'linkedin@test-marketplace'] });
  let text = fs.readFileSync(global, 'utf8');
  assert.match(text, /mcp_servers\.linkedin/);
  assert.match(text, /command = "node"/);
  assert.match(text, /args = \["server\.js", "mcp"\]/);
  assert.match(text, /enabled = true/);
  assert.match(text, /command = "keep"/);

  steps = await definitions.codex.install('global');
  text = fs.readFileSync(global, 'utf8');
  assert.equal(text.match(/\[mcp_servers\.linkedin\]/g).length, 1, 'rerunning the install never duplicates the table');

  const project = join(projectDir, '.codex', 'config.toml');
  fs.mkdirSync(dirname(project), { recursive: true });
  fs.writeFileSync(project, seed + `\n[mcp_servers.linkedin.env]\nTOKENS_OFF = "true"\n`);
  calls.length = 0;
  steps = await definitions.codex.install('project');
  assert.deepEqual(statuses(steps), ['ok']);
  assert.equal(calls.length, 0, 'project scope writes the file without running the CLI');

  steps = await definitions.codex.uninstall('project');
  assert.deepEqual(statuses(steps), ['ok']);
  text = fs.readFileSync(project, 'utf8');
  assert.equal(text.includes('[mcp_servers.linkedin]'), false, 'the table and its sub-tables are removed');
  assert.equal(text.includes('TOKENS_OFF'), false);
  assert.match(text, /mcp_servers\.other/);
  assert.match(text, /command = "keep"/);

  steps = await definitions.codex.uninstall('global');
  assert.deepEqual(statuses(steps), ['ok']);
});

test('a missing codex CLI skips the global install, while the project install still works', async (t) => {
  const { calls, definitions, projectDir } = await workspace(t, { which: () => false });
  const steps = await definitions.codex.install('global');
  assert.equal(steps.length, 1);
  assert.equal(steps[0].status, 'skipped');
  assert.equal(calls.length, 0);
  assert.equal(await definitions.codex.install('project').then((written) => written[0].status), 'ok');
  assert.match(fs.readFileSync(join(projectDir, '.codex', 'config.toml'), 'utf8'), /mcp_servers\.linkedin/);
});

test('opencode install merges the mcp entry, copies the skill, and preserves unrelated keys', async (t) => {
  const { definitions, home, projectDir } = await workspace(t);
  const file = join(home, '.config', 'opencode', 'opencode.json');
  fs.mkdirSync(dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ $schema: 'https://opencode.ai/config.json', theme: 'dark', mcp: { other: { type: 'local', command: ['keep'], enabled: false } } }, null, 2));

  let steps = await definitions.opencode.install('global');
  assert.deepEqual(statuses(steps), ['ok', 'ok']);
  const merged = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(merged.$schema, 'https://opencode.ai/config.json');
  assert.equal(merged.theme, 'dark');
  assert.deepEqual(merged.mcp.other.command, ['keep']);
  assert.deepEqual(merged.mcp.linkedin, { type: 'local', command: ['node', 'server.js', 'mcp'], enabled: true });
  const skill = join(home, '.config', 'opencode', 'linkedin', 'SKILL.md');
  assert.ok(fs.existsSync(skill), 'the bundled skill is copied for global scope');
  assert.match(fs.readFileSync(skill, 'utf8'), /---/);

  steps = await definitions.opencode.uninstall('global');
  assert.deepEqual(statuses(steps), ['ok', 'ok']);
  const after = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(after.mcp.linkedin, undefined);
  assert.equal(after.mcp.other.enabled, false);
  assert.equal(after.theme, 'dark');
  assert.ok(!fs.existsSync(skill), 'the copied skill is removed');

  steps = await definitions.opencode.install('project');
  assert.deepEqual(statuses(steps), ['ok']);
  const projectConfig = JSON.parse(fs.readFileSync(join(projectDir, 'opencode.json'), 'utf8'));
  assert.equal(projectConfig.mcp.linkedin.enabled, true);
});

test('antigravity registers the server and refuses project scope explicitly', async (t) => {
  const { calls, definitions } = await workspace(t);
  const installSteps = await definitions.antigravity.install('global');
  assert.deepEqual(statuses(installSteps), ['ok']);
  assert.deepEqual(calls[0], { command: 'agy', args: ['mcp', 'add', 'linkedin', '--', 'node', 'server.js', 'mcp'] });

  const steps = await definitions.antigravity.install('project');
  assert.equal(steps.length, 1);
  assert.equal(steps[0].status, 'failed');
  assert.match(steps[0].detail, /project scope is not supported/i);

  const doctorSteps = await definitions.antigravity.doctor('project');
  assert.equal(doctorSteps[0].status, 'failed');

  const uninstallSteps = await definitions.antigravity.uninstall('project');
  assert.equal(uninstallSteps[0].status, 'failed');

  calls.length = 0;
  await definitions.antigravity.uninstall('global');
  assert.deepEqual(calls[0], { command: 'agy', args: ['mcp', 'remove', 'linkedin'] });
});

test('the environment doctor reports a missing Chromium as an actionable warning', async (t) => {
  const { dir } = await workspace(t);
  const stateDirectory = join(dir, 'state');
  const missing = join(dir, 'no-such-chromium.exe');
  const report = await checkEnvironment({
    env: { LINKEDIN_STATE_DIR: stateDirectory },
    home: dir,
    projectDir: dir,
    chromiumExecutable: missing,
  });
  const names = report.checks.map((entry) => entry.name);
  assert.deepEqual(names, ['node', 'chromium', 'keyring', 'mcp', 'state-directory']);
  const chromium = report.checks.find((entry) => entry.name === 'chromium');
  assert.equal(chromium.status, 'warn');
  assert.match(chromium.detail, /missing/i);
  assert.match(chromium.detail, /browser install/i);
  const found = await checkEnvironment({
    env: { LINKEDIN_STATE_DIR: stateDirectory },
    home: dir,
    projectDir: dir,
    chromiumExecutable: process.execPath,
  });
  assert.equal(found.checks.find((entry) => entry.name === 'chromium').status, 'ok');
  assert.equal(found.checks.find((entry) => entry.name === 'state-directory').status, 'ok');
  assert.ok(fs.existsSync(stateDirectory), 'the state directory is created when it is absent');
});

test('a token in a harness CLI\'s stderr never appears in step output', async (t) => {
  const token = 'FAKE_LINKEDIN_ACCESS_TOKEN_0123456789';
  const calls = [];
  const { definitions, home, projectDir } = await workspace(t, {
    execute: async (command, args) => {
      calls.push([command, args]);
      return { code: 1, stdout: '', stderr: `fatal: ${token} leaked by the harness` };
    },
  });
  const seen = [];
  const adapters = [...Object.values(definitions)];
  for (const adapter of adapters) {
    for (const scope of ['global', 'project']) {
      for (const action of ['install', 'uninstall', 'doctor']) {
        const steps = await adapter[action](scope);
        for (const entry of steps) {
          seen.push(entry.harness, entry.step, entry.detail);
        }
      }
    }
  }
  assert.ok(seen.length > 0);
  assert.ok(!seen.join('\n').includes(token), 'no step detail carries the token');
  const files = [
    join(projectDir, '.claude', 'settings.json'),
    join(projectDir, '.codex', 'config.toml'),
    join(projectDir, 'opencode.json'),
    join(home, '.claude', 'settings.json'),
    join(home, '.codex', 'config.toml'),
    join(home, '.config', 'opencode', 'opencode.json'),
  ];
  for (const file of files) {
    if (fs.existsSync(file)) assert.ok(!fs.readFileSync(file, 'utf8').includes(token));
  }
  assert.ok(calls.length > 0, 'the injected runner is the only execution path');
});

test('file updates are atomic and leave no temp files behind', async (t) => {
  const { definitions, projectDir } = await workspace(t);
  await definitions.opencode.install('project');
  await definitions.opencode.uninstall('project');
  await definitions.claude.install('project');
  for (const entry of fs.readdirSync(projectDir)) {
    assert.ok(!entry.endsWith('.tmp'), `temp file left behind: ${entry}`);
  }
  for (const entry of fs.readdirSync(join(projectDir, '.claude'))) {
    assert.ok(!entry.endsWith('.tmp'), `temp file left behind: ${entry}`);
  }
});

test('registerInstallCommands wires install, uninstall, and browser install; checkEnvironment reports the environment', async (t) => {
  const { dir, home, projectDir, calls, execute, which } = await workspace(t);
  const stateDirectory = join(dir, 'state');
  const stdout = sink();
  const stderr = sink();
  let code = 0;
  const program = new Command('linkedin').exitOverride();
  const spawns = [];
  registerInstallCommands(program, {
    env: { LINKEDIN_STATE_DIR: stateDirectory },
    home,
    projectDir,
    stdin: Readable.from([]),
    stdout,
    stderr,
    confirmInstall: async () => true,
    chromiumExecutable: join(dir, 'missing-chromium.exe'),
    execute,
    which,
    spawnImpl: async (command, args) => {
      spawns.push([command, args]);
      return { code: 0 };
    },
  }, (value) => { code = value; });

  await program.parseAsync(['install', 'opencode', 'antigravity', '--scope', 'global', '--yes'], { from: 'user' });
  assert.equal(code, 0);
  assert.match(stdout.value, /opencode\tconfig\tok/);
  assert.match(stdout.value, /antigravity\tserver\tok/);
  assert.ok(fs.existsSync(join(home, '.config', 'opencode', 'opencode.json')));

  stdout.value = '';
  await program.parseAsync(['uninstall', 'opencode', '--scope', 'global'], { from: 'user' });
  assert.equal(code, 0);
  assert.equal(JSON.parse(fs.readFileSync(join(home, '.config', 'opencode', 'opencode.json'), 'utf8')).mcp.linkedin, undefined);

  stdout.value = '';
  await program.parseAsync(['install', 'claude', '--scope', 'project', '--source', 'owner/repo', '--marketplace', 'm1', '--yes'], { from: 'user' });
  const claudeCalls = calls.filter((entry) => entry.command === 'claude');
  assert.equal(claudeCalls[0].command, 'claude', 'the CLI routes execution through the injected runner');
  assert.deepEqual(claudeCalls[0].args, ['plugin', 'marketplace', 'add', 'owner/repo', '--scope', 'project']);
  assert.match(stdout.value, /claude\tsettings\tok/);

  stdout.value = '';
  // The controller's doctor calls checkEnvironment; this test reports the
  // environment the same way.
  const report = await checkEnvironment({
    env: { LINKEDIN_STATE_DIR: stateDirectory },
    home,
    projectDir,
    chromiumExecutable: join(dir, 'missing-chromium.exe'),
  });
  for (const entry of report.checks) stdout.write(`${entry.name}\t${entry.status}\t${entry.detail}\n`);
  assert.match(stdout.value, /chromium\twarn/);
  assert.match(stdout.value, /browser install/);

  stdout.value = '';
  await program.parseAsync(['browser', 'install'], { from: 'user' });
  assert.equal(code, 0);
  assert.match(stdout.value, /Chromium download finished/);
  assert.equal(spawns[0][1].includes('install') && spawns[0][1].includes('chromium'), true);

  const failureSpawns = [];
  code = 0;
  const failing = new Command('linkedin').exitOverride();
  registerInstallCommands(failing, {
    env: { LINKEDIN_STATE_DIR: stateDirectory },
    home,
    projectDir,
    stdin: Readable.from([]),
    stdout: sink(),
    stderr,
    execute,
    which,
    spawnImpl: async (_command, args) => {
      failureSpawns.push(args);
      return { code: 1 };
    },
  }, (value) => { code = value; });
  await failing.parseAsync(['browser', 'install'], { from: 'user' });
  assert.equal(code, 1);
  assert.ok(failureSpawns[0].includes('install') && failureSpawns[0].includes('chromium'));
});

test('an unknown install target fails with a validation error', async (t) => {
  const { home, projectDir } = await workspace(t);
  const stderr = sink();
  let code = 0;
  const program = new Command('linkedin').exitOverride();
  registerInstallCommands(program, {
    env: {},
    home,
    projectDir,
    stdin: Readable.from([]),
    stdout: sink(),
    stderr,
    confirmInstall: async () => true,
  }, (value) => { code = value; });
  await program.parseAsync(['install', 'vscode', '--yes'], { from: 'user' });
  assert.equal(code, 2);
  const failure = JSON.parse(stderr.value);
  assert.equal(failure.success, false);
  assert.equal(failure.error.code, 'VALIDATION_ERROR');
  assert.match(failure.error.message, /vscode/);
});

test('non-interactive installs without --yes are refused', async (t) => {
  const { home, projectDir } = await workspace(t);
  const stderr = sink();
  let code = 0;
  const program = new Command('linkedin').exitOverride();
  registerInstallCommands(program, {
    env: {},
    home,
    projectDir,
    stdin: Readable.from([]),
    stdout: sink(),
    stderr,
  }, (value) => { code = value; });
  await program.parseAsync(['install', 'opencode'], { from: 'user' });
  assert.equal(code, 2);
  assert.match(stderr.value, /--yes/);
});

test('installChromium reports the download outcome without leaking process output', async () => {
  const seen = [];
  const okRun = await installChromium({
    spawnImpl: async (command, args) => {
      seen.push([command, args]);
      return { code: 0 };
    },
  });
  assert.equal(okRun.ok, true);
  assert.deepEqual(okRun.detail, 'Chromium download finished.');
  assert.equal(seen[0][1][seen[0][1].length - 2], 'install');
  assert.equal(seen[0][1][seen[0][1].length - 1], 'chromium');
  const failedRun = await installChromium({
    spawnImpl: async () => ({ code: 1 }),
  });
  assert.equal(failedRun.ok, false);
  assert.equal(failedRun.code, 1);
  assert.match(failedRun.detail, /exit code 1/);
  const errored = await installChromium({
    spawnImpl: async () => {
      throw new Error('npx not found');
    },
  });
  assert.equal(errored.ok, false);
  assert.match(errored.detail, /npx not found/);
});
