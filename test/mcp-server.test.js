import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../src/mcp/server.js';
import { startMcp } from '../src/mcp/start.js';
import { VERSION } from '../src/version.js';

const CATALOG = [
  {
    name: 'profile.get',
    access: 'read',
    description: 'Read a LinkedIn profile page.',
    experimental: false,
    verification: 'fixture-tested',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', minLength: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
        cursor: { type: 'integer', minimum: 0, default: 0 },
      },
      required: ['url'],
      additionalProperties: false,
    },
  },
  {
    name: 'posts.list',
    access: 'read',
    description: 'List recent posts.',
    experimental: false,
    verification: 'unverified',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
        cursor: { type: 'integer', minimum: 0, default: 0 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'feed.list',
    access: 'read',
    description: 'List the news feed.',
    experimental: true,
    verification: 'unverified',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'inbox.thread',
    access: 'read',
    description: 'Read one inbox thread.',
    experimental: false,
    verification: 'unverified',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', minLength: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
      },
      required: ['url'],
      additionalProperties: false,
    },
  },
  {
    name: 'profile.update',
    access: 'write',
    description: 'Update profile fields.',
    experimental: false,
    verification: 'unverified',
    inputSchema: {
      type: 'object',
      properties: {
        fields: {
          type: 'object',
          properties: {
            headline: { type: 'string', minLength: 1, maxLength: 220 },
            about: { type: 'string', maxLength: 2600 },
          },
          additionalProperties: false,
        },
      },
      required: ['fields'],
      additionalProperties: false,
    },
  },
  {
    name: 'posts.create',
    access: 'write',
    description: 'Create a post.',
    experimental: false,
    verification: 'fixture-tested',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', minLength: 1, maxLength: 3000 },
        imagePath: { type: 'string' },
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'posts.delete',
    access: 'write',
    description: 'Delete a post.',
    experimental: true,
    verification: 'unverified',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string', minLength: 1 } },
      required: ['url'],
      additionalProperties: false,
    },
  },
];

function makeFakeOperations(options = {}) {
  const approvals = new Map();
  const state = {
    calls: [],
    prepares: [],
    executes: [],
    statusChecks: [],
    approvals,
    nextApproval: 0,
  };
  const operations = {
    state,
    list() {
      return CATALOG;
    },
    async call(name, input) {
      state.calls.push(name);
      if (options.readError) throw options.readError;
      if (name === 'profile.get') {
        return {
          schemaVersion: 1,
          success: true,
          operation: name,
          account: 'default',
          data: { profile: { url: input.url, headline: 'Fixture Headline' } },
        };
      }
      if (name === 'posts.list') {
        return {
          schemaVersion: 1,
          success: true,
          operation: name,
          account: 'default',
          data: { items: [], nextCursor: null, sourceUrl: 'https://www.linkedin.com/feed/' },
        };
      }
      if (name === 'feed.list') {
        return {
          schemaVersion: 1,
          success: true,
          operation: name,
          account: 'default',
          data: { items: [{ id: 'fixture-feed-1' }], nextCursor: null },
        };
      }
      if (name === 'inbox.thread') {
        return {
          schemaVersion: 1,
          success: true,
          operation: name,
          account: 'default',
          data: { thread: { url: input.url, messages: [] }, nextCursor: null },
        };
      }
      const error = new Error('unknown operation');
      error.code = 'NOT_FOUND';
      throw error;
    },
    async prepare(name, input) {
      state.prepares.push(name);
      if (options.prepareError) throw options.prepareError;
      const approvalId = `appr-${String(++state.nextApproval).padStart(2, '0')}`;
      const expiresAt = '2026-10-21T12:00:00Z';
      approvals.set(approvalId, {
        approvalId,
        operation: name,
        account: 'default',
        state: 'pending',
        payload: input,
        expiresAt,
      });
      return {
        schemaVersion: 1,
        success: true,
        operation: name,
        account: 'default',
        data: { approvalId, expiresAt, preview: JSON.stringify(input) },
      };
    },
    async execute(approvalId) {
      state.executes.push(approvalId);
      const approval = approvals.get(approvalId);
      if (!approval) {
        const error = new Error('unknown approval');
        error.code = 'APPROVAL_NOT_FOUND';
        throw error;
      }
      if (approval.state === 'executed') {
        const error = new Error('approval already consumed');
        error.code = 'APPROVAL_CONSUMED';
        throw error;
      }
      if (approval.state !== 'approved') {
        const error = new Error('operator approval required before execution');
        error.code = 'APPROVAL_REQUIRED';
        throw error;
      }
      approval.state = 'executed';
      return {
        schemaVersion: 1,
        success: true,
        operation: approval.operation,
        account: approval.account,
        data: { outcome: 'verified', url: 'https://www.linkedin.com/posts/fixture', evidence: 'fixture-verified' },
      };
    },
    async approvalStatus(approvalId) {
      state.statusChecks.push(approvalId);
      const approval = approvals.get(approvalId);
      if (!approval) {
        const error = new Error('unknown approval');
        error.code = 'APPROVAL_NOT_FOUND';
        throw error;
      }
      return {
        schemaVersion: 1,
        success: true,
        operation: 'approval.status',
        account: approval.account,
        data: { approvalId: approval.approvalId, state: approval.state, expiresAt: approval.expiresAt },
      };
    },
  };
  return operations;
}

