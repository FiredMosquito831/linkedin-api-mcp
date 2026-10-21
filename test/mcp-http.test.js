import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startMcp } from '../src/mcp/start.js';

const TOKEN = 'loopback-integration-' + 'k'.repeat(16);

function makeOperations() {
  const approvals = new Map();
  let counter = 0;
  return {
    list() {
      return [
        {
          name: 'profile.get',
          access: 'read',
          description: 'Read a LinkedIn profile page.',
          experimental: false,
          verification: 'unverified',
          inputSchema: {
            type: 'object',
            properties: { url: { type: 'string', minLength: 1 }, limit: { type: 'integer', minimum: 1, maximum: 50 } },
            required: ['url'],
            additionalProperties: false,
          },
        },
        {
          name: 'posts.create',
          access: 'write',
          description: 'Create a post.',
          experimental: false,
          verification: 'unverified',
          inputSchema: {
            type: 'object',
            properties: { text: { type: 'string', minLength: 1 } },
            required: ['text'],
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
      ];
    },
    async call(name, input) {
      if (name === 'profile.get') {
        return {
          schemaVersion: 1,
          success: true,
          operation: name,
          account: 'default',
          data: { headline: 'Fixture Headline', url: input.url },
        };
      }
      const error = new Error('unknown operation');
      error.code = 'NOT_FOUND';
      throw error;
    },
    async prepare(name, input) {
      const approvalId = `appr-http-${String(++counter).padStart(2, '0')}`;
      approvals.set(approvalId, { approvalId, operation: name, account: 'default', state: 'pending', payload: input });
      return {
        schemaVersion: 1,
        success: true,
        operation: name,
        account: 'default',
        data: { approvalId, expiresAt: '2026-10-21T12:00:00Z', preview: JSON.stringify(input) },
      };
    },
    async execute(approvalId) {
      const approval = approvals.get(approvalId);
      if (!approval || approval.state === 'pending') {
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
        data: { outcome: 'verified', url: 'https://www.linkedin.com/posts/fixture' },
      };
    },
    async approvalStatus(approvalId) {
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
        data: { approvalId, state: approval.state, expiresAt: approval.expiresAt },
      };
    },
  };
}

let lifecycle;
let port;

before(async () => {
  lifecycle = await startMcp({
    operations: makeOperations(),
    experimental: true,
    transport: 'streamable-http',
    port: 0,
    token: TOKEN,
  });
  const [host, hostPort] = lifecycle.address.split(':');
  assert.equal(host, '127.0.0.1', 'the server must bind loopback only');
  port = Number(hostPort);
  assert.ok(port > 0, 'port 0 must resolve to an ephemeral loopback port');
});

after(async () => {
  await lifecycle.close();
});

function raw(method, { headers = {}, body, path = '/mcp' } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', (error) => reject(error));
    if (body !== undefined) req.write(body);
    req.end();
  });
}

function initializeBody(extraHeaders = {}) {
  const message = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'raw-test', version: '0.0.0' },
    },
  };
  return {
    body: JSON.stringify(message),
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...extraHeaders,
    },
  };
}

function authorize(extra = {}) {
  return { Authorization: `Bearer ${TOKEN}`, ...extra };
}

async function withClient(fn) {
  const client = new Client({ name: 'loopback-test-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${port}/mcp`),
    { requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } } },
  );
  await client.connect(transport);
  try {
    await fn(client);
  } finally {
    await client.close();
  }
}

test('a full SDK client handshake, list, and call works over loopback', async () => {
  await withClient(async (client) => {
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name).sort();
    assert.deepEqual(names, [
      'linkedin_approval_status',
      'linkedin_capabilities',
      'linkedin_execute_approved',
      'linkedin_feed_list',
      'linkedin_posts_create_prepare',
      'linkedin_profile_get',
    ]);
    const result = await client.callTool({
      name: 'linkedin_profile_get',
      arguments: { url: 'https://www.linkedin.com/in/x', limit: 3 },
    });
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.success, true);
    assert.equal(result.structuredContent.data.headline, 'Fixture Headline');

    const bad = await client.callTool({ name: 'linkedin_profile_get', arguments: { url: 'https://x', limit: 51 } });
    assert.equal(bad.isError, true, 'out-of-range input must be rejected strictly');
    assert.doesNotMatch(bad.content[0].text, /authorization/i, 'errors must not leak credentials');

    const prepared = await client.callTool({ name: 'linkedin_posts_create_prepare', arguments: { text: 'hi' } });
    assert.equal(prepared.isError, undefined);
    const { approvalId } = prepared.structuredContent.data;

    const pending = await client.callTool({ name: 'linkedin_execute_approved', arguments: { approvalId } });
    assert.equal(pending.isError, true);
    assert.equal(JSON.parse(pending.content[0].text).error.code, 'APPROVAL_REQUIRED');
  });
});

