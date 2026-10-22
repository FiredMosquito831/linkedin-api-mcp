// Agent-harness adapters: install, uninstall, and doctor for Claude Code,
// Codex, OpenCode, and Antigravity.
//
// Every adapter method returns an array of step records
// ({ harness, step, status: 'ok'|'skipped'|'failed', detail }). An adapter
// whose CLI is not on PATH returns a single "skipped" step instead of
// throwing. Step details carry exit codes and paths, never command output, so
// a token in a CLI's stderr can never reach a log or an error message.
//
// File updates are atomic (a temp file in the same directory, then a rename)
// and merge into existing JSON and TOML content instead of replacing it.
//
// The contract fixes install(scope), uninstall(scope), and doctor(scope). The
// optional second argument ({ execute, which }) exists so tests can record the
// commands without running a real harness; production code omits it and the
// process-based defaults below are used.

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OperationError } from '../operations/errors.js';

export const HARNESSES = {
  claude: {
    name: 'claude',
    cli: 'claude',
    scopes: ['global', 'project'],
    notes: 'Claude Code marketplace and plugin; project scope also merges .claude/settings.json.',
  },
  codex: {
    name: 'codex',
    cli: 'codex',
    scopes: ['global', 'project'],
    notes: 'Codex plugin commands for global scope; both scopes merge an [mcp_servers.<plugin>] table into config.toml.',
  },
  opencode: {
    name: 'opencode',
    cli: null,
    scopes: ['global', 'project'],
    notes: 'No CLI; merges an mcp entry into opencode.json and, for global scope, copies the bundled skill.',
  },
  antigravity: {
    name: 'antigravity',
    cli: 'agy',
    scopes: ['global'],
    notes: 'Global only; runs `agy mcp add`.',
  },
};

const DEFAULTS = {
  source: 'FiredMosquito831/linkedin-api-mcp',
  marketplace: 'linkedin-api-mcp',
  plugin: 'linkedin',
  serverCommand: process.execPath,
  serverArgs: [],
};

const SKILL_SOURCE = fileURLToPath(new URL('../../skills/linkedin/SKILL.md', import.meta.url));

function step(harness, name, status, detail) {
  return { harness, step: name, status, detail };
}

function messageOf(error) {
  return String(error && error.message ? error.message : error).slice(0, 300);
}

