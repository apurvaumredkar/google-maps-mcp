import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './server.js';

const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN ?? '';
if (!MCP_AUTH_TOKEN) {
  console.warn('WARNING: MCP_AUTH_TOKEN is not set. All /mcp requests will be rejected.');
}

// ── Session store ──────────────────────────────────────────────────────────────

const sessions = new Map<string, StreamableHTTPServerTransport>();

// ── Helpers ────────────────────────────────────────────────────────────────────

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(payload);
}

// ── Request handler ────────────────────────────────────────────────────────────

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

  // Auth check (header only — body stream untouched)
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== MCP_AUTH_TOKEN) {
    req.resume(); // drain so socket stays clean
    sendJson(res, 401, { error: 'Unauthorized' });
    return;
  }

  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  // Resume existing session — let the SDK read the body stream
  if (sessionId && sessions.has(sessionId)) {
    const transport = sessions.get(sessionId)!;
    await transport.handleRequest(req, res);
    return;
  }

  // New session
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => {
      sessions.set(id, transport);
      console.log(`[session] initialized: ${id} (total: ${sessions.size})`);
    },
  });

  transport.onclose = () => {
    for (const [id, t] of sessions) {
      if (t === transport) {
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
