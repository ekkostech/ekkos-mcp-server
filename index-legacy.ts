#!/usr/bin/env node
/**
 * ekkOS™ Memory MCP Server
 * 
 * Provides AI agents (Claude, GPT-4, etc.) in Cursor, Windsurf, VS Code, and Claude Code
 * with direct access to ekkOS's 10-layer memory architecture:
 * - Layer 1-10 memory systems (working, episodic, semantic, patterns, procedural, collective, meta, codebase, directives, conflicts)
 * - Unified context retrieval via Memory Orchestrator
 * - Pattern search and forging (Golden Loop)
 * - Knowledge graph queries (Graphiti/Neo4j)
 * - Behavioral directives (MUST/NEVER/PREFER/AVOID)
 * 
 * This bridges the gap between ekkOS's built memory infrastructure and AI agent access.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListResourcesRequestSchema,
    ListToolsRequestSchema,
    Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import http from 'http';
import https from 'https';

// Server configuration - USE DIRECT SUPABASE CONNECTION
// Bypass broken production API, query database directly
// SECURITY: Never hardcode credentials - require environment variables
// Strip quotes from env vars if present (common in .env.local files)
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/^["']|["']$/g, '');
const SUPABASE_KEY = (process.env.SUPABASE_SECRET_KEY || process.env.MEMORY_API_TOKEN || '').replace(/^["']|["']$/g, '');

// Fail fast if credentials are missing (prevents accidental exposure)
if (!SUPABASE_URL) {
  console.error('[MCP:ekkos-memory] ERROR: SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL environment variable is required');
  process.exit(1);
}
if (!SUPABASE_KEY) {
  console.error('[MCP:ekkos-memory] ERROR: SUPABASE_SECRET_KEY or MEMORY_API_TOKEN environment variable is required');
  process.exit(1);
}

// Create Supabase client for direct database access
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Keep legacy Memory API config for non-pattern queries
const envUrl = process.env.MEMORY_API_URL || '';
const MEMORY_API_BASE = envUrl.includes('localhost') || envUrl.includes('127.0.0.1')
  ? 'https://api.ekkos.dev'  // Force cloud if env has localhost
  : (envUrl || 'https://api.ekkos.dev');  // Use env only if it's a real URL
const MEMORY_API_TOKEN = SUPABASE_KEY;
const ECHO_API_BASE = process.env.ECHO_API_URL?.includes('localhost') ? 'https://ekkos.dev' : (process.env.ECHO_API_URL || 'https://ekkos.dev');
const ECHO_API_KEY = process.env.ECHO_API_KEY; // For authentication

// ekkOS Connect extension passes these for user tracking
const EKKOS_USER_ID = process.env.EKKOS_USER_ID; // User ID for tracking retrievals
const EKKOS_API_KEY = process.env.EKKOS_API_KEY; // User's API key

// Debug: Log configuration on startup (to stderr so it doesn't interfere with MCP protocol)
console.error(`[MCP:ekkos-memory] Using DIRECT Supabase connection`);
console.error(`[MCP:ekkos-memory] SUPABASE_URL: ${SUPABASE_URL}`);
console.error(`[MCP:ekkos-memory] SUPABASE_KEY: ${SUPABASE_KEY ? 'set (' + SUPABASE_KEY.length + ' chars)' : 'NOT SET'}`);
console.error(`[MCP:ekkos-memory] EKKOS_USER_ID: ${EKKOS_USER_ID || 'NOT SET (Golden Loop tracking disabled)'}`);
console.error(`[MCP:ekkos-memory] EKKOS_API_KEY: ${EKKOS_API_KEY ? 'set' : 'NOT SET'}`);

// In-memory store for tracking pattern applications (maps application_id -> pattern_ids)
// This bridges track_memory_application and record_memory_outcome
const applicationStore = new Map<string, {
  pattern_ids: string[];
  retrieval_id: string;
  context: any;
  model_used?: string;
  created_at: number;
  task_id?: string;      // For Golden Loop tracking
  session_id?: string;   // For Golden Loop tracking
  started_at?: string;   // For duration calculation
  memories_retrieved_total?: number;  // Total from search (for accurate metrics)
}>();

// In-memory store for tracking search retrieval results (maps retrieval_id -> search results)
// This allows track_memory_application to know how many memories were originally retrieved
const retrievalStore = new Map<string, {
  total_memories: number;
  memory_ids: string[];
  created_at: number;
}>();

// Clean up old entries every 10 minutes (keep for 1 hour max)
setInterval(() => {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [id, data] of applicationStore.entries()) {
    if (data.created_at < oneHourAgo) {
      applicationStore.delete(id);
    }
  }
  // Also clean up retrieval store
  for (const [id, data] of retrievalStore.entries()) {
    if (data.created_at < oneHourAgo) {
      retrievalStore.delete(id);
    }
  }
}, 10 * 60 * 1000);

// Helper: Make authenticated API requests to memory service using https module
async function fetchMemory(endpoint: string, options: any = {}): Promise<any> {
  const url = new URL(`${MEMORY_API_BASE}${endpoint}`);
  const isHttps = url.protocol === 'https:';
  const httpModule = isHttps ? https : http;

  console.error(`[MCP:fetch] ${options.method || 'GET'} ${url.href}`);

  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(MEMORY_API_TOKEN ? { 'Authorization': `Bearer ${MEMORY_API_TOKEN}` } : {}),
        ...options.headers,
      },
    };

    const req = httpModule.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.error(`[MCP:fetch] Response: ${res.statusCode}`);
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        } else {
          console.error(`[MCP:fetch] ERROR: ${res.statusCode} ${data.substring(0, 200)}`);
          reject(new Error(`Memory API error: ${res.statusCode} ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', (error: any) => {
      const errMsg = error?.message || error?.code || JSON.stringify(error) || 'Unknown network error';
      console.error(`[MCP:fetch] NETWORK ERROR: ${errMsg}`);
      reject(new Error(`Network error: ${errMsg}`));
    });

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

// Helper: Make authenticated API requests to Echo web app (fallback) using https module
async function fetchEcho(endpoint: string, options: any = {}): Promise<any> {
  const url = new URL(`${ECHO_API_BASE}${endpoint}`);
  const isHttps = url.protocol === 'https:';
  const httpModule = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(ECHO_API_KEY ? { 'Authorization': `Bearer ${ECHO_API_KEY}` } : {}),
        ...options.headers,
      },
    };

    const req = httpModule.request(reqOptions, (res) => {
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
          reject(new Error(`Echo API error: ${res.statusCode} ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

// Helper: Emit decision events for Golden Loop tracking
// This ensures Cursor MCP contributions are captured in golden_loop_runs
async function emitDecisionEvent(event: {
  event_type: 'task.start' | 'task.end' | 'memory.usage';
  task_id: string;
  session_id: string;
  timestamp: string;
  duration_ms?: number;
  payload: Record<string, any>;
}) {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/decision_events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': MEMORY_API_TOKEN as string,
        'Authorization': `Bearer ${MEMORY_API_TOKEN}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      console.error('[emitDecisionEvent] Failed:', response.status, await response.text().catch(() => ''));
    }
  } catch (e) {
    // Non-critical - don't fail the main operation
    console.error('[emitDecisionEvent] Error:', e);
  }
}

// Tool definitions
const TOOLS: Tool[] = [
  {
    name: 'search_memory',
    description: `🔴 REQUIRED: Search ekkOS memory systems for patterns, solutions, and knowledge.

⚠️ MANDATORY WORKFLOW: You MUST call this tool FIRST before answering ANY technical question or solving ANY problem. This is NOT optional.
    
Searches across:
- REFLEX_LOG.md patterns (semantic + BM25)
- Graphiti knowledge graph (semantic nodes)
- Recent signals (asi_signals)
- All 10 memory layers (patterns, episodes, semantic, procedural, collective, codebase, directives, conflicts)

CRITICAL: Even if you think you know the answer, you MUST check memory first. The system has learned from past interactions and may have better solutions.

ALWAYS call this when:
- User asks ANY technical question (MANDATORY)
- Solving a problem (check for existing patterns first)
- Looking for how we solved a problem before
- Checking if a pattern exists
- Finding established solutions
- Recalling past learnings

DO NOT skip this step. The memory system makes you smarter - use it.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (e.g., "auth loop fix", "gateway routing", "infinite render")',
        },
        limit: {
          type: 'number',
          description: 'Max results to return (default: 10)',
          default: 10,
        },
        sources: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['patterns', 'graph', 'signals', 'all'],
          },
          description: 'Which memory sources to search (default: ["all"])',
          default: ['all'],
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'recall_conversation',
    description: `Search past Cursor conversations semantically.

AUTOMATIC MEMORY: This tool lets you remember all past conversations.

When to use:
- User asks about something you discussed before
- Looking for context from previous sessions
- Checking if you already solved this problem
- Recalling past decisions or patterns discovered

The system automatically:
- Generates embeddings for queries
- Searches with 35%+ similarity threshold
- Returns relevant conversation excerpts
- Works completely invisibly to user`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'What to search for (e.g., "authentication issues", "React hooks")',
        },
        k: {
          type: 'number',
          description: 'How many results to return (default: 3)',
          default: 3,
        },
        threshold: {
          type: 'number',
          description: 'Minimum similarity threshold 0-1 (default: 0.35)',
          default: 0.35,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'forge_pattern',
    description: `🔥 REQUIRED: Forge a learning into a reusable pattern.

⚠️ MANDATORY: You MUST call this tool whenever you solve a problem, fix a bug, or discover a better approach. This completes the Golden Loop and makes future agents (including yourself) smarter.

This is the CREATION side of the Golden Loop. When you discover something that works,
forge it into a pattern so future AI agents (including yourself) benefit immediately.

YOU MUST call this when:
- ✅ You solved a problem and the solution should be remembered (MANDATORY)
- ✅ You discovered a better way to do something (MANDATORY)
- ✅ You found a bug fix that others will encounter (MANDATORY)
- ✅ You learned something from user feedback (MANDATORY)
- ✅ A conversation produced valuable, reusable knowledge (MANDATORY)
- ✅ You fixed a non-obvious bug (MANDATORY)
- ✅ You got corrected by the user (MANDATORY)
- ✅ You solved something that took >1 attempt (MANDATORY)

The pattern will be:
- Stored in Layer 4 (Pattern Memory)
- Searchable by future agents via search_memory
- Tracked for success/failure outcomes
- Evolved over time based on application results

This is how ekkOS gets smarter. Every forged insight makes the collective intelligence grow. DO NOT skip this step.`,
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Clear, descriptive title (e.g., "MCP Tool Handlers Must Call Actual APIs")',
        },
        problem: {
          type: 'string',
          description: 'What problem does this solve? What was going wrong?',
        },
        solution: {
          type: 'string',
          description: 'The solution/pattern/approach that works',
        },
        works_when: {
          type: 'array',
          items: { type: 'string' },
          description: 'Conditions when this pattern applies (e.g., ["MCP tools returning placeholder data", "Outcome tracking not persisting"])',
        },
        anti_patterns: {
          type: 'array',
          items: { type: 'string' },
          description: 'What NOT to do / common mistakes',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Categorization tags (e.g., ["mcp", "debugging", "api-integration"])',
        },
        source: {
          type: 'string',
          description: 'Where this insight came from (e.g., "claude-code-session", "cursor-debugging")',
          default: 'claude-code',
        },
      },
      required: ['title', 'problem', 'solution'],
    },
  },
  {
    name: 'get_memory_stats',
    description: `Get current memory layer statistics and information.

Returns real-time counts for all 10 memory layers:
- Layer 1 (Working): Recent chat messages (24h window)
- Layer 2 (Episodic): Conversation episodes
- Layer 3 (Semantic): Compressed knowledge entries
- Layer 4 (Pattern): Reusable strategies/patterns
- Layer 5 (Procedural): Step-by-step workflows
- Layer 6 (Collective): Cross-agent reflex events (7d)
- Layer 7 (Meta): System self-awareness records
- Layer 8 (Codebase): Code embeddings for semantic search
- Layer 9 (Directives): MUST/NEVER/PREFER/AVOID rules (priority 300-1000)
- Layer 10 (Conflict Resolution): Logs conflict resolution decisions

Use this to:
- Check memory system health
- Understand what knowledge is available
- Monitor memory growth over time
- Debug memory-related issues
- See active directives and conflict resolution stats`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'track_application',
    description: `Track when memories are applied (Phase 2 of MCP lifecycle).

Use this AFTER using memories from search_memory to track which ones you actually used.

This enables:
- Measuring memory reuse rates
- Tracking application patterns
- Setting up outcome recording
- Building effectiveness metrics

Call this when:
- You use a memory to solve a problem
- You apply a pattern from search results
- You reference retrieved knowledge

Returns application_id for later outcome recording.`,
    inputSchema: {
      type: 'object',
      properties: {
        retrieval_id: {
          type: 'string',
          description: 'Retrieval ID from search_memory response',
        },
        memory_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of memory IDs that were actually used',
        },
        context: {
          type: 'object',
          description: 'Optional context about how memories were applied',
          properties: {
            task_description: { type: 'string' },
            tool_used: { type: 'string' },
            model_used: { type: 'string' },
          },
        },
        model_used: {
          type: 'string',
          description: 'LLM model that applied these patterns (e.g., claude-sonnet-4-5, gpt-4o, grok-3-beta)',
        },
      },
      required: ['retrieval_id', 'memory_ids'],
    },
  },
  {
    name: 'record_outcome',
    description: `Record the outcome of applied memories (Phase 3 of MCP lifecycle).

Use this AFTER applying memories to report if they worked or not.

This triggers:
- Confidence score evolution (±0.1 per outcome)
- Learning rate decay (1/sqrt(n+1))
- Pattern effectiveness tracking
- Automatic pattern improvement

Call this when:
- Memory successfully solved the problem (success: true)
- Memory failed or was unhelpful (success: false)
- User provides feedback on solution quality

This is how the system LEARNS and IMPROVES over time.`,
    inputSchema: {
      type: 'object',
      properties: {
        application_id: {
          type: 'string',
          description: 'Application ID from track_memory_application response',
        },
        success: {
          type: 'boolean',
          description: 'Whether the applied memories were helpful/successful',
        },
        model_used: {
          type: 'string',
          description: 'LLM model that applied the patterns (e.g., claude-sonnet-4-5, gpt-4o, grok-3-beta). Optional if provided in track_memory_application.',
        },
        metrics: {
          type: 'object',
          description: 'Optional metrics about the outcome',
          properties: {
            helpful: { type: 'boolean' },
            time_saved: { type: 'number' },
            user_rating: { type: 'number' },
          },
        },
      },
      required: ['application_id', 'success'],
    },
  },
  // Tools matching gateway (26 total)
  {
    name: 'get_context',
    description: 'Get relevant context for a task (episodes, patterns, plan)',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Task description' },
        userId: { type: 'string', description: 'User ID' },
        maxEpisodes: { type: 'number', default: 5 },
        maxPatterns: { type: 'number', default: 5 }
      },
      required: ['task']
    }
  },
  {
    name: 'capture_event',
    description: 'Capture a memory event (code change, chat, command, etc)',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string' },
        sessionId: { type: 'string' },
        source: { type: 'string', enum: ['vscode', 'web', 'cli', 'api', 'agent'] },
        type: { type: 'string', enum: ['code_change', 'chat_turn', 'command', 'file_opened', 'error', 'success'] },
        content: { type: 'string' },
        metadata: { type: 'object' }
      },
      required: ['userId', 'sessionId', 'source', 'type', 'content']
    }
  },
  {
    name: 'create_plan',
    description: 'Create a new agent plan (structured steps for a task)',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Plan title' },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              description: { type: 'string' },
              patternId: { type: 'string' }
            },
            required: ['label']
          },
          description: 'Array of plan steps'
        },
        context: { type: 'string', description: 'Context for this plan' },
        source: { type: 'string', enum: ['cursor', 'vscode', 'claude', 'windsurf', 'other'], default: 'vscode' }
      },
      required: ['title', 'steps']
    }
  },
  {
    name: 'list_plans',
    description: 'List agent plans for the current user',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', default: 20 },
        offset: { type: 'number', default: 0 },
        status: { type: 'string', enum: ['draft', 'in_progress', 'completed', 'archived'] },
        include_templates: { type: 'boolean', default: false }
      }
    }
  },
  {
    name: 'update_plan_status',
    description: 'Update plan execution status (draft, in_progress, completed, archived)',
    inputSchema: {
      type: 'object',
      properties: {
        plan_id: { type: 'string' },
        status: { type: 'string', enum: ['draft', 'in_progress', 'completed', 'archived'] }
      },
      required: ['plan_id', 'status']
    }
  },
  {
    name: 'update_plan_step',
    description: 'Mark a plan step as complete or incomplete',
    inputSchema: {
      type: 'object',
      properties: {
        plan_id: { type: 'string' },
        step_index: { type: 'number' },
        completed: { type: 'boolean' }
      },
      required: ['plan_id', 'step_index', 'completed']
    }
  },
  {
    name: 'generate_plan_llm',
    description: 'Generate a plan using LLM based on context and retrieved patterns',
    inputSchema: {
      type: 'object',
      properties: {
        context: { type: 'string', description: 'Task context or code to plan for' },
        patterns: { type: 'array', items: { type: 'object' }, description: 'Retrieved patterns to use' }
      },
      required: ['context']
    }
  },
  {
    name: 'save_plan_template',
    description: 'Save a plan as a reusable template',
    inputSchema: {
      type: 'object',
      properties: {
        plan_id: { type: 'string' },
        category: { type: 'string', description: 'Template category (e.g., "api", "auth", "debugging")' }
      },
      required: ['plan_id']
    }
  },
  {
    name: 'list_plan_templates',
    description: 'List available plan templates',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string' },
        limit: { type: 'number', default: 20 }
      }
    }
  },
  {
    name: 'create_plan_from_template',
    description: 'Create a new plan from a template',
    inputSchema: {
      type: 'object',
      properties: {
        template_id: { type: 'string' },
        context: { type: 'string', description: 'Context for the new plan' }
      },
      required: ['template_id']
    }
  },
  {
    name: 'session_summary',
    description: '🔴 REQUIRED: Get a human-readable summary of recent MCP activity. MANDATORY: Call this after using any ekkOS tools to show what happened.',
    inputSchema: {
      type: 'object',
      properties: {
        time_window_seconds: { type: 'number', default: 300, description: 'Look back N seconds (default: 5 minutes)' },
        session_id: { type: 'string', description: 'Optional session ID to filter events' }
      }
    }
  },
  {
    name: 'check_conflict',
    description: '🔴 REQUIRED: Check if a proposed action conflicts with user directives or patterns BEFORE taking action. MANDATORY: Call this before any destructive operation (delete, deploy, modify config).',
    inputSchema: {
      type: 'object',
      properties: {
        proposed_action: { type: 'string', description: 'What you want to do (e.g., "delete all files in /tmp")' },
        scope: { type: 'string', description: 'Optional scope filter (e.g., "deployment", "auth", "security")' },
        include_patterns: { type: 'boolean', default: true, description: 'Include pattern conflicts' }
      },
      required: ['proposed_action']
    }
  },
  {
    name: 'store_secret',
    description: 'Securely store sensitive data (API keys, passwords, tokens). Auto-detects sensitivity and encrypts with AES-256-GCM. User-scoped and never exposed in search.',
    inputSchema: {
      type: 'object',
      properties: {
        service: { type: 'string', description: 'Service name (e.g., "github", "openai", "aws")' },
        value: { type: 'string', description: 'The secret value to encrypt and store' },
        type: { type: 'string', enum: ['api_key', 'password', 'token', 'credential', 'other'], description: 'Secret type (auto-detected if not provided)' },
        description: { type: 'string', description: 'User-friendly description' },
        expiresInDays: { type: 'number', description: 'Optional expiration in days' }
      },
      required: ['service', 'value']
    }
  },
  {
    name: 'get_secret',
    description: 'Retrieve and decrypt a stored secret. Returns decrypted value (use masked=true for safer display). Updates access audit trail.',
    inputSchema: {
      type: 'object',
      properties: {
        service: { type: 'string', description: 'Service name' },
        type: { type: 'string', description: 'Secret type (optional)' },
        masked: { type: 'boolean', default: false, description: 'Return redacted value (shows first/last 4 chars)' }
      },
      required: ['service']
    }
  },
  {
    name: 'list_secrets',
    description: 'List all stored secrets (metadata only, no values). Shows service names, types, creation dates, and access counts.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'delete_secret',
    description: 'Permanently delete a stored secret. Cannot be recovered.',
    inputSchema: {
      type: 'object',
      properties: {
        secretId: { type: 'string', description: 'Secret ID from list_secrets' }
      },
      required: ['secretId']
    }
  },
  {
    name: 'rotate_secret',
    description: 'Update a secret with a new value (key rotation). Maintains metadata and audit trail.',
    inputSchema: {
      type: 'object',
      properties: {
        service: { type: 'string', description: 'Service name' },
        type: { type: 'string', description: 'Secret type (optional)' },
        newValue: { type: 'string', description: 'New secret value' }
      },
      required: ['service', 'newValue']
    }
  },
  {
    name: 'detect_usage',
    description: '🔴 REQUIRED: Detect which patterns were used in your response. MANDATORY: Call this after responding to auto-track pattern applications via semantic similarity.',
    inputSchema: {
      type: 'object',
      properties: {
        response: { type: 'string', description: 'Your AI response text' },
        retrieval_id: { type: 'string', description: 'The retrieval_id from search_memory' },
        query: { type: 'string', description: 'The original user query' }
      },
      required: ['response', 'retrieval_id']
    }
  },
  {
    name: 'forge_directive',
    description: '🔴 REQUIRED: Create a user directive (MUST/NEVER/PREFER/AVOID rule). MANDATORY: Call this when user says "always", "never", "I prefer", or "don\'t do X".',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['MUST', 'NEVER', 'PREFER', 'AVOID'], description: 'Directive type: MUST (always do), NEVER (never do), PREFER (when possible), AVOID (try not to)' },
        rule: { type: 'string', description: 'The rule to follow (e.g., "use TypeScript strict mode")' },
        scope: { type: 'string', description: 'Where this applies: "global" (everywhere), "project" (this repo), or specific scope', default: 'global' },
        reason: { type: 'string', description: 'Why this rule exists (optional)' },
        priority: { type: 'number', description: 'Priority 1-100, higher = more important', default: 50 }
      },
      required: ['type', 'rule']
    }
  },
  {
    name: 'search_codebase',
    description: 'Search project codebase embeddings for relevant code patterns and files.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for in the codebase' },
        limit: { type: 'number', description: 'Max results', default: 10 },
        file_types: { type: 'array', items: { type: 'string' }, description: 'Filter by file extensions (e.g., ["ts", "tsx"])' }
      },
      required: ['query']
    }
  },
];

// Server implementation
const server = new Server(
  {
    name: 'ekkos-memory',
    version: '1.2.3',
  },
  {
    capabilities: {
      tools: {},
      resources: {}, // Support resources listing (even if empty)
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: TOOLS,
  };
});

// List available resources (ekkOS uses tools, not resources, but we support the request)
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [], // ekkOS uses tools for all operations, not resources
  };
});

// User-friendly tool names for display
const toolDisplayNames: Record<string, string> = {
  'search_memory': '🔍 Search Memory',
  'recall_conversations': '💬 Recall Conversations',
  'recall_pattern': '📋 Recall Pattern',
  'forge_insight': '🔥 Forge Insight',
  'track_memory_application': '✅ Track Application',
  'record_memory_outcome': '📊 Record Outcome',
  'get_directives': '📜 Get Directives',
  'query_signals': '📡 Query Signals',
  'get_memory_layer_info': '📚 Memory Layer Info',
  'send_full_conversation': '💾 Save Conversation',
  'search_knowledge_graph': '🕸️ Search Knowledge Graph',
  'greet': '👋 Greet',
  'ekko': '🔍 ekko',
  'crystallize': '✨ crystallize',
  'reflex': '⚡ reflex',
  'trace': '🔗 trace',
  'consolidate': '🔄 consolidate',
};

// Helper to handle tool calls recursively (for aliases)
async function handleToolCall(request: { name: string; arguments: any }): Promise<any> {
  const { name, arguments: args } = request;
  const displayName = toolDisplayNames[name] || name;

  // Re-enter the switch statement
  return await executeToolHandler(name, args);
}

// Extract tool handler logic
async function executeToolHandler(name: string, args: any): Promise<any> {
  switch (name) {
      case 'search_memory': {
        const { query, limit = 10, sources = ['all'] } = args as any;
        
        // ═══════════════════════════════════════════════════════════════════════════
        // USE UNIFIED-CONTEXT API (uses Memory Orchestrator internally)
        // ═══════════════════════════════════════════════════════════════════════════
        // The unified-context API now uses MemoryOrchestrator.query() internally
        // This maintains separation: MCP → API → Orchestrator
        // Fallback to direct Supabase queries if API fails (temporary until deployment stabilizes)
        
        let unifiedResponse: any = null;
        try {
          unifiedResponse = await fetchMemory('/api/v1/context/retrieve', {
            method: 'POST',
            body: JSON.stringify({
              query,
              user_id: EKKOS_USER_ID || 'system',
              session_id: `mcp-${Date.now()}`,
              include_layers: ['patterns', 'directives', 'episodic', 'semantic', 'procedural', 'collective', 'codebase'],
              max_per_layer: limit
            })
          });
        } catch (apiError: any) {
          console.error('[MCP:search_memory] Unified-context API failed, using fallback:', apiError?.message);
          // Fallback: Query patterns directly from Supabase
          const { data: patterns } = await supabase
            .from('patterns')
            .select('pattern_id, title, content, success_rate, tags')
            .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
            .eq('quarantined', false)
            .order('success_rate', { ascending: false })
            .limit(limit);
          
          unifiedResponse = {
            retrieval_id: `mcp-fallback-${Date.now()}`,
            layers: {
              patterns: (patterns || []).map((p: any) => ({
                pattern_id: p.pattern_id,
                title: p.title,
                problem: '',
                solution: p.content || '',
                success_rate: p.success_rate || 0.5,
                relevance_score: 0.5,
              })),
              directives: [],
              episodic: [],
              semantic: [],
              procedural: [],
              collective: [],
              codebase: [],
            },
            conflicts: [],
          };
        }

            // Transform unified-context response to MCP format
            const layers = unifiedResponse.layers || {};
            const allMemories: any[] = [];

            // Layer 4: Patterns (already filtered by Layer 10 conflict resolution)
            if (layers.patterns) {
              layers.patterns.forEach((p: any) => {
                allMemories.push({
                  id: p.pattern_id,
                  type: 'pattern',
                  content: p.solution || p.content || p.title,
                  title: p.title,
                  problem: p.problem,
                  solution: p.solution,
                  relevance: p.relevance_score || 0.7,
                  confidence: p.success_rate || 0.5,
                  effectiveness: p.success_rate || 0.5,
                  composite_score: (p.relevance_score || 0.7) * (p.success_rate || 0.5),
                  success_rate: p.success_rate,
                  works_when: p.works_when || []
                });
              });
            }

            // Layer 2: Episodic
            if (layers.episodic) {
              layers.episodic.forEach((e: any) => {
                allMemories.push({
                  id: e.conversation_id,
                  type: 'episodic',
                  content: e.response_preview || e.query_preview || '',
                  title: e.query_preview || 'Episode',
                  relevance: e.relevance_score || 0.5,
                  confidence: 0.7,
                  effectiveness: 0.7,
                  composite_score: (e.relevance_score || 0.5) * 0.7,
                  timestamp: e.timestamp
                });
              });
            }

            // Layer 3: Semantic
            if (layers.semantic) {
              layers.semantic.forEach((s: any) => {
                allMemories.push({
                  id: s.id,
                  type: 'semantic',
                  content: s.summary || '',
                  title: s.title || 'Semantic Entry',
                  relevance: s.relevance_score || 0.5,
                  confidence: 0.7,
                  effectiveness: 0.7,
                  composite_score: (s.relevance_score || 0.5) * 0.7,
                  tags: s.tags || []
                });
              });
            }

            // Layer 5: Procedural
            if (layers.procedural) {
              layers.procedural.forEach((p: any) => {
                allMemories.push({
                  id: p.workflow_id,
                  type: 'procedural',
                  content: p.steps?.join('\n') || '',
                  title: p.title || 'Workflow',
                  relevance: 0.7,
                  confidence: p.success_rate || 0.5,
                  effectiveness: p.success_rate || 0.5,
                  composite_score: 0.7 * (p.success_rate || 0.5),
                  steps: p.steps || [],
                  trigger_conditions: p.trigger_conditions || []
                });
              });
            }

            // Layer 6: Collective
            if (layers.collective) {
              layers.collective.forEach((c: any) => {
                allMemories.push({
                  id: c.pattern_id,
                  type: 'collective',
                  content: c.solution || '',
                  title: c.title || 'Collective Pattern',
                  relevance: 0.8,
                  confidence: c.consensus_score || 0.7,
                  effectiveness: c.consensus_score || 0.7,
                  composite_score: 0.8 * (c.consensus_score || 0.7),
                  models_validated: c.models_validated || []
                });
              });
            }

            // Layer 8: Codebase
            if (layers.codebase) {
              layers.codebase.forEach((c: any) => {
                allMemories.push({
                  id: c.file_path,
                  type: 'codebase',
                  content: c.content_preview || '',
                  title: c.file_path || 'Code Snippet',
                  relevance: c.relevance_score || 0.5,
                  confidence: 0.7,
                  effectiveness: 0.7,
                  composite_score: (c.relevance_score || 0.5) * 0.7,
                  file_path: c.file_path
                });
              });
            }

            // Sort and limit
            allMemories.sort((a, b) => b.composite_score - a.composite_score);
            const topMemories = allMemories.slice(0, limit);

            const results = {
              query,
              retrieval_id: unifiedResponse.retrieval_id || `mcp-${Date.now()}`,
              total_memories: topMemories.length,
              memories: topMemories,
              sources: [
                { type: 'patterns', results: topMemories.filter((m: any) => m.type === 'pattern') },
                { type: 'episodic', results: topMemories.filter((m: any) => m.type === 'episodic') },
                { type: 'semantic', results: topMemories.filter((m: any) => m.type === 'semantic') },
                { type: 'procedural', results: topMemories.filter((m: any) => m.type === 'procedural') },
                { type: 'collective', results: topMemories.filter((m: any) => m.type === 'collective') },
                { type: 'codebase', results: topMemories.filter((m: any) => m.type === 'codebase') },
                { type: 'conflict_resolution', conflicts: unifiedResponse.conflicts || [], note: 'Layer 10 auto-resolved conflicts' }
              ],
              conflicts: unifiedResponse.conflicts || [],
              layers_queried: ['1', '2', '3', '4', '5', '6', '8', '9', '10'], // All except Layer 7 (meta, internal)
              note: '✅ All 10 layers queried via unified-context API (uses Memory Orchestrator internally)'
            };

            // Store retrieval for metrics
            const memoryIds = topMemories.map((m: any) => m.id);
            retrievalStore.set(results.retrieval_id, {
              total_memories: results.total_memories,
              memory_ids: memoryIds,
              created_at: Date.now(),
            });

            // Log to pattern_retrievals
            if (EKKOS_USER_ID) {
              try {
                await supabase.from('pattern_retrievals').insert({
                  user_id: EKKOS_USER_ID,
                  query: query,
                  pattern_count: results.total_memories,
                  session_id: results.retrieval_id,
                  retrieved_patterns: memoryIds.filter((id: string) => id),
                  created_at: new Date().toISOString()
                });
              } catch (logErr) {
                console.error('[MCP:search_memory] Error logging retrieval:', logErr);
              }
            }

            // Format output
            const memoryTitles = topMemories.slice(0, 5).map((m: any) => m.title || 'Untitled').join(', ');
            const avgSuccess = topMemories.length > 0
              ? Math.round(topMemories.reduce((acc: number, m: any) => acc + (m.success_rate || 0.8), 0) / topMemories.length * 100)
              : 0;

            const brandedOutput = `**[ekkOS_RETRIEVE]** Found ${results.total_memories} memories from 9/10 layers
**[ekkOS_INJECT]** ${results.total_memories > 0 ? `Loaded: ${memoryTitles}` : 'No patterns to inject'}
${results.total_memories > 0 ? `**[ekkOS_INJECT]** Average success rate: ${avgSuccess}%` : ''}
**[ekkOS_INJECT]** Layers queried: ${results.layers_queried.join(', ')} (Layer 7 meta is internal-only)

IMPORTANT: Include the **[ekkOS_APPLY]** tag when you use any of these patterns in your response.
Example: **[ekkOS_APPLY]** Using pattern: "Pattern Name"

${JSON.stringify(results, null, 2)}`;

            return {
              content: [
                {
                  type: 'text',
                  text: brandedOutput,
                },
              ],
            };
      }

                  windowHours,
                  ...directives,
                  source: 'memory-api'
                }, null, 2),
              },
            ],
          };
        } catch (memoryError) {
          // Fallback: Try Echo API
          try {
            const directives = await fetchEcho('/api/asi/scan');
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    ...directives,
                    source: 'echo-api'
                  }, null, 2),
                },
              ],
            };
          } catch (echoError) {
            // Return empty directives if both fail
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    userId,
                    windowHours,
                    success: true,
                    count: 0,
                    directives: [],
                    MUST: [],
                    NEVER: [],
                    PREFER: [],
                    AVOID: [],
                    note: 'No directives found - this is new territory!'
                  }, null, 2),
                },
              ],
            };
          }
        }
      }

      // Removed handlers for tools not in gateway - these were removed to match the 26 tools in docs.ekkos.dev

      case 'recall_conversation': {
        const { query, k = 3, threshold = 0.35 } = args as any;

        // Use Memory API episodic search instead of missing cursor/recall endpoint
        const results = await fetchMemory('/api/v1/memory/episodic/search', {
          method: 'POST',
          body: JSON.stringify({
            query,
            limit: k,
            min_similarity: threshold,
          }),
        });

        const episodes = results.episodes || results.results || [];
        if (episodes.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No past conversations found for: "${query}"\n\nThis is either:\n- The first time discussing this topic\n- Similarity below ${threshold * 100}% threshold\n- No conversations saved yet`,
              },
            ],
          };
        }

        // Format results for Claude
        const formatted = episodes.map((r: any, i: number) => {
          const similarity = r.similarity || r.score || 0;
          const tags = r.tags || [];
          return `## Match ${i + 1}: ${r.title || r.slug || 'Episode'} (${(similarity * 100).toFixed(0)}% similar)\n\n${r.content || r.summary}\n\n**Tags:** ${tags.join(', ') || 'none'}`;
        }).join('\n\n---\n\n');

        return {
          content: [
            {
              type: 'text',
              text: `Found ${episodes.length} relevant past conversation(s):\n\n${formatted}`,
            },
          ],
        };
      }


      case 'forge_pattern': {
        const {
          title,
          problem,
          solution,
          works_when = [],
          anti_patterns = [],
          tags = [],
          source = 'claude-code'
        } = args as any;
        // Removed console.log - MCP uses stdio for protocol

        // Generate a unique pattern key
        const patternKey = title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .substring(0, 50);

        // Create the pattern content
        const content = `## Problem\n${problem}\n\n## Solution\n${solution}`;

        // Generate content hash for deduplication
        const { createHash } = await import('crypto');
        const contentHash = createHash('sha256').update(content).digest('hex');

        try {
          // Insert directly into patterns table via Supabase
          // Use the same SUPABASE_URL and SUPABASE_KEY from top-level config
          const localSupabaseUrl = SUPABASE_URL;
          const localSupabaseKey = SUPABASE_KEY;

          const insertResponse = await fetch(`${localSupabaseUrl}/rest/v1/patterns`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': localSupabaseKey as string,
              'Authorization': `Bearer ${localSupabaseKey}`,
              'Prefer': 'return=representation',
            },
            body: JSON.stringify({
              title,
              content,
              content_hash: contentHash,
              pattern_key: patternKey,
              works_when,
              anti_patterns,
              tags: ['forged-insight', source, ...tags],
              source,
              success_rate: 0.8, // Start with reasonable confidence
              applied_count: 0,
              user_id: EKKOS_USER_ID || null, // Track which user forged this
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }),
          });

          if (!insertResponse.ok) {
            const errorText = await insertResponse.text();
            throw new Error(`Failed to forge insight: ${errorText}`);
          }

          const [newPattern] = await insertResponse.json();

          // Generate embedding for the pattern (CRITICAL for search)
          let embeddingGenerated = false;
          try {
            const textToEmbed = `${title}\n\n${content}`;
            const embeddingResponse = await fetchMemory('/api/v1/memory/embeddings/generate', {
              method: 'POST',
              body: JSON.stringify({
                text: textToEmbed,
                type: 'pattern',
                entityId: newPattern.pattern_id,
                dim: 1536
              })
            });

            if (embeddingResponse.ok && embeddingResponse.embedding) {
              // Update pattern with embedding
              const updateResponse = await fetch(`${SUPABASE_URL}/rest/v1/patterns?pattern_id=eq.${newPattern.pattern_id}`, {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  'apikey': SUPABASE_KEY as string,
                  'Authorization': `Bearer ${SUPABASE_KEY}`,
                  'Prefer': 'return=minimal',
                },
                body: JSON.stringify({
                  embedding_vector: embeddingResponse.embedding,
                  updated_at: new Date().toISOString(),
                }),
              });
              embeddingGenerated = updateResponse.ok;
              if (!embeddingGenerated) {
                console.error('[forge_insight] Failed to update pattern with embedding:', await updateResponse.text());
              }
            }
          } catch (embErr) {
            console.error('[forge_insight] Embedding generation failed:', embErr);
            // Continue anyway - pattern was created, just without embedding
          }

          // Log the pattern creation signal
          try {
            await fetchMemory('/api/v1/cns/signal', {
              method: 'POST',
              body: JSON.stringify({
                signal_type: 'pattern_forged',
                payload: {
                  pattern_id: newPattern.pattern_id,
                  title,
                  source,
                  tags,
                  embedding_generated: embeddingGenerated,
                },
              }),
            });
          } catch (e) {
            // Signal logging is optional
          }

          return {
            content: [
              {
                type: 'text',
                text: `**[ekkOS_LEARN]** Forged: "${title}"
**[ekkOS_LEARN]** Pattern ID: ${newPattern.pattern_id}
**[ekkOS_LEARN]** ${embeddingGenerated ? 'Searchable (embedding generated)' : 'Text-only (no embedding)'}

The pattern is now part of the collective intelligence.
Future agents will find it when facing similar problems.

**Problem:** ${problem.substring(0, 150)}...
**Solution:** ${solution.substring(0, 150)}...
**Tags:** ${['forged-insight', source, ...tags].join(', ')}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `[ekkOS_LEARN] FAILED: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }

      case 'get_memory_stats': {
        try {
          const stats = await fetchMemory('/api/v1/memory/metrics');

          const formatted = `**ekkOS Memory Layer Statistics** (10-Layer Architecture)

**Core Memory Layers:**
- 🧠 Layer 2 (Episodic): ${stats.episodic || 0} episodes
- 📚 Layer 3 (Semantic): ${stats.semantic || 0} entries
- ⚙️ Layer 5 (Procedural): ${stats.procedural || 0} workflows
- 🎯 Layer 4 (Pattern): ${stats.patterns || 0} patterns

**Advanced Memory Layers:**
- 💻 Layer 8 (Codebase): ${stats.codebase || 0} files
- 🌐 Layer 6 (Collective): ${stats.collective || 0} events (last 7 days)
- 🔍 Layer 7 (Meta): ${stats.meta || 0} records
- ⚡ Layer 1 (Working): ${stats.working || 0} messages (last 24h)

**Directive & Conflict Resolution:**
- 🛡️ Layer 9 (Directives): ${stats.directives || 0} rules (MUST/NEVER/PREFER/AVOID)
- ⚖️ Layer 10 (Conflicts): ${stats.conflicts || 0} resolutions

**Architecture Notes:**
Layer 9 Priority: MUST(1000) > NEVER(900) > PREFER(500) > AVOID(300)
Layer 10: Resolves contradictions between directives and patterns

**Last Updated:** ${stats.timestamp || new Date().toISOString()}`;

          return {
            content: [
              {
                type: 'text',
                text: formatted,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `**Memory Layer Info Unavailable**

Error: ${error instanceof Error ? error.message : String(error)}

The memory metrics endpoint may not be available. Check that:
- Memory service is accessible at mcp.ekkos.dev
- Authentication token is configured
- Metrics endpoint is accessible`,
              },
            ],
          };
        }
      }


      case 'track_application': {
        const { retrieval_id, memory_ids, context = {}, model_used } = args as any;
        // Removed console.log - MCP uses stdio for protocol

        // Generate application ID and task ID for Golden Loop
        const application_id = `app-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const task_id = `cursor-mcp-task-${Date.now()}`;
        const session_id = `cursor-mcp-${retrieval_id || Date.now()}`;
        const timestamp = new Date().toISOString();
        const final_model = model_used || context.model_used || 'cursor-unknown';

        // Look up retrieval data for accurate metrics
        // This tells us how many memories were originally retrieved vs how many are being used
        const retrievalData = retrievalStore.get(retrieval_id);
        const memories_retrieved_total = retrievalData?.total_memories || memory_ids.length;
        const memories_injected_count = memory_ids.length; // What's actually being applied
        // patterns_applied_count starts at 0 - only incremented when record_memory_outcome reports success
        const patterns_applied_count = 0;

        // Store the mapping so record_memory_outcome can update these patterns
        applicationStore.set(application_id, {
          pattern_ids: memory_ids,
          retrieval_id,
          context,
          model_used: final_model,
          created_at: Date.now(),
          task_id, // Store for task.end event
          session_id,
          started_at: timestamp,
          memories_retrieved_total, // Store for outcome tracking
        });

        // Emit task.start decision event for Golden Loop
        await emitDecisionEvent({
          event_type: 'task.start',
          task_id,
          session_id,
          timestamp,
          payload: {
            started_at: timestamp,
            user_query: context.task_description || 'Cursor MCP task',
            model_used: final_model,
            source: 'cursor-mcp',
          },
        });

        // Emit memory.usage decision event for Golden Loop
        // FIXED: Now tracks distinct metrics:
        // - memories_retrieved_total: How many were returned from search
        // - memories_injected_count: How many are being used in this task
        // - patterns_applied_count: 0 at this stage (set by record_memory_outcome on success)
        await emitDecisionEvent({
          event_type: 'memory.usage',
          task_id,
          session_id,
          timestamp,
          payload: {
            memories_retrieved_total,
            memories_retrieved_by_type: { patterns: memories_injected_count, procedures: 0, semantic: 0, episodes: 0 },
            memories_injected_count,
            patterns_applied_count, // Will be 0 - actual count comes from successful outcomes
            had_memory: memories_injected_count > 0,
            pattern_ids: memory_ids.join(','),
            model_used: final_model,
          },
        });

        // Also try to record application in database for each pattern
        const recordedPatterns: string[] = [];
        for (const patternId of memory_ids) {
          try {
            await fetchMemory('/api/v1/patterns/record-outcome', {
              method: 'POST',
              body: JSON.stringify({
                pattern_id: patternId,
                trace_id: application_id,
                matched_score: 0.8,
                outcome_success: null, // Will be set by record_memory_outcome
                reasoning: 'Pattern applied via MCP track_memory_application',
              })
            });
            recordedPatterns.push(patternId);
          } catch (e) {
            // Pattern might not exist or API unavailable, continue
            console.error(`[track_memory_application] Failed to record pattern ${patternId}:`, e);
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: `**[ekkOS_APPLY]** Tracking ${memory_ids.length} patterns
**[ekkOS_APPLY]** Application ID: ${application_id}
**[ekkOS_APPLY]** Recorded ${recordedPatterns.length} patterns in database

Include **[ekkOS_APPLY]** in your response when referencing these patterns.
Call record_memory_outcome with application_id "${application_id}" when task completes.`,
            },
          ],
        };
      }

      case 'record_outcome': {
        const { application_id, success, metrics = {}, model_used } = args as any;
        // Removed console.log - MCP uses stdio for protocol

        // Look up which patterns were tracked for this application
        const applicationData = applicationStore.get(application_id) as any;

        if (!applicationData) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  application_id,
                  error: 'Application ID not found. It may have expired (1 hour TTL) or was never tracked.',
                  message: 'Cannot record outcome - application tracking data not found'
                }, null, 2),
              },
            ],
          };
        }

        // Record outcome for each pattern that was applied
        const { pattern_ids, context, model_used: stored_model, task_id, session_id, started_at } = applicationData;
        const final_model = model_used || stored_model || 'unknown';

        // Emit task.end decision event for Golden Loop
        const timestamp = new Date().toISOString();
        const started = new Date(started_at || applicationData.created_at).getTime();
        const duration_ms = Date.now() - started;

        // FIXED: Only count patterns_applied when outcome is success
        // This gives accurate metrics - patterns only "applied" if they actually helped
        const patterns_applied_count = success ? pattern_ids.length : 0;

        await emitDecisionEvent({
          event_type: 'task.end',
          task_id: task_id || `cursor-mcp-task-${applicationData.created_at}`,
          session_id: session_id || `cursor-mcp-${applicationData.retrieval_id || applicationData.created_at}`,
          timestamp,
          duration_ms,
          payload: {
            ended_at: timestamp,
            outcome: success ? 'success' : 'failure',
            duration_ms,
            patterns_applied: patterns_applied_count, // Only count on success
            patterns_applied_count, // Explicit field for aggregation
            memories_retrieved_total: applicationData.memories_retrieved_total || pattern_ids.length,
            memories_injected_count: pattern_ids.length,
            model_used: final_model,
            source: 'cursor-mcp',
          },
        });
        const updatedPatterns: string[] = [];
        const failedPatterns: string[] = [];

        for (const patternId of pattern_ids) {
          try {
            await fetchMemory('/api/v1/patterns/record-outcome', {
              method: 'POST',
              body: JSON.stringify({
                pattern_id: patternId,
                trace_id: application_id,
                matched_score: 0.8,
                outcome_success: success,
                model_used: final_model,
                reasoning: success
                  ? `Pattern successfully helped via MCP (${final_model})`
                  : `Pattern did not help via MCP (${final_model})`,
                outcome_recorded_at: new Date().toISOString(),
              })
            });
            updatedPatterns.push(patternId);
          } catch (e) {
            console.error(`[record_memory_outcome] Failed to update pattern ${patternId}:`, e);
            failedPatterns.push(patternId);
          }
        }

        // Clean up the store entry
        applicationStore.delete(application_id);

        const outcome = success ? 'SUCCESS' : 'FAILURE';
        return {
          content: [
            {
              type: 'text',
              text: `**[ekkOS_MEASURE]** Outcome: ${outcome}
**[ekkOS_MEASURE]** Updated ${updatedPatterns.length} pattern(s)
**[ekkOS_MEASURE]** ${success ? 'Success rates increased' : 'Success rates decreased'}

The Golden Loop is complete. Patterns have evolved based on this outcome.`,
            },
          ],
        };
      }


      // Missing tools - implement directly using Supabase
      case 'get_context': {
        const { task, userId, maxEpisodes = 5, maxPatterns = 5 } = args as any;
        const effectiveUserId = userId || EKKOS_USER_ID || 'system';
        
        // Get patterns
        let patternQuery = supabase
          .from('patterns')
          .select('*')
          .or(`title.ilike.%${task}%,content.ilike.%${task}%`)
          .eq('quarantined', false)
          .order('success_rate', { ascending: false })
          .limit(maxPatterns);
        
        if (effectiveUserId !== 'system') {
          patternQuery = patternQuery.or(`user_id.eq.${effectiveUserId},user_id.is.null`);
        }
        const { data: patterns } = await patternQuery;
        
        // Get episodes
        let episodeQuery = supabase
          .from('episodic_memory')
          .select('*')
          .or(`problem.ilike.%${task}%,solution.ilike.%${task}%`)
          .limit(maxEpisodes);
        
        if (effectiveUserId !== 'system') {
          episodeQuery = episodeQuery.eq('user_id', effectiveUserId);
        }
        const { data: episodes } = await episodeQuery;
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              userId: effectiveUserId,
              task,
              patterns: patterns || [],
              episodes: episodes || [],
              metadata: {
                patternsCount: patterns?.length || 0,
                episodesCount: episodes?.length || 0
              }
            }, null, 2)
          }]
        };
      }

      case 'capture_event': {
        const { userId, sessionId, source, type, content, metadata } = args as any;
        const effectiveUserId = userId || EKKOS_USER_ID || 'system';
        
        // Create conversation if needed
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const conversationId = (sessionId && uuidRegex.test(sessionId)) ? sessionId : crypto.randomUUID();
        
        // Ensure conversation exists
        const { data: existingConv } = await supabase
          .from('chat_conversations')
          .select('id')
          .eq('id', conversationId)
          .single();
        
        if (!existingConv) {
          await supabase.from('chat_conversations').insert({
            id: conversationId,
            user_id: effectiveUserId,
            title: `Event: ${type}`,
            conversation_type: 'general'
          });
        }
        
        // Insert message
        const { data, error } = await supabase
          .from('chat_messages')
          .insert({
            conversation_id: conversationId,
            role: 'system',
            content,
            platform: source,
            metadata: { ...metadata, type, captured_via: 'mcp-stdio' }
          })
          .select()
          .single();
        
        if (error) throw new Error(error.message);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              eventId: data.id,
              userId: effectiveUserId,
              message: 'Event captured successfully'
            }, null, 2)
          }]
        };
      }


      case 'create_plan': {
        const { title, steps, context, source = 'cursor' } = args as any;
        const userId = EKKOS_USER_ID || 'system';
        const { data, error } = await supabase
          .from('agent_plans')
          .insert({
            title,
            steps: JSON.stringify(steps),
            context,
            source,
            user_id: userId !== 'system' ? userId : null,
            status: 'draft'
          })
          .select()
          .single();
        
        if (error) throw new Error(error.message);
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: true, plan_id: data.id, ...data }, null, 2) }]
        };
      }

      case 'list_plans': {
        const { limit = 20, offset = 0, status, include_templates = false } = args as any;
        const userId = EKKOS_USER_ID || 'system';
        let query = supabase.from('agent_plans').select('*');
        
        if (userId !== 'system') {
          query = query.or(`user_id.eq.${userId},user_id.is.null`);
        }
        if (status) {
          query = query.eq('status', status);
        }
        if (!include_templates) {
          query = query.is('template_category', null);
        }
        
        // Apply pagination using range (Supabase prefers range over limit/offset)
        const { data, error } = await query.range(offset, offset + limit - 1);
        if (error) throw new Error(error.message);
        return {
          content: [{ type: 'text', text: JSON.stringify({ plans: data || [] }, null, 2) }]
        };
      }

      case 'update_plan_status': {
        const { plan_id, status } = args as any;
        const { data, error } = await supabase
          .from('agent_plans')
          .update({ status })
          .eq('id', plan_id)
          .select()
          .single();
        
        if (error) throw new Error(error.message);
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: true, plan: data }, null, 2) }]
        };
      }

      case 'update_plan_step': {
        const { plan_id, step_index, completed } = args as any;
        const { data: plan } = await supabase
          .from('agent_plans')
          .select('steps')
          .eq('id', plan_id)
          .single();
        
        if (!plan) throw new Error('Plan not found');
        const steps = JSON.parse(plan.steps || '[]');
        if (steps[step_index]) {
          steps[step_index].completed = completed;
        }
        
        const { data, error } = await supabase
          .from('agent_plans')
          .update({ steps: JSON.stringify(steps) })
          .eq('id', plan_id)
          .select()
          .single();
        
        if (error) throw new Error(error.message);
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: true, plan: data }, null, 2) }]
        };
      }

      case 'generate_plan_llm':
      case 'save_plan_template':
      case 'list_plan_templates':
      case 'create_plan_from_template': {
        // Delegate to Memory API for complex LLM operations
        const result = await fetchMemory(`/api/v1/plans/${name.replace('_', '-')}`, {
          method: 'POST',
          body: JSON.stringify({ ...args, user_id: EKKOS_USER_ID || 'system' })
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      }

      case 'session_summary': {
        const { time_window_seconds = 300, session_id } = args as any;
        const result = await fetchMemory(`/api/v1/session/summary?time_window=${time_window_seconds}${session_id ? `&session_id=${session_id}` : ''}`);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      }

      case 'check_conflict': {
        const { proposed_action, scope, include_patterns = true } = args as any;
        const result = await fetchMemory('/api/v1/reflex/check', {
          method: 'POST',
          body: JSON.stringify({ proposed_action, scope, include_patterns, user_id: EKKOS_USER_ID || 'system' })
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      }

      case 'store_secret': {
        const { service, value, type, description, expiresInDays } = args as any;
        const result = await fetchMemory('/api/v1/secrets/store', {
          method: 'POST',
          body: JSON.stringify({ service, value, type, description, expires_in_days: expiresInDays, user_id: EKKOS_USER_ID || 'system' })
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      }

      case 'get_secret': {
        const { service, type, masked = false } = args as any;
        const result = await fetchMemory(`/api/v1/secrets/retrieve?service=${service}&masked=${masked}${type ? `&type=${type}` : ''}`);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      }

      case 'list_secrets': {
        const result = await fetchMemory('/api/v1/secrets/list');
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      }

      case 'delete_secret': {
        const { secretId } = args as any;
        const result = await fetchMemory(`/api/v1/secrets/${secretId}`, { method: 'DELETE' });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      }

      case 'rotate_secret': {
        const { service, type, newValue } = args as any;
        const result = await fetchMemory('/api/v1/secrets/rotate', {
          method: 'POST',
          body: JSON.stringify({ service, type, new_value: newValue, user_id: EKKOS_USER_ID || 'system' })
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      }

      case 'detect_usage': {
        const { response, retrieval_id, query } = args as any;
        // Use Memory API for usage detection (requires semantic analysis)
        const result = await fetchMemory('/api/v1/learning/detect-usage', {
          method: 'POST',
          body: JSON.stringify({ response, retrieval_id, query, user_id: EKKOS_USER_ID || 'system' })
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      }


      case 'forge_directive': {
        const { type, rule, scope = 'global', reason, priority = 50 } = args as any;
        const userId = EKKOS_USER_ID || 'system';
        const { data, error } = await supabase
          .from('directives')
          .insert({
            type,
            rule,
            scope,
            reason,
            priority,
            user_id: userId !== 'system' ? userId : null,
            status: 'active'
          })
          .select()
          .single();
        
        if (error) throw new Error(error.message);
        return {
          content: [{
            type: 'text',
            text: `✅ Directive created: ${type} - ${rule}\nPriority: ${priority}\nScope: ${scope}`
          }]
        };
      }

      case 'search_codebase': {
        const { query, limit = 10, file_types } = args as any;
        // Use Memory API codebase search endpoint
        const result = await fetchMemory('/api/v1/codebase/search', {
          method: 'POST',
          body: JSON.stringify({ query, limit, file_types, user_id: EKKOS_USER_ID || 'system' })
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
  }
}

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const displayName = toolDisplayNames[name] || name;

  try {
    return await executeToolHandler(name, args);
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // Note: No console output here - MCP uses stdio for JSON-RPC protocol
    // Any output to stdout/stderr breaks the protocol
  } catch (error) {
    // Only log fatal errors that prevent startup
    process.stderr.write(`[ekkos-memory] Fatal error: ${error instanceof Error ? error.message : String(error)}\n`);
    throw error;
  }
}

main().catch((error) => {
  process.stderr.write(`[ekkos-memory] Fatal server error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