async function withClient(createOptions, fn) {
  const operations = createOptions.operations;
  const server = createMcpServer({ operations, ...createOptions });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'mcp-test-client', version: '1.0.0' }, {});
  await client.connect(clientTransport);
  try {
    await fn({ client, server, operations });
  } finally {
    await client.close();
    await server.close();
  }
}

test('createMcpServer validates its inputs', () => {
  assert.throws(() => createMcpServer({}), TypeError);
  assert.throws(() => createMcpServer({ operations: {} }), TypeError, 'list() and call() are required');
  assert.throws(() => createMcpServer({ operations: null }), TypeError);
  assert.throws(
    () =>
      createMcpServer({
        operations: { list: async () => [], call: async () => {} },
      }),
    TypeError,
    'a promise-returning list() is not supported; list() must be synchronous',
  );
  assert.throws(
    () =>
      createMcpServer({
        operations: {
          list: () => [
            { name: 'ok.read', access: 'read', inputSchema: { type: 'object', properties: {} } },
            { name: 'bad.write-now', access: 'both', inputSchema: {} },
          ],
          call: async () => {},
        },
      }),
    TypeError,
    'row with unknown access class must be rejected',
  );
  assert.throws(
    () =>
      createMcpServer({
        operations: {
          list: () => [
            { name: 'a.b', access: 'read', inputSchema: {} },
            { name: 'a_b', access: 'read', inputSchema: {} },
          ],
          call: async () => {},
        },
      }),
    TypeError,
    'duplicate tool names must be rejected',
  );
  assert.throws(
    () =>
      createMcpServer({
        operations: {
          list: () => [
            { name: 'bad.ref', access: 'read', inputSchema: { $ref: '#/definitions/x' } },
          ],
          call: async () => {},
        },
      }),
    TypeError,
    'unsupported inputSchema must be rejected at construction',
  );
});

test('in-memory handshake lists stable and experimental tools with schemas and annotations', async () => {
  await withClient({ operations: makeFakeOperations(), experimental: true }, async ({ client }) => {
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name).sort();
    assert.deepEqual(names, [
      'linkedin_approval_status',
      'linkedin_capabilities',
      'linkedin_execute_approved',
      'linkedin_feed_list',
      'linkedin_inbox_thread',
      'linkedin_posts_create_prepare',
      'linkedin_posts_delete_prepare',
      'linkedin_posts_list',
      'linkedin_profile_get',
      'linkedin_profile_update_prepare',
    ]);
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    const profile = byName.get('linkedin_profile_get');
    assert.deepEqual(profile.inputSchema.required, ['url']);
    assert.equal(profile.inputSchema.properties.limit.maximum, 50);
    assert.equal(profile.inputSchema.additionalProperties, false);
    assert.equal(profile.annotations?.readOnlyHint, true);
    assert.match(profile.description, /untrusted data/);
    const prepare = byName.get('linkedin_posts_create_prepare');
    assert.deepEqual(prepare.inputSchema.required, ['text']);
    assert.equal(prepare.annotations?.readOnlyHint, false);
    assert.match(prepare.description, /approval/);
    const execute = byName.get('linkedin_execute_approved');
    assert.deepEqual(execute.inputSchema.required, ['approvalId']);
  });
});

