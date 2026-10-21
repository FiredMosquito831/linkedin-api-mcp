import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../src/mcp/server.js';
import { OPERATIONS } from '../src/operations/catalog.js';

async function memory(experimental, fn) {
  const operations = {
    list: () => structuredClone(OPERATIONS),
    call: async (name, input) => ({ schemaVersion: 1, success: true, operation: name, account: 'default', data: input }),
    prepare: async (name) => ({ schemaVersion: 1, success: true, operation: name, account: 'default', data: { approvalId: 'fixture' } }),
    execute: async () => { throw new Error('must not run'); },
    approvalStatus: async () => ({ schemaVersion: 1, success: true, data: {} }),
  };
  const server = createMcpServer({ operations, experimental });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: 'catalog-integration', version: '1.0.0' });
  await client.connect(clientSide);
  try { await fn(client); } finally { await client.close(); await server.close(); }
}

test('all real catalog schemas round-trip through MCP and strict inputs remain enforced', async () => {
  await memory(true, async (client) => {
    const { tools } = await client.listTools();
    assert.equal(tools.length, OPERATIONS.length + 3);
    assert.ok(tools.some((tool) => tool.name === 'linkedin_sales_messages_reply_prepare'));
    assert.ok(!tools.some((tool) => /approve$/.test(tool.name)));
    const read = await client.callTool({ name: 'linkedin_profile_get', arguments: {} });
    assert.equal(read.isError, undefined);
    assert.equal(read.structuredContent.data.limit, 10);
    const write = await client.callTool({ name: 'linkedin_posts_create_prepare', arguments: { text: 'local fixture' } });
    assert.equal(write.structuredContent.data.approvalId, 'fixture');
    const bad = await client.callTool({ name: 'linkedin_posts_create_prepare', arguments: { text: 'fixture', confirmed: true } });
    assert.equal(bad.isError, true);
  });
});

test('real catalog defaults to no experimental operation tools', async () => {
  await memory(false, async (client) => {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 3);
    const cap = await client.callTool({ name: 'linkedin_capabilities', arguments: {} });
    assert.deepEqual(cap.structuredContent.data.operations, []);
  });
});

test('actual npm MCP entry point supports SDK stdio handshake without browser launch', async () => {
  const transport = new StdioClientTransport({ command: process.execPath,
    args: ['bin/linkedin-api-mcp.js', '--transport', 'stdio'], cwd: process.cwd(),
    env: { ...process.env, LINKEDIN_EXPERIMENTAL: '0' }, stderr: 'pipe' });
  const client = new Client({ name: 'entry-smoke', version: '1.0.0' });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 3);
  } finally { await client.close(); await transport.close(); }
});

test('MCP startup errors never write non-protocol stdout', async () => {
  let output = '';
  let errors = '';
  const child = spawn(process.execPath, ['bin/linkedin-api-mcp.js', '--transport', 'streamable-http'], {
    env: { ...process.env, LINKEDIN_MCP_TOKEN: '' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
  assert.notEqual(code, 0);
  assert.equal(output, '');
  assert.match(errors, /error/);
});

test('operation CLI catalog is parseable JSON from the real bin', async () => {
  let output = '';
  const child = spawn(process.execPath, ['bin/linkedin.js', 'operations', 'list'], { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => { output += chunk; });
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
  assert.equal(code, 0);
  assert.equal(JSON.parse(output).data.length, OPERATIONS.length);
});
