import express, { type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './server.js';

const app = express();
app.use(express.json());

// ── Auth middleware ────────────────────────────────────────────────────────────

const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN ?? '';
if (!MCP_AUTH_TOKEN) {
  console.warn('WARNING: MCP_AUTH_TOKEN is not set. All /mcp requests will be rejected.');
}

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-api-key'];
  if (!key || key !== MCP_AUTH_TOKEN) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

// ── Health endpoint (no auth) ──────────────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'google-maps-mcp' });
});

// ── MCP session store ──────────────────────────────────────────────────────────

const sessions = new Map<string, StreamableHTTPServerTransport>();

// ── MCP endpoint ───────────────────────────────────────────────────────────────

app.all('/mcp', requireAuth, async (req: Request, res: Response) => {
  try {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // Resume existing session
    if (sessionId && sessions.has(sessionId)) {
      const transport = sessions.get(sessionId)!;
      await transport.handleRequest(req, res, req.body as Record<string, unknown>);
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
      // Remove from session map when transport closes
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
    await transport.handleRequest(req, res, req.body as Record<string, unknown>);
  } catch (err) {
    console.error('[mcp] unhandled error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// ── Start ──────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '3003', 10);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`google-maps-mcp listening on port ${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/health`);
  console.log(`  MCP:    http://localhost:${PORT}/mcp`);
});