test('in-memory read call returns the standard envelope in structuredContent and text', async () => {
  await withClient({ operations: makeFakeOperations() }, async ({ client, operations }) => {
    const result = await client.callTool({
      name: 'linkedin_profile_get',
      arguments: { url: 'https://www.linkedin.com/in/x', limit: 5 },
    });
    assert.equal(result.isError, undefined);
    assert.equal(operations.state.calls.at(-1), 'profile.get');
    assert.equal(result.structuredContent.success, true);
    assert.equal(result.structuredContent.operation, 'profile.get');
    assert.equal(result.structuredContent.account, 'default');
    assert.equal(result.structuredContent.data.profile.headline, 'Fixture Headline');
    assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  });
});

test('in-memory input validation rejects bad arguments without leaking internals', async () => {
  await withClient({ operations: makeFakeOperations() }, async ({ client }) => {
    const badType = await client.callTool({
      name: 'linkedin_profile_get',
      arguments: { url: 42 },
    });
    assert.equal(badType.isError, true);
    assert.match(badType.content[0].text, /Invalid arguments|url/i);
    const extra = await client.callTool({
      name: 'linkedin_profile_get',
      arguments: { url: 'https://www.linkedin.com/in/x', surprise: 1 },
    });
    assert.equal(extra.isError, true, 'unexpected top-level properties must be rejected');
    const limit = await client.callTool({
      name: 'linkedin_posts_list',
      arguments: { limit: 51 },
    });
    assert.equal(limit.isError, true, 'out-of-range limit must be rejected');
    const missing = await client.callTool({ name: 'linkedin_profile_get' });
    assert.equal(missing.isError, true, 'missing required url must be rejected');
    for (const result of [badType, extra, limit, missing]) {
      assert.doesNotMatch(result.content[0].text, /at .+ \(.+\)/, 'no stack frames in tool errors');
    }
    const unknown = await client.callTool({ name: 'linkedin_no_such_tool' });
    assert.equal(unknown.isError, true);
    assert.match(unknown.content[0].text, /not found/i);
  });
});

test('in-memory write flow: prepare, pending execute rejected, operator approval, single consumption', async () => {
  await withClient({ operations: makeFakeOperations() }, async ({ client, operations }) => {
    assert.equal(operations.state.executes.length, 0);
    const prepared = await client.callTool({
      name: 'linkedin_posts_create_prepare',
      arguments: { text: 'Hello world' },
    });
    assert.equal(prepared.isError, undefined);
    const { approvalId, expiresAt } = prepared.structuredContent.data;
    assert.equal(approvalId, 'appr-01');
    assert.equal(typeof expiresAt, 'string');
    assert.equal(operations.state.executes.length, 0, 'prepare must not dispatch');

    const status = await client.callTool({ name: 'linkedin_approval_status', arguments: { approvalId } });
    assert.equal(status.structuredContent.data.state, 'pending');

    const pendingExecute = await client.callTool({
      name: 'linkedin_execute_approved',
      arguments: { approvalId },
    });
    assert.equal(pendingExecute.isError, true);
    const pendingEnvelope = JSON.parse(pendingExecute.content[0].text);
    assert.equal(pendingEnvelope.success, false);
    assert.equal(pendingEnvelope.error.code, 'APPROVAL_REQUIRED');
    assert.equal(
      operations.state.approvals.get(approvalId).state,
      'pending',
      'a tool call must not grant approval',
    );

    // Operator grants the approval out-of-band (separate CLI surface).
    operations.state.approvals.get(approvalId).state = 'approved';

    const granted = await client.callTool({ name: 'linkedin_approval_status', arguments: { approvalId } });
    assert.equal(granted.structuredContent.data.state, 'approved');

    const executed = await client.callTool({
      name: 'linkedin_execute_approved',
      arguments: { approvalId },
    });
    assert.equal(executed.isError, undefined);
    assert.equal(executed.structuredContent.data.outcome, 'verified');
    assert.equal(operations.state.executes.at(-1), approvalId);

    const replayed = await client.callTool({
      name: 'linkedin_execute_approved',
      arguments: { approvalId },
    });
    assert.equal(replayed.isError, true);
    assert.equal(JSON.parse(replayed.content[0].text).error.code, 'APPROVAL_CONSUMED');

    const unknownStatus = await client.callTool({
      name: 'linkedin_approval_status',
      arguments: { approvalId: 'appr-nope' },
    });
    assert.equal(unknownStatus.isError, true);
    assert.equal(JSON.parse(unknownStatus.content[0].text).error.code, 'APPROVAL_NOT_FOUND');
  });
});

