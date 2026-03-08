#!/usr/bin/env node
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './server.js';

const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN ?? '';
if (!MCP_AUTH_TOKEN) {
  console.warn('WARNING: MCP_AUTH_TOKEN is not set. All /mcp requests will be rejected.');
}

// ── Session store ──────────────────────────────────────────────────────────────

const MAX_SESSIONS = 100;
const SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  lastSeen: number;
}

const sessions = new Map<string, SessionEntry>();

// Periodically evict expired sessions
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of sessions) {
    if (now - entry.lastSeen > SESSION_TTL_MS) {
      sessions.delete(id);
      console.log(`[session] expired: ${id} (total: ${sessions.size})`);
    }
  }
}, 60_000).unref();

// ── Helpers ────────────────────────────────────────────────────────────────────

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(payload);
}

function safeCompare(a: string, b: string): boolean {
  try {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

// ── Request handler ────────────────────────────────────────────────────────────

const MAX_BODY_BYTES = 1024 * 1024; // 1 MB

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const path = url.pathname;

  // Health endpoint — no auth, no body
  if (path === '/health') {
    sendJson(res, 200, { status: 'ok', service: 'google-maps-mcp' });
    return;
  }

  // Only handle /mcp
  if (path !== '/mcp') {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  // Body size guard
  const contentLength = parseInt(req.headers['content-length'] ?? '0', 10);
  if (contentLength > MAX_BODY_BYTES) {
    req.resume();
    sendJson(res, 413, { error: 'Request too large' });
    return;
  }

  // Auth check — constant-time comparison to prevent timing attacks
  const rawApiKey = req.headers['x-api-key'];
  const apiKey = Array.isArray(rawApiKey) ? rawApiKey[0] : rawApiKey;
  if (!apiKey || !safeCompare(apiKey, MCP_AUTH_TOKEN)) {
    req.resume(); // drain so socket stays clean
    sendJson(res, 401, { error: 'Unauthorized' });
    return;
  }

  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  // Resume existing session — update lastSeen, let the SDK read the body stream
  if (sessionId && sessions.has(sessionId)) {
    const entry = sessions.get(sessionId)!;
    entry.lastSeen = Date.now();
    await entry.transport.handleRequest(req, res);
    return;
  }

  // Enforce session cap
  if (sessions.size >= MAX_SESSIONS) {
    req.resume();
    sendJson(res, 503, { error: 'Too many sessions' });
    return;
  }

  // New session
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => {
      sessions.set(id, { transport, lastSeen: Date.now() });
      console.log(`[session] initialized: ${id} (total: ${sessions.size})`);
    },
  });

  transport.onclose = () => {
    for (const [id, entry] of sessions) {
      if (entry.transport === transport) {
        sessions.delete(id);
        console.log(`[session] closed: ${id} (total: ${sessions.size})`);
        break;
      }
    }
  };

  const server = createMcpServer();
  await server.connect(transport);
  await transport.handleRequest(req, res);
}

// ── HTTP server ────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  try {
    await handleRequest(req, res);
  } catch (err) {
    console.error('[server] unhandled error:', err);
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'Internal server error' });
    }
  }
});

// Tolerate slightly non-strict HTTP from Docker's userspace proxy
server.on('clientError', (err, socket) => {
  console.error('[clientError]', (err as NodeJS.ErrnoException).code, err.message);
  if (socket.writable) {
    socket.end('HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n');
  }
});

const PORT = parseInt(process.env.PORT ?? '3003', 10);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`google-maps-mcp listening on port ${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/health`);
  console.log(`  MCP:    http://localhost:${PORT}/mcp`);
});