function defaultExecute(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: false, windowsHide: true });
  if (result.error) return { code: 1, stdout: '', stderr: '' };
  return { code: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function defaultWhich(cli) {
  if (!cli) return false;
  const finder = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(finder, [cli], { encoding: 'utf8', shell: false, windowsHide: true });
  return result.status === 0;
}

async function commandStep(harness, name, execute, command, args, success, { ignoreFailure = false } = {}) {
  let result;
  try {
    result = await execute(command, args);
  } catch (error) {
    return step(harness, name, 'failed', `could not run ${command}: ${messageOf(error)}`);
  }
  const code = typeof result?.code === 'number' ? result.code : 0;
  if (code === 0) return step(harness, name, 'ok', success);
  if (ignoreFailure) {
    return step(harness, name, 'skipped', `${command} exited with code ${code}; nothing was registered, so nothing was removed.`);
  }
  return step(harness, name, 'failed', `${command} exited with code ${code}.`);
}

async function fileStep(harness, name, update, failure) {
  try {
    return step(harness, name, 'ok', await update());
  } catch (error) {
    return step(harness, name, 'failed', `${failure}: ${messageOf(error)}`);
  }
}

function unsupportedScope(definition, scope) {
  return step(
    definition.name,
    'scope',
    'failed',
    `${definition.name} supports only ${definition.scopes.join(' and ')} scope; ${scope} scope is not supported.`,
  );
}

function missingCli(definition, action) {
  return step(
    definition.name,
    'cli',
    'skipped',
    `${definition.cli} CLI was not found on PATH; ${definition.name} was not changed (${action} skipped).`,
  );
}

function atomicWrite(file, content) {
  const directory = dirname(file);
  fs.mkdirSync(directory, { recursive: true });
  const base = file.split(/[\\/]/).pop();
  const temp = join(directory, `.${base}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
  try {
    fs.writeFileSync(temp, content, 'utf8');
    fs.renameSync(temp, file);
  } catch (error) {
    try {
      fs.unlinkSync(temp);
    } catch {
      // The temp file is already gone; keep the original error.
    }
    throw error;
  }
}

function readJsonObject(file) {
  if (!fs.existsSync(file)) return {};
  const raw = fs.readFileSync(file, 'utf8');
  if (raw.trim() === '') return {};
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new OperationError('VALIDATION_ERROR', `${file} is not valid JSON; left unchanged.`);
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new OperationError('VALIDATION_ERROR', `${file} must contain a JSON object; left unchanged.`);
  }
  return value;
}

function objectOrEmpty(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function writeJson(file, data) {
  atomicWrite(file, `${JSON.stringify(data, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// TOML helpers. The package adds no TOML dependency, so the Codex table is
// located and removed by its header lines. Other tables and comments stay in
// place; only the target table's own lines are touched.

function tomlKey(key) {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key);
}

function tomlString(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function codexTablePath(plugin) {
  return `mcp_servers.${tomlKey(plugin)}`;
}

function isTableHeader(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('[') && trimmed.endsWith(']') && !trimmed.startsWith('[[');
}

function isTableHeaderFor(line, path) {
  if (!isTableHeader(line)) return false;
  const header = line.trim().slice(1, -1).trim();
  return header === path || header.startsWith(`${path}.`);
}

function hasTomlTable(text, path) {
  return text.split('\n').some((line) => isTableHeaderFor(line, path));
}

function removeTomlTable(text, path) {
  const kept = [];
  let inside = false;
  for (const line of text.split('\n')) {
    if (isTableHeader(line)) inside = isTableHeaderFor(line, path);
    if (!inside) kept.push(line);
  }
  return kept.join('\n');
}

function renderCodexTable(path, command, args) {
  return `[${path}]\ncommand = ${tomlString(command)}\nargs = [${args.map(tomlString).join(', ')}]\n`;
}

function writeCodexTable(file, path, command, args) {
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const present = hasTomlTable(existing, path);
  const withoutTarget = present ? removeTomlTable(existing, path) : existing;
  const body = withoutTarget.replace(/\n+$/, '');
  const table = renderCodexTable(path, command, args);
  const next = body.trim() === '' ? table : `${body}\n\n${table}`;
  atomicWrite(file, next);
  return present ? `updated [${path}] in ${file}` : `added [${path}] to ${file}`;
}

function removeCodexTable(file, path) {
  if (!fs.existsSync(file)) return `${file} does not exist; nothing to remove`;
  const existing = fs.readFileSync(file, 'utf8');
  if (!hasTomlTable(existing, path)) return `[${path}] is not present; left unchanged`;
  const cleaned = removeTomlTable(existing, path).replace(/\n+$/, '');
  atomicWrite(file, cleaned === '' ? '' : `${cleaned}\n`);
  return `removed [${path}] and its sub-tables from ${file}; other tables preserved`;
}

// ---------------------------------------------------------------------------
// Claude Code

function marketplaceSource(source) {
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(source)) return { source: 'github', repo: source };
  return { source: 'git', url: source };
}

function mergeClaudeSettings(file, { source, marketplace, plugin }) {
  const data = readJsonObject(file);
  const marketplaces = objectOrEmpty(data.extraKnownMarketplaces);
  marketplaces[marketplace] = { source: marketplaceSource(source) };
  data.extraKnownMarketplaces = marketplaces;
  const enabled = objectOrEmpty(data.enabledPlugins);
  enabled[`${plugin}@${marketplace}`] = true;
  data.enabledPlugins = enabled;
  writeJson(file, data);
  return `merged ${marketplace} and ${plugin}@${marketplace} into ${file}; unrelated keys preserved`;
}

function removeClaudeSettings(file, { marketplace, plugin }) {
  if (!fs.existsSync(file)) return `${file} does not exist; nothing to remove`;
  const data = readJsonObject(file);
  const enabled = objectOrEmpty(data.enabledPlugins);
  const key = `${plugin}@${marketplace}`;
  if (!Object.hasOwn(enabled, key)) return `${key} is not present in ${file}; left unchanged`;
  delete enabled[key];
  data.enabledPlugins = enabled;
  writeJson(file, data);
  return `removed ${key} from ${file}; the marketplace entry was kept`;
}

function claudeAdapter(definition, config, execute, which) {
  const harness = definition.name;
  const scopeFlag = (scope) => (scope === 'project' ? 'project' : 'user');
  const settingsFile = (scope) => (scope === 'project'
    ? join(config.projectDir, '.claude', 'settings.json')
    : join(config.home, '.claude', 'settings.json'));

  async function install(scope, options = {}) {
    if (!definition.scopes.includes(scope)) return [unsupportedScope(definition, scope)];
    const run = options.execute ?? execute;
    const find = options.which ?? which;
    if (!(await find(definition.cli))) return [missingCli(definition, 'install')];

    const steps = [];
    steps.push(await commandStep(harness, 'marketplace', run, definition.cli,
      ['plugin', 'marketplace', 'add', config.source, '--scope', scopeFlag(scope)],
      `registered marketplace ${config.marketplace}`));
    steps.push(await commandStep(harness, 'plugin', run, definition.cli,
      ['plugin', 'install', `${config.plugin}@${config.marketplace}`, '--scope', scopeFlag(scope), '-y'],
      `installed plugin ${config.plugin}@${config.marketplace}`));
    if (scope === 'project') {
      steps.push(await fileStep(harness, 'settings',
        () => mergeClaudeSettings(settingsFile('project'), config),
        'could not update the project settings'));
    }
    return steps;
  }

  async function uninstall(scope, options = {}) {
    if (!definition.scopes.includes(scope)) return [unsupportedScope(definition, scope)];
    const run = options.execute ?? execute;
    const find = options.which ?? which;
    if (!(await find(definition.cli))) return [missingCli(definition, 'uninstall')];

    const steps = [];
    steps.push(await commandStep(harness, 'plugin', run, definition.cli,
      ['plugin', 'uninstall', `${config.plugin}@${config.marketplace}`, '--scope', scopeFlag(scope), '-y'],
      `removed plugin ${config.plugin}@${config.marketplace}`));
    if (scope === 'project') {
      steps.push(await fileStep(harness, 'settings',
        () => removeClaudeSettings(settingsFile('project'), config),
        'could not update the project settings'));
    }
    for (const target of ['user', 'project']) {
      steps.push(await commandStep(harness, `mcp-${target}`, run, definition.cli,
        ['mcp', 'remove', config.plugin, '--scope', target],
        `no manually added MCP server ${config.plugin} in ${target} scope`,
        { ignoreFailure: true }));
    }
    return steps;
  }

  async function doctor(scope, options = {}) {
    if (!definition.scopes.includes(scope)) return [unsupportedScope(definition, scope)];
    const run = options.execute ?? execute;
    const find = options.which ?? which;
    if (!(await find(definition.cli))) return [missingCli(definition, 'doctor')];

    const steps = [step(harness, 'cli', 'ok', `${definition.cli} CLI found on PATH`)];
    const file = settingsFile(scope);
    let installed = false;
    try {
      installed = objectOrEmpty(readJsonObject(file).enabledPlugins)[`${config.plugin}@${config.marketplace}`] === true;
    } catch (error) {
      steps.push(step(harness, 'settings', 'failed', messageOf(error)));
      installed = false;
    }
    if (steps.length === 1) {
      steps.push(installed
        ? step(harness, 'settings', 'ok', `${config.plugin}@${config.marketplace} is enabled in ${file}`)
        : step(harness, 'settings', 'failed', `${config.plugin}@${config.marketplace} is not enabled in ${file}; run install`));
    }
    for (const target of ['user', 'project']) {
      const result = await commandStep(harness, `mcp-${target}`, run, definition.cli,
        ['mcp', 'get', config.plugin, '--scope', target],
        `a manually added MCP server ${config.plugin} exists in ${target} scope; run uninstall to remove it`);
      steps.push(result.status === 'ok'
        ? step(harness, `mcp-${target}`, 'failed', result.detail)
        : step(harness, `mcp-${target}`, 'ok', `no manually added MCP server ${config.plugin} in ${target} scope`));
    }
    return steps;
  }

  return { name: harness, install, uninstall, doctor };
}

// ---------------------------------------------------------------------------
// Codex

function codexAdapter(definition, config, execute, which) {
  const harness = definition.name;
  const tablePath = codexTablePath(config.plugin);
  const configFile = (scope) => (scope === 'project'
    ? join(config.projectDir, '.codex', 'config.toml')
    : join(config.home, '.codex', 'config.toml'));

  async function install(scope, options = {}) {
    if (!definition.scopes.includes(scope)) return [unsupportedScope(definition, scope)];
    const run = options.execute ?? execute;
    const steps = [];
    if (scope === 'global') {
      const find = options.which ?? which;
      if (!(await find(definition.cli))) return [missingCli(definition, 'install')];
      steps.push(await commandStep(harness, 'marketplace', run, definition.cli,
        ['plugin', 'marketplace', 'add', config.source],
        `registered marketplace ${config.marketplace}`));
      steps.push(await commandStep(harness, 'plugin', run, definition.cli,
        ['plugin', 'add', `${config.plugin}@${config.marketplace}`],
        `added plugin ${config.plugin}@${config.marketplace}`));
    }
    steps.push(await fileStep(harness, 'config',
      () => writeCodexTable(configFile(scope), tablePath, config.serverCommand, config.serverArgs),
      'could not update the Codex config'));
    return steps;
  }

  async function uninstall(scope) {
    if (!definition.scopes.includes(scope)) return [unsupportedScope(definition, scope)];
    return [await fileStep(harness, 'config',
      () => removeCodexTable(configFile(scope), tablePath),
      'could not update the Codex config')];
  }

  async function doctor(scope, options = {}) {
    if (!definition.scopes.includes(scope)) return [unsupportedScope(definition, scope)];
    const steps = [];
    if (scope === 'global') {
      const find = options.which ?? which;
      if (!(await find(definition.cli))) return [missingCli(definition, 'doctor')];
      steps.push(step(harness, 'cli', 'ok', `${definition.cli} CLI found on PATH`));
    }
    try {
      const file = configFile(scope);
      const present = fs.existsSync(file) && hasTomlTable(fs.readFileSync(file, 'utf8'), tablePath);
      steps.push(present
        ? step(harness, 'config', 'ok', `[${tablePath}] is present in ${file}`)
        : step(harness, 'config', 'failed', `[${tablePath}] is missing from ${file}; run install`));
    } catch (error) {
      steps.push(step(harness, 'config', 'failed', messageOf(error)));
    }
    return steps;
  }

  return { name: harness, install, uninstall, doctor };
}

// ---------------------------------------------------------------------------
// OpenCode

function opencodeConfigFile(scope, config) {
  return scope === 'project'
    ? join(config.projectDir, 'opencode.json')
    : join(config.home, '.config', 'opencode', 'opencode.json');
}

function writeOpencodeConfig(file, plugin, command, args) {
  const data = readJsonObject(file);
  const mcp = objectOrEmpty(data.mcp);
  mcp[plugin] = { type: 'local', command: [command, ...args], enabled: true };
  data.mcp = mcp;
  writeJson(file, data);
  return `merged the ${plugin} mcp entry into ${file}; unrelated keys preserved`;
}

function removeOpencodeConfig(file, plugin) {
  if (!fs.existsSync(file)) return `${file} does not exist; nothing to remove`;
  const data = readJsonObject(file);
  const mcp = objectOrEmpty(data.mcp);
  if (!Object.hasOwn(mcp, plugin)) return `${plugin} is not present in ${file}; left unchanged`;
  delete mcp[plugin];
  data.mcp = mcp;
  writeJson(file, data);
  return `removed the ${plugin} mcp entry from ${file}; unrelated keys preserved`;
}

function copySkill(file, plugin) {
  if (!fs.existsSync(SKILL_SOURCE)) throw new OperationError('VALIDATION_ERROR', 'skills/linkedin/SKILL.md is missing from the package.');
  atomicWrite(file, fs.readFileSync(SKILL_SOURCE, 'utf8'));
  return `copied skills/linkedin/SKILL.md to ${file}`;
}

function removeSkill(file) {
  if (!fs.existsSync(file)) return `${file} does not exist; nothing to remove`;
  fs.unlinkSync(file);
  try {
    fs.rmdirSync(dirname(file));
  } catch {
    // Other files still use the directory; leave it in place.
  }
  return `removed the copied skill file ${file}`;
}

function opencodeAdapter(definition, config) {
  const harness = definition.name;
  const skillFile = () => join(config.home, '.config', 'opencode', config.plugin, 'SKILL.md');

  async function install(scope) {
    if (!definition.scopes.includes(scope)) return [unsupportedScope(definition, scope)];
    const steps = [await fileStep(harness, 'config',
      () => writeOpencodeConfig(opencodeConfigFile(scope, config), config.plugin, config.serverCommand, config.serverArgs),
      'could not update the opencode config')];
    if (scope === 'global') {
      steps.push(await fileStep(harness, 'skill',
        () => copySkill(skillFile(), config.plugin),
        'could not copy the bundled skill'));
    }
    return steps;
  }

  async function uninstall(scope) {
    if (!definition.scopes.includes(scope)) return [unsupportedScope(definition, scope)];
    const steps = [await fileStep(harness, 'config',
      () => removeOpencodeConfig(opencodeConfigFile(scope, config), config.plugin),
      'could not update the opencode config')];
    if (scope === 'global') {
      steps.push(await fileStep(harness, 'skill',
        () => removeSkill(skillFile()),
        'could not remove the copied skill'));
    }
    return steps;
  }

  async function doctor(scope) {
    if (!definition.scopes.includes(scope)) return [unsupportedScope(definition, scope)];
    const steps = [];
    const file = opencodeConfigFile(scope, config);
    try {
      const entry = objectOrEmpty(readJsonObject(file).mcp)[config.plugin];
      const usable = entry && entry.type === 'local' && entry.enabled === true;
      steps.push(usable
        ? step(harness, 'config', 'ok', `${config.plugin} is enabled as a local server in ${file}`)
        : step(harness, 'config', 'failed', `${config.plugin} is missing or disabled in ${file}; run install`));
    } catch (error) {
      steps.push(step(harness, 'config', 'failed', messageOf(error)));
    }
    if (scope === 'global') {
      steps.push(fs.existsSync(skillFile())
        ? step(harness, 'skill', 'ok', `skill file is present at ${skillFile()}`)
        : step(harness, 'skill', 'failed', `skill file is missing at ${skillFile()}; run install`));
    }
    return steps;
  }

  return { name: harness, install, uninstall, doctor };
}

// ---------------------------------------------------------------------------
// Antigravity

function antigravityAdapter(definition, config, execute, which) {
  const harness = definition.name;

  async function install(scope, options = {}) {
    if (!definition.scopes.includes(scope)) return [unsupportedScope(definition, scope)];
    const run = options.execute ?? execute;
    const find = options.which ?? which;
    if (!(await find(definition.cli))) return [missingCli(definition, 'install')];
    return [await commandStep(harness, 'server', run, definition.cli,
      ['mcp', 'add', config.plugin, '--', config.serverCommand, ...config.serverArgs],
      `registered MCP server ${config.plugin}`)];
  }

  async function uninstall(scope, options = {}) {
    if (!definition.scopes.includes(scope)) return [unsupportedScope(definition, scope)];
    const run = options.execute ?? execute;
    const find = options.which ?? which;
    if (!(await find(definition.cli))) return [missingCli(definition, 'uninstall')];
    return [await commandStep(harness, 'server', run, definition.cli,
      ['mcp', 'remove', config.plugin],
      `removed MCP server ${config.plugin}`,
      { ignoreFailure: true })];
  }

  async function doctor(scope, options = {}) {
    if (!definition.scopes.includes(scope)) return [unsupportedScope(definition, scope)];
    const run = options.execute ?? execute;
    const find = options.which ?? which;
    if (!(await find(definition.cli))) return [missingCli(definition, 'doctor')];
    const steps = [step(harness, 'cli', 'ok', `${definition.cli} CLI found on PATH`)];
    let listed;
    try {
      listed = await run(definition.cli, ['mcp', 'list']);
    } catch (error) {
      steps.push(step(harness, 'server', 'failed', `could not list MCP servers: ${messageOf(error)}`));
      return steps;
    }
    if ((listed?.code ?? 0) !== 0) {
      steps.push(step(harness, 'server', 'failed', `${definition.cli} mcp list exited with code ${listed.code}.`));
    } else if (String(listed?.stdout ?? '').includes(config.plugin)) {
      steps.push(step(harness, 'server', 'ok', `MCP server ${config.plugin} is registered`));
    } else {
      steps.push(step(harness, 'server', 'failed', `MCP server ${config.plugin} is not registered; run install`));
    }
    return steps;
  }

  return { name: harness, install, uninstall, doctor };
}

// ---------------------------------------------------------------------------
// Public factory

export function harnessDefinitions({
  home = homedir(),
  projectDir = process.cwd(),
  source = DEFAULTS.source,
  marketplace = DEFAULTS.marketplace,
  plugin = DEFAULTS.plugin,
  serverCommand = DEFAULTS.serverCommand,
  serverArgs = DEFAULTS.serverArgs,
  execute = defaultExecute,
  which = defaultWhich,
} = {}) {
  const config = { home, projectDir, source, marketplace, plugin, serverCommand, serverArgs };
  return {
    claude: claudeAdapter(HARNESSES.claude, config, execute, which),
    codex: codexAdapter(HARNESSES.codex, config, execute, which),
    opencode: opencodeAdapter(HARNESSES.opencode, config),
    antigravity: antigravityAdapter(HARNESSES.antigravity, config, execute, which),
  };
}