test('in-memory error envelopes are sanitized and carry retry metadata', async () => {
  const layoutError = new Error('Unsupported layout for profile.get');
  layoutError.code = 'LAYOUT_UNSUPPORTED';
  layoutError.completionUnknown = false;
  await withClient(
    { operations: makeFakeOperations({ readError: layoutError }) },
    async ({ client }) => {
      const result = await client.callTool({
        name: 'linkedin_profile_get',
        arguments: { url: 'https://www.linkedin.com/in/x' },
      });
      assert.equal(result.isError, true);
      const envelope = JSON.parse(result.content[0].text);
      assert.deepEqual(envelope, {
        schemaVersion: 1,
        success: false,
        error: { code: 'LAYOUT_UNSUPPORTED', message: 'Unsupported layout for profile.get', completionUnknown: false },
      });
      assert.doesNotMatch(result.content[0].text, /at .+ \(.+\)/, 'no stack frames');
      assert.doesNotMatch(result.content[0].text, /authorization|token/i, 'no credential material');
    },
  );

  const rateError = new Error('Rate limited');
  rateError.code = 'RATE_LIMITED';
  rateError.retryAfter = 30;
  await withClient({ operations: makeFakeOperations({ readError: rateError }) }, async ({ client }) => {
    const result = await client.callTool({
      name: 'linkedin_posts_list',
      arguments: { limit: 1 },
    });
    const envelope = JSON.parse(result.content[0].text);
    assert.equal(result.isError, true);
    assert.equal(envelope.error.code, 'RATE_LIMITED');
    assert.equal(envelope.error.retryAfter, 30);
  });
});

test('unknown exceptions never expose secret-bearing text and raw 429 keeps wait metadata', async () => {
  await withClient({ operations: makeFakeOperations({ readError: new Error('secret-token-material') }) }, async ({ client }) => {
    const result = await client.callTool({ name: 'linkedin_posts_list', arguments: {} });
    assert.equal(result.isError, true);
    assert.doesNotMatch(result.content[0].text, /secret-token-material/);
  });
  await withClient({ operations: makeFakeOperations({ readError: Object.assign(new Error('Wait'), { status: 429, retryAfter: '120' }) }) }, async ({ client }) => {
    const result = await client.callTool({ name: 'linkedin_posts_list', arguments: {} });
    const error = JSON.parse(result.content[0].text).error;
    assert.equal(error.code, 'RATE_LIMITED');
    assert.equal(error.retryAfter, '120');
  });
});

test('disabled real-catalog server cannot execute an approval through an injected service', async () => {
  const fake = makeFakeOperations();
  fake.list = () => CATALOG.map((row) => ({ ...row, experimental: true }));
  await withClient({ operations: fake, experimental: false }, async ({ client }) => {
    const result = await client.callTool({ name: 'linkedin_execute_approved', arguments: { approvalId: 'any' } });
    assert.equal(result.isError, true);
    assert.equal(JSON.parse(result.content[0].text).error.code, 'EXPERIMENTAL_DISABLED');
    assert.equal(fake.state.executes.length, 0);
  });
});

test('operations service gate overrides a mismatched server experimental flag', async () => {
  const fake = makeFakeOperations();
  fake.experimental = false;
  fake.list = () => CATALOG.map((row) => ({ ...row, experimental: true }));
  await withClient({ operations: fake, experimental: true }, async ({ client }) => {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 3, 'no operation tools may be advertised');
    const cap = await client.callTool({ name: 'linkedin_capabilities', arguments: {} });
    assert.equal(cap.structuredContent.data.experimental, false);
    const execute = await client.callTool({ name: 'linkedin_execute_approved', arguments: { approvalId: 'any' } });
    assert.equal(execute.isError, true);
    assert.equal(JSON.parse(execute.content[0].text).error.code, 'EXPERIMENTAL_DISABLED');
    assert.equal(fake.state.executes.length, 0);
  });
});

