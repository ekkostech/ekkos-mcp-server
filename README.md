# ekkOS Memory MCP Server

This repository contains the **official, canonical MCP server** for ekkOS — the persistent memory layer for AI coding assistants.

> **Note:** Forks or mirrors of this repository may be outdated. For the most current version, always refer to the [npm package](https://www.npmjs.com/package/@ekkos/mcp-server) or [docs.ekkos.dev](https://docs.ekkos.dev).

---

## What This Package Does

The ekkOS MCP server gives your AI assistant persistent memory across sessions. Your AI can:

- **Search** for patterns, solutions, and past conversations
- **Save** solutions that work for future retrieval
- **Follow** rules you define (MUST/NEVER/PREFER/AVOID)
- **Check** actions against your rules before executing

This works with Claude Code, Cursor, Windsurf, VS Code, and other MCP-compatible tools.

---

## What This Package Does NOT Document

This package intentionally does not describe:
- Internal system architecture
- How patterns are ranked or selected
- Server-side processing logic
- Infrastructure topology

---

## Quick Start

### 1. Install

```bash
npm install -g @ekkos/mcp-server
```

### 2. Get Your API Key

1. Visit https://platform.ekkos.dev
2. Sign in or create an account
3. Copy your API key from the dashboard
4. Copy your User ID from your profile

### 3. Configure Your IDE

**For Cursor:** Add to `~/.cursor/mcp.json`

**For Windsurf:** Add to `~/.codeium/windsurf/mcp_config.json`

```json
{
  "mcpServers": {
    "ekkos-memory": {
      "url": "https://mcp.ekkos.dev/api/v1/mcp/sse?api_key=your-api-key-here",
      "transport": "sse",
      "headers": {
        "Authorization": "Bearer your-api-key-here",
        "X-User-ID": "your-user-id-here"
      }
    }
  }
}
```

**For Claude Code:** Add to `~/.claude/settings.json`

```json
{
  "mcpServers": {
    "ekkos-memory": {
      "command": "npx",
      "args": ["-y", "@ekkos/mcp-server"],
      "env": {
        "EKKOS_API_KEY": "your-api-key-here",
        "EKKOS_USER_ID": "your-user-id-here"
      }
    }
  }
}
```

### 4. Restart Your IDE

The MCP server will be available in all chat sessions.

---

## 35 MCP Tools

Your AI gets access to **35 memory tools** across 8 categories. [Full documentation →](https://docs.ekkos.dev/tools)

### Core Memory (7)
| Tool | Description |
|------|-------------|
| [`ekkOS_Search`](https://docs.ekkos.dev/tools/search) | Search all memory layers for patterns, solutions, and context |
| [`ekkOS_Forge`](https://docs.ekkos.dev/tools/forge) | Create a new pattern from a learned solution |
| [`ekkOS_Directive`](https://docs.ekkos.dev/tools/directive) | Create user rules (MUST/NEVER/PREFER/AVOID) |
| [`ekkOS_Context`](https://docs.ekkos.dev/tools/context) | Get relevant context for a task |
| [`ekkOS_Capture`](https://docs.ekkos.dev/tools/capture) | Capture a memory event |
| [`ekkOS_Codebase`](https://docs.ekkos.dev/tools/codebase) | Search project codebase embeddings |
| [`ekkOS_Recall`](https://docs.ekkos.dev/tools/recall) | Recall past conversations by time |

### Pattern Tracking (4)
| Tool | Description |
|------|-------------|
| [`ekkOS_Track`](https://docs.ekkos.dev/tools/track) | Track when a pattern is applied |
| [`ekkOS_Outcome`](https://docs.ekkos.dev/tools/outcome) | Record success/failure of applied patterns |
| [`ekkOS_Detect`](https://docs.ekkos.dev/tools/detect) | Auto-detect which patterns were used |
| [`ekkOS_Reflect`](https://docs.ekkos.dev/tools/reflect) | Analyze a response for improvements |

### Utility (3)
| Tool | Description |
|------|-------------|
| [`ekkOS_Stats`](https://docs.ekkos.dev/tools/stats) | Get statistics for all memory layers |
| [`ekkOS_Summary`](https://docs.ekkos.dev/tools/summary) | Get human-readable activity summary |
| [`ekkOS_Conflict`](https://docs.ekkos.dev/tools/conflict) | Check if action conflicts with directives |

### Plan Management (8)
| Tool | Description |
|------|-------------|
| [`ekkOS_Plan`](https://docs.ekkos.dev/tools/plan) | Create a new structured plan |
| [`ekkOS_Plans`](https://docs.ekkos.dev/tools/plans) | List agent plans for the current user |
| [`ekkOS_PlanStatus`](https://docs.ekkos.dev/tools/plan-status) | Update plan status |
| [`ekkOS_PlanStep`](https://docs.ekkos.dev/tools/plan-step) | Mark a plan step complete/incomplete |
| [`ekkOS_Generate`](https://docs.ekkos.dev/tools/generate) | Generate a plan using AI |
| [`ekkOS_SaveTemplate`](https://docs.ekkos.dev/tools/save-template) | Save a plan as reusable template |
| [`ekkOS_Templates`](https://docs.ekkos.dev/tools/templates) | List available plan templates |
| [`ekkOS_FromTemplate`](https://docs.ekkos.dev/tools/from-template) | Create plan from template |

### Secrets Management (5)
| Tool | Description |
|------|-------------|
| [`ekkOS_StoreSecret`](https://docs.ekkos.dev/tools/store-secret) | Securely store sensitive data |
| [`ekkOS_GetSecret`](https://docs.ekkos.dev/tools/get-secret) | Retrieve a stored secret |
| [`ekkOS_ListSecrets`](https://docs.ekkos.dev/tools/list-secrets) | List all stored secrets (metadata only) |
| [`ekkOS_DeleteSecret`](https://docs.ekkos.dev/tools/delete-secret) | Permanently delete a secret |
| [`ekkOS_RotateSecret`](https://docs.ekkos.dev/tools/rotate-secret) | Update a secret with new value |

### Schema Awareness (2)
| Tool | Description |
|------|-------------|
| [`ekkOS_IndexSchema`](https://docs.ekkos.dev/tools/index-schema) | Index database/type schemas |
| [`ekkOS_GetSchema`](https://docs.ekkos.dev/tools/get-schema) | Get schema for a table/type |

### Portability (4)
| Tool | Description |
|------|-------------|
| [`ekkOS_Export`](https://docs.ekkos.dev/tools/export) | Export memory data as JSON backup |
| [`ekkOS_Import`](https://docs.ekkos.dev/tools/import) | Import memory from backup |
| [`ekkOS_Snapshot`](https://docs.ekkos.dev/tools/snapshot) | Create point-in-time snapshot |
| [`ekkOS_Sync`](https://docs.ekkos.dev/tools/sync) | Synchronize with cloud |

### Project Setup (2)
| Tool | Description |
|------|-------------|
| [`ekkOS_ProjectInit`](https://docs.ekkos.dev/tools/project-init) | Initialize ekkOS for a project |
| [`ekkOS_Ingest`](https://docs.ekkos.dev/tools/ingest) | Bulk ingest data into memory |

---

## Day-to-Day Usage

**Starting work:** Your AI automatically searches memory when you ask questions.

**After solving problems:** Tell your AI to save the solution:
```
You: "Save this solution as a pattern"
```

**Setting rules:** Tell your AI what to always/never do:
```
You: "Never use `any` type in TypeScript"
```

**Checking past work:**
```
You: "What did we decide about the API structure?"
```

---

## What Gets Stored

- **Patterns** — Solutions you've saved
- **Conversations** — Past discussions (searchable)
- **Directives** — Rules your AI follows
- **Codebase context** — Your project files (semantic search)

---

## Troubleshooting

### MCP Server Not Appearing

- Ensure Node.js 18+ is installed
- Check your API key is correct
- Restart your IDE after adding config
- Check IDE logs for errors

### No Patterns Found

- You need to save some patterns first
- Verify your API key has access
- Ensure `EKKOS_USER_ID` is set

### Authentication Errors

- Verify your API key at https://platform.ekkos.dev
- Check the key hasn't expired

---

## Links

- **Documentation:** [docs.ekkos.dev](https://docs.ekkos.dev)
- **Platform:** [platform.ekkos.dev](https://platform.ekkos.dev)
- **Website:** [ekkos.dev](https://ekkos.dev)

---

## License & Trademarks

**ekkOS** and the ekkOS logo are trademarks of ekkOS Technologies Inc.

This package is provided under the MIT license. Unauthorized reproduction or distribution of ekkOS trademarks or branding assets is prohibited.

For licensing inquiries: [ekkoslabs.com](https://ekkoslabs.com)
