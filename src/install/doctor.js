// Local environment diagnostics for the install surface. Nothing here contacts
// LinkedIn or any other network host. The Chromium browser is a separate,
// explicit download because Playwright 1.64.1 has no install script: the doctor
// reports it as missing when it is absent and installChromium() is only ever
// called from `linkedin browser install`.

import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { OPERATIONS } from '../operations/catalog.js';

const MINIMUM_NODE = [22, 12, 0];

function check(name, status, detail) {
  return { name, status, detail };
}

function versionAtLeast(actual, minimum) {
  const parts = String(actual).split('.').map((part) => Number.parseInt(part, 10));
  for (let index = 0; index < minimum.length; index += 1) {
    const value = Number.isFinite(parts[index]) ? parts[index] : 0;
    if (value > minimum[index]) return true;
    if (value < minimum[index]) return false;
  }
  return true;
}

// Resolves the browser executable Playwright expects. executablePath() may throw
// when the browser was never downloaded, so the caller gets a reason instead of
// an exception.
async function resolveChromiumExecutable() {
  const { chromium } = await import('playwright');
  return chromium.executablePath();
}

async function chromiumCheck(chromiumExecutable) {
  let executable = chromiumExecutable;
  if (!executable) {
    try {
      executable = await resolveChromiumExecutable();
    } catch (error) {
      return check('chromium', 'warn',
        `Chromium is not available (${String(error?.message ?? error).slice(0, 200)}); run "linkedin browser install" to download it.`);
    }
  }
  if (!executable) {
    return check('chromium', 'warn', 'Chromium has no executable path; run "linkedin browser install" to download it.');
  }
  return fs.existsSync(executable)
    ? check('chromium', 'ok', `Chromium executable found at ${executable}`)
    : check('chromium', 'warn', `Chromium executable is missing at ${executable}; run "linkedin browser install" to download it.`);
}

async function keyringCheck() {
  try {
    await import('@napi-rs/keyring');
    return check('keyring', 'ok', 'native keyring module loaded');
  } catch (error) {
    return check('keyring', 'fail', `native keyring module failed to load: ${String(error?.message ?? error).slice(0, 200)}`);
  }
}

async function mcpCheck() {
  try {
    const server = await import('../mcp/server.js');
    if (typeof server.createMcpServer !== 'function') {
      return check('mcp', 'fail', 'the MCP server module does not export createMcpServer');
    }
    if (!Array.isArray(OPERATIONS) || OPERATIONS.length === 0) {
      return check('mcp', 'fail', 'the MCP catalog is empty');
    }
    return check('mcp', 'ok', `MCP server module loaded with ${OPERATIONS.length} catalog operations`);
  } catch (error) {
    return check('mcp', 'fail', `the MCP server module failed to load: ${String(error?.message ?? error).slice(0, 200)}`);
  }
}

function stateCheck(env, home) {
  const directory = env?.LINKEDIN_STATE_DIR || join(home, '.linkedin-api-mcp');
  if (!isAbsolute(directory)) {
    return check('state-directory', 'fail', 'LINKEDIN_STATE_DIR must be an absolute private directory');
  }
  if (fs.existsSync(directory)) {
    return check('state-directory', 'ok', `state directory exists at ${directory}`);
  }
  try {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    return check('state-directory', 'ok', `created the state directory at ${directory}`);
  } catch (error) {
    return check('state-directory', 'fail',
      `cannot create the state directory at ${directory}: ${String(error?.message ?? error).slice(0, 200)}`);
  }
}

export async function checkEnvironment({
  env = process.env,
  home = homedir(),
  projectDir = process.cwd(),
  chromiumExecutable,
  // Reserved for callers that want a health probe later; no network call is made here.
  fetchImpl: _fetchImpl,
} = {}) {
  void projectDir;
  const nodeVersion = process.versions.node;
  const checks = [
    versionAtLeast(nodeVersion, MINIMUM_NODE)
      ? check('node', 'ok', `Node ${nodeVersion} satisfies the required ${MINIMUM_NODE.join('.')} or newer`)
      : check('node', 'fail', `Node ${nodeVersion} is older than the required ${MINIMUM_NODE.join('.')}`),
    await chromiumCheck(chromiumExecutable),
    await keyringCheck(),
    await mcpCheck(),
    stateCheck(env, home),
  ];
  return { checks };
}

function playwrightCommand() {
  try {
    const require = createRequire(import.meta.url);
    return { command: process.execPath, args: [join(dirname(require.resolve('playwright/package.json')), 'cli.js')] };
  } catch {
    return { command: process.platform === 'win32' ? 'npx.cmd' : 'npx', args: [] };
  }
}

function defaultSpawn(command, args, options) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, options);
    } catch {
      resolve({ code: 1 });
      return;
    }
    child.on('error', () => resolve({ code: 1 }));
    child.on('close', (code) => resolve({ code: typeof code === 'number' ? code : 1 }));
  });
}

export async function installChromium({ spawnImpl = defaultSpawn } = {}) {
  const base = playwrightCommand();
  const args = [...base.args, 'install', 'chromium'];
  let result;
  try {
    result = await spawnImpl(base.command, args, { stdio: 'inherit', windowsHide: true });
  } catch (error) {
    return { ok: false, code: 1, detail: `could not start the Chromium download: ${String(error?.message ?? error).slice(0, 200)}` };
  }
  const code = typeof result?.code === 'number' ? result.code : 1;
  return code === 0
    ? { ok: true, code, detail: 'Chromium download finished.' }
    : { ok: false, code, detail: `Chromium download failed with exit code ${code}.` };
}