test('in-memory nested schemas enforce strict additionalProperties at every level', async () => {
  await withClient({ operations: makeFakeOperations() }, async ({ client }) => {
    const nestedExtra = await client.callTool({
      name: 'linkedin_profile_update_prepare',
      arguments: { fields: { headline: 'Engineering Manager', extra: true } },
    });
    assert.equal(nestedExtra.isError, true, 'nested unexpected properties must be rejected');

    const topExtra = await client.callTool({
      name: 'linkedin_profile_update_prepare',
      arguments: { fields: { headline: 'Engineering Manager' }, bonus: 1 },
    });
    assert.equal(topExtra.isError, true, 'top-level unexpected properties must be rejected');

    const good = await client.callTool({
      name: 'linkedin_profile_update_prepare',
      arguments: { fields: { headline: 'Engineering Manager', about: 'I build things.' } },
    });
    assert.equal(good.isError, undefined, 'strict-but-valid nested payloads must pass');
  });
});

test('in-memory read descriptions carry the untrusted-data warning and the mark-seen caveat', async () => {
  await withClient({ operations: makeFakeOperations() }, async ({ client }) => {
    const { tools } = await client.listTools();
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    const thread = byName.get('linkedin_inbox_thread');
    assert.match(thread.description, /implicitly mark.*seen/i, 'conversation reads must disclose the mark-seen side effect');
    assert.match(thread.description, /untrusted data/);
    assert.equal(thread.annotations?.readOnlyHint, true, 'hint remains read-only: no explicit mutation');
    const profile = byName.get('linkedin_profile_get');
    assert.doesNotMatch(profile.description, /implicitly mark.*seen/i);
    assert.match(profile.description, /untrusted data/);
  });
});

test('createMcpServer validates catalog row metadata', () => {
  const baseRow = { name: 'x.y', access: 'read', description: 'd', inputSchema: {} };
  const build = (rows) => createMcpServer({ operations: { list: () => rows, call: async () => {} } });
  assert.throws(
    () => build([{ ...baseRow, description: 42 }]),
    TypeError,
    'non-string descriptions must be rejected',
  );
  assert.throws(
    () => build([{ ...baseRow, experimental: 'yes' }]),
    TypeError,
    'non-boolean experimental flags must be rejected',
  );
  assert.throws(
    () => build([{ ...baseRow, inputSchema: { type: 'object', properties: { a: 1 } } }]),
    TypeError,
    'malformed inputSchema must be rejected',
  );
});

test('no MCP module writes to stdout (protocol-only stdout is owned by the stdio transport)', () => {
  for (const file of ['../src/mcp/server.js', '../src/mcp/start.js']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /console\.log\s*\(|process\.stdout/, `${file} must not log to stdout`);
  }
});

test('in-memory capabilities lists the catalog and honors the experimental flag', async () => {
  await withClient({ operations: makeFakeOperations(), experimental: true }, async ({ client }) => {
    const full = await client.callTool({ name: 'linkedin_capabilities', arguments: {} });
    const fullNames = full.structuredContent.data.operations.map((row) => row.name).sort();
    assert.deepEqual(fullNames, CATALOG.map((row) => row.name).sort());
    assert.equal(full.structuredContent.data.experimental, true);
    assert.equal(full.structuredContent.data.version, VERSION);
  });
});

test('in-memory experimental=false exposes stable tools only and rejects experimental calls', async () => {
  await withClient({ operations: makeFakeOperations(), experimental: false }, async ({ client }) => {
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    assert.ok(names.includes('linkedin_profile_get'));
    assert.ok(names.includes('linkedin_posts_create_prepare'));
    assert.ok(!names.includes('linkedin_feed_list'), 'experimental read tool hidden');
    assert.ok(!names.includes('linkedin_posts_delete_prepare'), 'experimental write tool hidden');

    const cap = await client.callTool({ name: 'linkedin_capabilities', arguments: {} });
    assert.equal(cap.structuredContent.data.experimental, false);
    const listed = cap.structuredContent.data.operations.map((row) => row.name).sort();
    assert.deepEqual(listed, ['inbox.thread', 'posts.create', 'posts.list', 'profile.get', 'profile.update']);

    const denied = await client.callTool({ name: 'linkedin_feed_list', arguments: {} });
    assert.equal(denied.isError, true, 'calling an unregistered experimental tool is explicitly rejected');
    assert.match(denied.content[0].text, /not found/i);
  });
});

