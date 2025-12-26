#!/usr/bin/env node
/**
 * ekkOS™ Memory MCP Server (API-Based)
 *
 * SECURE VERSION - Uses only EKKOS_API_KEY for authentication
 * NO direct database access - all operations go through mcp.ekkos.dev API
 *
 * This is the portable, user-safe version that:
 * - Only requires user's personal API key (no infrastructure secrets)
 * - All database operations handled server-side
 * - API keys are scoped per-user and can be revoked
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    Tool,
} from '@modelcontextprotocol/sdk/types.js';
import https from 'https';

// Configuration - ONLY requires user's API key
const EKKOS_API_KEY = process.env.EKKOS_API_KEY || '';
const EKKOS_USER_ID = process.env.EKKOS_USER_ID || '';
const MCP_API_URL = process.env.EKKOS_API_URL || 'https://mcp.ekkos.dev';

// Validate API key is present
if (!EKKOS_API_KEY) {
  console.error('[MCP:ekkos-memory] ERROR: EKKOS_API_KEY environment variable is required');
  console.error('[MCP:ekkos-memory] Get your API key from: https://platform.ekkos.dev/settings/api-keys');
  console.error('[MCP:ekkos-memory] Or authenticate via the ekkOS Connect extension');
  process.exit(1);
}

// Debug: Log configuration on startup (to stderr so it doesn't interfere with MCP protocol)
console.error(`[MCP:ekkos-memory] Using API-based authentication (secure mode)`);
console.error(`[MCP:ekkos-memory] API URL: ${MCP_API_URL}`);
console.error(`[MCP:ekkos-memory] API Key: ${EKKOS_API_KEY ? 'set (' + EKKOS_API_KEY.length + ' chars)' : 'NOT SET'}`);
console.error(`[MCP:ekkos-memory] User ID: ${EKKOS_USER_ID || 'NOT SET'}`);

// Helper: Make authenticated API request
async function apiRequest(endpoint: string, options: {
  method?: string;
  body?: any;
} = {}): Promise<any> {
  const url = new URL(`${MCP_API_URL}${endpoint}`);

  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${EKKOS_API_KEY}`,
        ...(EKKOS_USER_ID ? { 'X-User-Id': EKKOS_USER_ID } : {}),
      },
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        } else {
          console.error(`[MCP:api] ERROR: ${res.statusCode} ${data.substring(0, 500)}`);
          reject(new Error(`API error: ${res.statusCode} - ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', (error: any) => {
      console.error(`[MCP:api] NETWORK ERROR: ${error.message}`);
      reject(new Error(`Network error: ${error.message}`));
    });

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

// Fetch available tools from API
async function fetchTools(): Promise<Tool[]> {
  try {
    const response = await apiRequest('/api/v1/mcp/tools');
    return response.tools || [];
  } catch (error) {
    console.error('[MCP:ekkos-memory] Failed to fetch tools:', error);
    // Return minimal fallback tools
    return [
      {
        name: 'ekkOS_Search',
        description: 'Search ekkOS memory (API connection failed - limited functionality)',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
          },
          required: ['query'],
        },
      },
    ];
  }
}

// Call a tool via API
async function callTool(name: string, args: any): Promise<any> {
  try {
    const response = await apiRequest('/api/v1/mcp/call', {
      method: 'POST',
      body: {
        tool: name,
        arguments: args,
        user_id: EKKOS_USER_ID,
      },
    });
    return response;
  } catch (error: any) {
    console.error(`[MCP:ekkos-memory] Tool call failed: ${name}`, error);
    throw error;
  }
}

// Create MCP server
const server = new Server(
  {
    name: 'ekkos-memory',
    version: '2.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Cache tools to avoid repeated API calls
let toolsCache: Tool[] | null = null;
let toolsCacheTime = 0;
const TOOLS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  // Use cached tools if fresh
  if (toolsCache && Date.now() - toolsCacheTime < TOOLS_CACHE_TTL) {
    return { tools: toolsCache };
  }

  // Fetch tools from API
  const tools = await fetchTools();
  toolsCache = tools;
  toolsCacheTime = Date.now();

  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  console.error(`[MCP:ekkos-memory] Tool call: ${name}`);

  try {
    const result = await callTool(name, args);

    // Format response for MCP
    return {
      content: [
        {
          type: 'text',
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  console.error('[MCP:ekkos-memory] Starting ekkOS Memory MCP Server (API mode)...');

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[MCP:ekkos-memory] Server connected and ready');
}

main().catch((error) => {
  console.error('[MCP:ekkos-memory] Fatal error:', error);
  process.exit(1);
});
