#!/usr/bin/env node
// Install the real tarball outside the source checkout, import the package,
// and run its installed CLI/MCP entry points. Never publishes or contacts LinkedIn.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = mkdtempSync(join(tmpdir(), 'linkedin-pack-smoke-'));
const npmCli = process.env.npm_execpath;
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
function npm(args, cwd) {
  if (!npmCli) throw new Error('Run this script with npm run pack:smoke');
  return execFileSync(process.execPath, [npmCli, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 180000 });
}
try {
  const packed = JSON.parse(npm(['pack', '--json', '--pack-destination', scratch], root))[0];
  const shipped = new Set(packed.files.map((file) => file.path));
  for (const expected of ['LICENSE', 'NOTICE', 'bin/linkedin.js', 'bin/linkedin-api-mcp.js', '.claude-plugin/plugin.json', '.mcp.json', 'skills/linkedin/SKILL.md', 'src/mcp/server.js', 'src/version.js']) {
    if (!shipped.has(expected)) throw new Error(`Tarball missing ${expected}`);
  }
  for (const file of shipped) {
    if (/^(?:test\/|research_notes\/|reports\/|\.git\/|\.claude\/|\.remember\/|\.superpowers\/|node_modules\/)/.test(file) || /(?:browser-profile|jobs\.json|accounts\.json|\.local\.json$|\.tgz$)/.test(file)) {
      throw new Error(`Tarball includes local-only material: ${file}`);
    }
  }
  const install = join(scratch, 'consumer');
  mkdirSync(install);
  writeFileSync(join(install, 'package.json'), JSON.stringify({ name: 'linkedin-install-smoke', private: true, type: 'module' }));
  npm(['install', '--ignore-scripts', '--no-audit', '--no-fund', join(scratch, packed.filename)], install);
  const state = join(scratch, 'state');
  const env = { ...process.env, LINKEDIN_STATE_DIR: state, LINKEDIN_ACCOUNT: 'default', LINKEDIN_EXPERIMENTAL: '0' };
  const probe = `
    import * as api from ${JSON.stringify(pkg.name)};
    import { createRequire } from 'node:module';
    import { dirname, join } from 'node:path';
    import { execFileSync } from 'node:child_process';
    const require = createRequire(import.meta.url);
    const packageRoot = dirname(dirname(require.resolve(${JSON.stringify(pkg.name)})));
    if (typeof api.createOperations !== 'function' || typeof api.createMcpServer !== 'function') throw new Error('Missing public exports');
    const invoke = (file,args) => execFileSync(process.execPath,[join(packageRoot,'bin',file),...args],{encoding:'utf8',env:process.env,timeout:15000});
    const catalog = JSON.parse(invoke('linkedin.js',['operations','list']));
    if (!Array.isArray(catalog.data) || catalog.data.length === 0) throw new Error('No installed operations catalog');
    if (!invoke('linkedin-api-mcp.js',['--help']).includes('linkedin mcp')) throw new Error('MCP entry point is broken');
    const operations = api.createOperations({stateDirectory:process.env.LINKEDIN_STATE_DIR});
    const server = api.createMcpServer({operations});
    if (server.server.getCapabilities().tools === undefined) throw new Error('No MCP tool capabilities');
    await server.close();
    console.log('Installed tarball: imports, CLI, MCP entry point and server passed.');
  `;
  writeFileSync(join(install, 'probe.mjs'), probe);
  const result = execFileSync(process.execPath, ['probe.mjs'], { cwd: install, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 30000 });
  process.stdout.write(result);
  console.log(`Checked ${pkg.name}@${pkg.version}: ${packed.files.length} shipped files, no local state.`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
