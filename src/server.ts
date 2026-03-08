import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMapsTools } from './tools/maps.js';
import { registerRoutesTools } from './tools/routes.js';
import { registerPlacesTools } from './tools/places.js';

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'google-maps-mcp',
    version: '1.0.0',
  });

  registerMapsTools(server);
  registerRoutesTools(server);
  registerPlacesTools(server);

  return server;
}
