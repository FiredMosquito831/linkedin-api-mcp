// MCP entry points.
//
// startMcp({ operations, experimental, transport, port, token }) boots an
// MCP server and returns a lifecycle object { close, address? }. It never
// exits the process.
//
// - transport "stdio": protocol-only stdout, logs on stderr, no prompting
//   on stdin.
// - transport "http": secured loopback Streamable HTTP. Binds 127.0.0.1
//   only, requires a bearer token, validates Host and Origin, caps request
//   bodies, and closes every session and the socket on shutdown. The token
//   is only accepted from the Authorization header (never from the URL)
//   and is never logged.

import { createServer as createHttpServer } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './server.js';

export const MIN_TOKEN_LENGTH = 16;
export const MAX_BODY_BYTES = 1_000_000;
const LOOPBACK_HOST = '127.0.0.1';

function bearerMatches(authorization, token) {
  if (typeof authorization !== 'string') return false;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  if (!match) return false;
  const provided = match[1].trim();
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(token, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function sendJson(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    ...extraHeaders,
  });
  res.end(payload);
}

function startStdio({ operations, experimental, version }) {
  const server = createMcpServer({ operations, experimental, version });
  const transport = new StdioServerTransport();
  let closed = false;
  return {
    async close() {
      if (closed) return;
      closed = true;
      await server.close();
    },
    async start() {
      await server.connect(transport);
      console.error('[linkedin-mcp] stdio server started');
    },
  };
}

async function startHttp({ operations, experimental, version, port, token }) {
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 0 || port > 65535) {
    throw new TypeError('port must be an integer between 0 and 65535');
  }
  if (typeof token !== 'string' || token.trim().length === 0) {
    throw new TypeError('token is required for the http transport and must be a non-empty string');
  }
  if (token.length < MIN_TOKEN_LENGTH) {
    throw new RangeError(`token must be at least ${MIN_TOKEN_LENGTH} characters long`);
  }

  // Per-session state: each MCP session gets its own server + transport
  // pair. `sessions` routes requests by session id; `live` tracks every
  // created session entry (including ones that failed before their id was
  // minted) so close() can always tear everything down.
  const sessions = new Map(); // sessionId -> { id, server, transport }
  const live = new Set(); // all created session entries

  async function makeSession(req, res, hosts, origins) {
    const sessionServer = createMcpServer({ operations, experimental, version });
    const entry = { id: null, server: sessionServer, transport: null };
    live.add(entry);
    const sessionTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableDnsRebindingProtection: true,
      allowedHosts: hosts,
      allowedOrigins: origins,
      maxRequestBodySize: MAX_BODY_BYTES,
      onsessioninitialized: (sessionId) => {
        entry.id = sessionId;
        sessions.set(sessionId, entry);
      },
      onsessionclosed: (sessionId) => {
        sessions.delete(sessionId);
      },
    });
    entry.transport = sessionTransport;
    await sessionServer.connect(sessionTransport);
    await sessionTransport.handleRequest(req, res);
  }

  const httpServer = createHttpServer((req, res) => {
    const hosts = ['127.0.0.1', 'localhost'].map((host) => `${host}:${httpServer.address().port}`);
    const origins = ['127.0.0.1', 'localhost'].map((host) => `http://${host}:${httpServer.address().port}`);
    handleRequest(req, res, hosts, origins).catch((error) => {
      console.error('[linkedin-mcp] request failed:', error?.name ?? 'error');
      if (!res.headersSent) sendJson(res, 500, { jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
      else if (!res.writableEnded) res.end();
    });
  });

  async function handleRequest(req, res, hosts, origins) {
    if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'DELETE') {
      sendJson(res, 405, { error: 'method not allowed' }, { Allow: 'GET, POST, DELETE' });
      return;
    }
    if (!bearerMatches(req.headers.authorization, token)) {
      console.error('[linkedin-mcp] rejected request without a valid bearer token');
      sendJson(res, 401, { error: 'unauthorized' }, { 'WWW-Authenticate': 'Bearer realm="linkedin-mcp"' });
      return;
    }
    const sessionId = req.headers['mcp-session-id'];
    const session = sessionId ? sessions.get(sessionId) : undefined;
    if (sessionId && !session) {
      sendJson(res, 404, { jsonrpc: '2.0', error: { code: -32001, message: 'Session not found' }, id: null });
      return;
    }
    if (req.method === 'POST') {
      if (!session) {
        await makeSession(req, res, hosts, origins);
      } else {
        await session.transport.handleRequest(req, res);
      }
      return;
    }
    // GET and DELETE always require an active session.
    if (!session) {
      sendJson(res, 404, { jsonrpc: '2.0', error: { code: -32001, message: 'Session not found' }, id: null });
      return;
    }
    await session.transport.handleRequest(req, res);
  }

  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, LOOPBACK_HOST, () => {
      httpServer.removeListener('error', reject);
      resolve();
    });
  });
  const address = `${LOOPBACK_HOST}:${httpServer.address().port}`;
  console.error(`[linkedin-mcp] streamable http server listening on ${address}`);

  let closed = false;
  return {
    address,
    async close() {
      if (closed) return;
      closed = true;
      for (const entry of live) {
        live.delete(entry);
        sessions.delete(entry.id);
        try {
          await entry.transport.close();
        } catch {
          // session already gone
        }
        try {
          await entry.server.close();
        } catch {
          // server already disconnected
        }
      }
      httpServer.closeAllConnections?.();
      await new Promise((resolve) => {
        httpServer.close(resolve);
      });
    },
  };
}

export async function startMcp({ operations, experimental = false, transport = 'stdio', port = 0, token } = {}) {
  if (operations === null || typeof operations !== 'object') {
    throw new TypeError('operations is required and must be an object');
  }
  if (transport === 'http' || transport === 'streamable-http') {
    return startHttp({ operations, experimental, port, token });
  }
  if (transport !== 'stdio') {
    throw new TypeError(`transport must be "stdio" or "streamable-http" (alias "http"), got ${JSON.stringify(transport)}`);
  }
  const lifecycle = startStdio({ operations, experimental });
  await lifecycle.start();
  return lifecycle;
}
