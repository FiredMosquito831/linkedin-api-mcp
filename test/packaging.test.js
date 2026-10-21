// Packaging tests: plugin manifests, MCP launch, recommended npm manifest, docs, and secret hygiene.
// These verify the packaging layer only. Controller-owned entry points (bin/linkedin-api-mcp.js,
// src/mcp/*) are checked for correctness when present, so the suite stays green until they land.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return readFile(join(root, rel), 'utf8');
}

async function readJson(rel) {
  return JSON.parse(await read(rel));
}

// Key sets per the Claude Code docs (code.claude.com/docs): marketplace.json top-level fields
// and plugin entry fields. Unknown keys load but warn, so keep every key inside the known set.
const MARKETPLACE_KEYS = new Set([
  'name', 'owner', 'plugins', '$schema', 'description', 'version', 'metadata',
  'forceRemoveDeletedPlugins', 'allowCrossMarketplaceDependenciesOn', 'renames',
]);
const ENTRY_KEYS = new Set([
  'name', 'source', 'description', 'version', 'category', 'tags', 'strict',
  'relevance', 'dependencies', 'defaultEnabled', 'displayName', 'metadata',
  'headers', 'headersHelper', // plus plugin.json manifest fields, not enumerated here
  'homepage', 'repository', 'author', 'keywords', 'license', 'mcpServers', 'userConfig',
]);
const USERCONFIG_FIELDS = new Set([
  'type', 'title', 'description', 'required', 'default', 'options', 'sensitive', 'multiple', 'min', 'max',
]);
const RESERVED_MARKETPLACE_NAMES = new Set([
  'npm', 'pip', 'uv', 'cargo', 'github', 'gh', 'inline', 'builtin', 'skills-dir',
  'synced', 'claude-plugin-test', 'agent-skills', 'claude-code-marketplace',
]);
// Patterns that would mean a credential leaked into packaging material.
const SECRET_PATTERNS = [
  { name: 'AWS access key', re: /AKIA[0-9A-Z]{16}/ },
  { name: 'Google API key', re: /AIza[0-9A-Za-z_-]{35}/ },
  { name: 'GitHub token', re: /gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/ },
  { name: 'GitLab token', re: /glpat-[A-Za-z0-9_-]{16,}/ },
  { name: 'OpenAI-style key', re: /sk-[A-Za-z0-9]{20,}/ },
  { name: 'JWT', re: /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/ },
  { name: 'PEM private key', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'baked LINKEDIN_ACCESS_TOKEN', re: /LINKEDIN_ACCESS_TOKEN=["']?(?!(?:\$\{|%))\S{8,}/ },
  { name: 'bearer literal', re: /Bearer [A-Za-z0-9._~+/-]{16,}/ },
];

function scanForSecrets(rel, text) {
  for (const { name, re } of SECRET_PATTERNS) {
    if (re.test(text)) {
      assert.fail(`${rel} looks like it bakes a secret (${name})`);
    }
  }
}

test('marketplace.json is a coherent one-plugin catalog', async () => {
  const m = await readJson('.claude-plugin/marketplace.json');
  assert.equal(m.name, 'linkedin-api-mcp');
  assert.ok(!RESERVED_MARKETPLACE_NAMES.has(m.name.toLowerCase()), 'marketplace name is reserved');
  assert.equal(m.owner?.name, 'FiredMosquito831');
  assert.equal(typeof m.description, 'string');
  assert.ok(m.description.length > 0);
  for (const key of Object.keys(m)) assert.ok(MARKETPLACE_KEYS.has(key), `unknown marketplace key ${key}`);

  assert.ok(Array.isArray(m.plugins), 'plugins must be an array');
  assert.equal(m.plugins.length, 1, 'this marketplace ships exactly one plugin');
  const entry = m.plugins[0];
  for (const key of Object.keys(entry)) assert.ok(ENTRY_KEYS.has(key), `unknown entry key ${key}`);
  assert.equal(entry.name, 'linkedin');
  assert.equal(entry.source, './');
  assert.equal(entry.strict, false);
  assert.equal(typeof entry.description, 'string');
});

test('plugin.json is a valid manifest and matches the marketplace entry', async () => {
  const p = await readJson('.claude-plugin/plugin.json');
  assert.equal(p.name, 'linkedin');
  assert.equal(p.version, (await readJson('package.json')).version);
  assert.equal(typeof p.description, 'string');
  assert.equal(p.author?.name, 'FiredMosquito831');
  assert.equal(p.homepage, 'https://github.com/FiredMosquito831/linkedin-api-mcp');
  assert.equal(p.repository, 'https://github.com/FiredMosquito831/linkedin-api-mcp');

  const experimental = p.userConfig?.experimental;
  assert.ok(experimental, 'userConfig.experimental is declared');
  for (const key of Object.keys(experimental)) {
    assert.ok(USERCONFIG_FIELDS.has(key), `unknown userConfig field ${key}`);
  }
  assert.equal(experimental.type, 'boolean');
  assert.equal(experimental.default, false, 'experimental stays off by default');
  assert.equal(typeof experimental.title, 'string');
  assert.equal(typeof experimental.description, 'string');
});

test("source './' resolves to a self-contained plugin root", async () => {
  for (const rel of [
    '.claude-plugin/marketplace.json',
    '.claude-plugin/plugin.json',
    '.mcp.json',
    'skills/linkedin/SKILL.md',
  ]) {
    assert.ok(existsSync(join(root, rel)), `missing plugin component ${rel}`);
  }
  const entry = (await readJson('.claude-plugin/marketplace.json')).plugins[0];
  const manifest = await readJson('.claude-plugin/plugin.json');
  assert.equal(entry.name, manifest.name, 'entry name and manifest name must match');
});

test('.mcp.json launches the bundled CLI with node, never npx or a global bin', async () => {
  const raw = await read('.mcp.json');
  const mcp = JSON.parse(raw);
  const server = mcp.mcpServers?.linkedin;
  assert.ok(server, 'the server is named "linkedin"');
  assert.equal(server.command, 'node');
  assert.deepEqual(server.args, ['${CLAUDE_PLUGIN_ROOT}/bin/linkedin.js', 'mcp', '--transport', 'stdio']);
  for (const arg of [server.command, ...(server.args ?? [])]) {
    assert.ok(!/npx|pnpx|bunx|uvx|npm exec/i.test(arg), `launch uses unpinned remote execution: ${arg}`);
  }
  assert.equal(server.env?.LINKEDIN_EXPERIMENTAL, '${user_config.experimental}');

  // Every user_config reference must be declared in plugin.json userConfig.
  const manifest = await readJson('.claude-plugin/plugin.json');
  const declared = new Set(Object.keys(manifest.userConfig ?? {}));
  for (const match of raw.matchAll(/\$\{user_config\.([A-Za-z0-9_]+)\}/g)) {
    assert.ok(declared.has(match[1]), `user config ${match[1]} is not declared in plugin.json`);
  }
  // No literal env values: placeholders only.
  for (const value of Object.values(server.env ?? {})) {
    assert.match(value, /^\$\{user_config\.[A-Za-z0-9_]+\}$/, 'env must be a user_config placeholder');
  }
});

test('the MCP launch path resolves to a real, shebanged file in the plugin root', async () => {
  const mcp = await readJson('.mcp.json');
  const launched = mcp.mcpServers.linkedin.args[0].replace('${CLAUDE_PLUGIN_ROOT}', root);
  assert.ok(launched.startsWith(root), 'the launch target must stay inside the plugin root');
  assert.ok(existsSync(launched), `launch target ${launched.slice(root.length + 1)} does not exist yet`);
  const firstLine = (await readFile(launched, 'utf8')).split('\n')[0].replace(/\r$/, '');
  assert.equal(firstLine, '#!/usr/bin/env node');
});

test('controller-owned MCP entry points are checked when present', async () => {
  const startPath = join(root, 'src/mcp/start.js');
  if (existsSync(startPath)) {
    const mod = await import(pathToFileURL(startPath).href);
    assert.equal(typeof mod.startMcp, 'function', 'start.js exports startMcp');
  }
  const serverPath = join(root, 'src/mcp/server.js');
  if (existsSync(serverPath)) {
    const mod = await import(pathToFileURL(serverPath).href);
    assert.equal(typeof mod.createMcpServer, 'function', 'server.js exports createMcpServer');
  }
  const binPath = join(root, 'bin/linkedin-api-mcp.js');
  if (existsSync(binPath)) {
    const text = await readFile(binPath, 'utf8');
    assert.equal(text.split('\n')[0].replace(/\r$/, ''), '#!/usr/bin/env node');
    assert.ok(text.length > 10, 'the second bin alias must not be empty');
  }
});

// Fenced json blocks in the docs; exactly one must carry the recommended package.json.
function jsonBlocks(doc) {
  const blocks = [...doc.matchAll(/```json\s*\n([\s\S]*?)```/g)].map((m) => m[1]);
  return blocks.map((block) => JSON.parse(block)).filter((value) => value && typeof value === 'object');
}

test('docs/packaging-recommendations.md carries one exact package.json edit', async () => {
  const docs = await read('docs/packaging-recommendations.md');
  assert.ok(docs.length > 0, 'docs/packaging-recommendations.md is missing');
  const candidates = jsonBlocks(docs).filter((value) => Array.isArray(value.files));
  assert.equal(candidates.length, 1, 'exactly one json block with a files array is expected');
  return candidates[0];
});

test('the recommended package.json manifest stays consistent', async () => {
  const docs = await read('docs/packaging-recommendations.md');
  const rec = jsonBlocks(docs).filter((value) => Array.isArray(value.files))[0];

  assert.equal(rec.name, 'linkedin-api-mcp');
  assert.equal(rec.version, '0.2.0');
  assert.ok(rec.private !== true, 'the package must not stay private');
  assert.equal(rec.publishConfig?.access, 'public');
  assert.equal(rec.bin?.linkedin, 'bin/linkedin.js');
  assert.equal(rec.bin?.['linkedin-api-mcp'], 'bin/linkedin-api-mcp.js');
  assert.equal(rec.engines?.node, '>=22.12.0');

  // Whitelisted directories that exist today must resolve; optional files may wait.
  for (const entry of rec.files) {
    if (entry.endsWith('/')) {
      assert.ok(existsSync(join(root, entry)), `files entry ${entry} does not exist`);
    } else if (entry !== 'LICENSE' && entry !== 'bin/linkedin-api-mcp.js') {
      assert.ok(existsSync(join(root, entry)), `files entry ${entry} does not exist`);
    }
  }

  // No research material, state, or tooling directories may ship.
  const banned = [
    'research_notes', 'reports', 'docs/superpowers', 'test', '.remember',
    '.superpowers', '.worktrees', '.claude/worktrees', '.linkedin-api-mcp',
    'node_modules', 'package-lock.json', 'npm-shrinkwrap.json', 'CLAUDE.md',
    '.git', '.github', '.claude',
  ];
  const isBanned = (normalized) => banned.some(
    (bad) => normalized === bad || normalized.startsWith(`${bad}/`) || normalized.startsWith(`${bad}\\`),
  );
  for (const entry of rec.files) {
    const normalized = entry.replace(/^\.\/+/, '').replace(/\/+$/, '');
    assert.ok(!isBanned(normalized), `files entry ${entry} ships something that must stay out`);
  }
});

test('installation.md documents the expected routes', async () => {
  const doc = await read('docs/installation.md');
  assert.ok(doc.length > 0, 'docs/installation.md is missing');
  for (const needle of [
    'FiredMosquito831/linkedin-api-mcp',
    'linkedin@linkedin-api-mcp',
    'claude plugin marketplace add',
    'claude plugin install',
    '/plugin install',
    'claude mcp add',
    'claude mcp add linkedin -s project -- node',
    'linkedin-api-mcp',
    'npx',
    'linkedin-api-mcp --transport stdio',
    'LINKEDIN_MCP_TOKEN',
    'claude plugin uninstall',
    'linkedin approvals approve',
    'mcp --transport stdio',
  ]) {
    assert.ok(doc.includes(needle), `installation.md must mention ${needle}`);
  }
  assert.match(doc, /not (yet )?published/i, 'npm routes must be marked as not published yet');
  assert.match(doc, /pushed to GitHub/i, 'the GitHub routes must be marked as needing a push');
  assert.ok(!doc.includes('linkedin-api-mcp mcp'), 'the auto-prefixing bin must not be called as "linkedin-api-mcp mcp"');
  assert.ok(doc.includes('only resolves when the file is loaded as the'), 'must document that ${CLAUDE_PLUGIN_ROOT} works in the plugin context only');
});

test('the plugin skill carries the operating rules', async () => {
  const text = await read('skills/linkedin/SKILL.md');
  const frontmatter = text.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '';
  assert.ok(frontmatter.length > 0, 'SKILL.md must start with frontmatter');
  assert.match(frontmatter, /^name: linkedin$/m);
  assert.match(frontmatter, /^description: .+$/m);
  for (const needle of [/untrusted/i, /prepare/i, /approv/i, /execute/i, /bulk|mass/i, /LINKEDIN_EXPERIMENTAL/, /capability-only/i]) {
    assert.ok(needle.test(text), `SKILL.md must cover ${needle}`);
  }
});

test('no packaging file bakes a secret', async () => {
  const targets = [
    '.claude-plugin/marketplace.json',
    '.claude-plugin/plugin.json',
    '.mcp.json',
    'skills/linkedin/SKILL.md',
    'docs/installation.md',
    'docs/packaging-recommendations.md',
  ];
  for (const rel of targets) {
    scanForSecrets(rel, await read(rel));
  }
});