test('in-memory server close disconnects the transport', async () => {
  const operations = makeFakeOperations();
  const server = createMcpServer({ operations });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'close-check', version: '1.0.0' });
  let closed = false;
  clientTransport.onclose = () => {
    closed = true;
  };
  await client.connect(clientTransport);
  assert.ok(server.isConnected());
  await server.close();
  assert.ok(closed, 'closing the server must close the client transport');
  assert.ok(!server.isConnected());
});

test('startMcp stdio boots a real stdio server usable by an SDK client', async () => {
  const operations = makeFakeOperations();
  const startPath = fileURLToPath(new URL('../src/mcp/start.js', import.meta.url));
  const tmpDir = mkdtempSync(join(tmpdir(), 'mcp-stdio-test-'));
  const scriptPath = join(tmpDir, 'stdio-entry.mjs');
  const operationsJson = JSON.stringify(CATALOG);
  writeFileSync(
    scriptPath,
    `
import { startMcp } from ${JSON.stringify(pathToFileURL(startPath).href)};
const rows = ${operationsJson};
const operations = {
  list: () => rows,
  async call(name, input) {
    if (name === 'profile.get') {
      return { schemaVersion: 1, success: true, operation: name, account: 'default', data: { headline: 'Fixture Headline', url: input.url } };
    }
    const error = new Error('unknown operation');
    error.code = 'NOT_FOUND';
    throw error;
  },
  async prepare(name, input) {
    return { schemaVersion: 1, success: true, operation: name, account: 'default', data: { approvalId: 'appr-std', expiresAt: '2026-10-21T12:00:00Z', preview: JSON.stringify(input) } };
  },
  async execute(approvalId) {
    const error = new Error('operator approval required');
    error.code = 'APPROVAL_REQUIRED';
    throw error;
  },
  async approvalStatus(approvalId) {
    return { schemaVersion: 1, success: true, operation: 'approval.status', account: 'default', data: { approvalId, state: 'pending' } };
  },
};
const lifecycle = await startMcp({ operations, experimental: false, transport: 'stdio' });
process.stdin.on('close', () => {
  lifecycle.close().catch(() => {}).finally(() => process.exit(0));
});
`,
  );
  try {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [scriptPath],
      stderr: 'ignore',
      cwd: tmpDir,
    });
    const client = new Client({ name: 'stdio-harness', version: '1.0.0' });
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.ok(tools.some((tool) => tool.name === 'linkedin_profile_get'));
    assert.ok(tools.some((tool) => tool.name === 'linkedin_posts_create_prepare'));
    const result = await client.callTool({
      name: 'linkedin_profile_get',
      arguments: { url: 'https://www.linkedin.com/in/x' },
    });
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.data.headline, 'Fixture Headline');
    const prepared = await client.callTool({ name: 'linkedin_posts_create_prepare', arguments: { text: 'hi' } });
    assert.equal(prepared.structuredContent.data.approvalId, 'appr-std');
    await client.close();
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('startMcp validates transport and token parameters', async () => {
  const operations = makeFakeOperations();
  await assert.rejects(
    startMcp({ operations, transport: 'websocket' }),
    TypeError,
    'unknown transport must be rejected',
  );
  await assert.rejects(startMcp({ operations: null }), TypeError);
  await assert.rejects(
    startMcp({ operations, transport: 'http', port: 0, token: 'short' }),
    RangeError,
    'short token must be rejected',
  );
  await assert.rejects(
    startMcp({ operations, transport: 'http', port: 0, token: '' }),
    TypeError,
    'empty token must be rejected',
  );
  const loopback = await startMcp({ operations, transport: 'http', port: 0, token: 'x'.repeat(32) });
  assert.match(loopback.address, /^127\.0\.0\.1:\d+$/, 'http lifecycle reports its loopback address');
  assert.equal(typeof loopback.close, 'function');
  await loopback.close();
  await loopback.close();
});

test('startMcp stdio returns a lifecycle object without address', async () => {
  const operations = makeFakeOperations();
  const lifecycle = await startMcp({ operations, transport: 'stdio' });
  assert.equal(typeof lifecycle.close, 'function');
  assert.equal(lifecycle.address, undefined);
  await lifecycle.close();
  await lifecycle.close();
});