test('multiple concurrent clients get independent sessions', async () => {
  await Promise.all([
    withClient(async (client) => {
      const result = await client.callTool({ name: 'linkedin_capabilities', arguments: {} });
      assert.equal(result.structuredContent.data.experimental, true);
    }),
    withClient(async (client) => {
      const result = await client.callTool({ name: 'linkedin_profile_get', arguments: { url: 'https://www.linkedin.com/in/y' } });
      assert.equal(result.structuredContent.data.url, 'https://www.linkedin.com/in/y');
    }),
  ]);
});

test('requests without a valid bearer token are rejected with 401', async () => {
  const { body, headers } = initializeBody();
  const noAuth = await raw('POST', { headers: { ...headers, Authorization: '' }, body });
  assert.equal(noAuth.status, 401);
  assert.match(noAuth.headers['www-authenticate'] ?? '', /Bearer/);

  const wrongAuth = await raw('POST', {
    headers: { ...headers, Authorization: 'Bearer totally-wrong-token-0000' },
    body,
  });
  assert.equal(wrongAuth.status, 401);

  const inUrlOnly = await raw('POST', { path: `/mcp?token=${encodeURIComponent(TOKEN)}`, headers, body });
  assert.equal(inUrlOnly.status, 401, 'tokens in the URL must never be accepted');

  const malformed = await raw('POST', {
    headers: { ...headers, Authorization: 'Basic c2VjcmV0' },
    body,
  });
  assert.equal(malformed.status, 401, 'non-bearer schemes must be rejected');
});

test('Host and Origin are validated against loopback', async () => {
  const { body, headers } = initializeBody();
  const evilHost = await raw('POST', {
    headers: { ...headers, ...authorize(), Host: 'evil.example' },
    body,
  });
  assert.equal(evilHost.status, 403, 'arbitrary Host headers must be denied');

  const evilOrigin = await raw('POST', {
    headers: { ...headers, ...authorize(), Origin: 'https://evil.example' },
    body,
  });
  assert.equal(evilOrigin.status, 403, 'arbitrary web origins must be denied');

  const loopbackOrigin = await raw('POST', {
    headers: { ...headers, ...authorize(), Origin: `http://127.0.0.1:${port}` },
    body,
  });
  assert.equal(loopbackOrigin.status, 200, 'a matching loopback origin is accepted');
});

test('request bodies over 1MB are rejected with 413', async () => {
  const { headers } = initializeBody();
  const message = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'raw-test', version: '0.0.0', big: 'x'.repeat(1_200_000) },
    },
  });
  const result = await raw('POST', {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...authorize(),
    },
    body: message,
  });
  assert.equal(result.status, 413);
  assert.match(result.body, /1000000/);
});

test('unknown or terminated sessions are rejected', async () => {
  const { body, headers } = initializeBody();
  const unknown = await raw('POST', {
    headers: { ...headers, ...authorize(), 'Mcp-Session-Id': 'no-such-session' },
    body,
  });
  assert.equal(unknown.status, 404);

  const missingSessionGet = await raw('GET', { headers: { ...authorize() } });
  assert.equal(missingSessionGet.status, 404);

  const fresh = await raw('POST', { headers: { ...headers, ...authorize() }, body });
  assert.equal(fresh.status, 200);
  const sessionId = fresh.headers['mcp-session-id'];
  assert.ok(typeof sessionId === 'string' && sessionId.length > 0, 'initialize must mint a session id');

  const deleted = await raw('DELETE', { headers: { ...authorize(), 'Mcp-Session-Id': sessionId } });
  assert.ok(deleted.status === 200 || deleted.status === 204);

  const reused = await raw('POST', {
    headers: { ...headers, ...authorize(), 'Mcp-Session-Id': sessionId },
    body,
  });
  assert.equal(reused.status, 404, 'a terminated session must not be reusable');
});

test('unsupported methods and the http alias behave correctly', async () => {
  const put = await raw('PUT', { headers: { ...authorize() }, body: '{}' });
  assert.equal(put.status, 405);
  assert.match(put.headers.allow ?? '', /GET, POST, DELETE/);

  const alias = await startMcp({
    operations: { list: () => [], call: async () => {} },
    transport: 'http',
    port: 0,
    token: 'alias-token-' + 'z'.repeat(8),
  });
  assert.match(alias.address, /^127\.0\.0\.1:\d+$/);
  await alias.close();
});

test('close() shuts down sessions and the socket; a second close is a no-op', async () => {
  await withClient(async (client) => {
    const result = await client.callTool({ name: 'linkedin_capabilities', arguments: {} });
    assert.equal(result.structuredContent.success, true);
  });
  await lifecycle.close();
  await lifecycle.close();
  await assert.rejects(
    raw('POST', {
      headers: { ...initializeBody().headers, ...authorize() },
      body: initializeBody().body,
    }),
    (error) => {
      assert.ok(
        ['ECONNREFUSED', 'ECONNRESET', 'EPIPE'].includes(error.code),
        `expected a dead socket, got ${error.code}`,
      );
      return true;
    },
    'the loopback socket must be closed',
  );
});
