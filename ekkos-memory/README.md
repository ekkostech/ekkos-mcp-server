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

## Available Tools

### `ekkOS_Search`

Search your memory for patterns, solutions, and past conversations.

```
You: "How did we fix the auth timeout issue?"
AI: [Searches memory] "Found it! Here's the solution we used..."
```

### `ekkOS_Forge`

Save a solution as a reusable pattern.

```
AI: [After fixing a bug]
    "I've saved this solution. It will be available for future sessions."
```

### `ekkOS_Directive`

Create rules your AI must follow.

```
You: "Always use TypeScript strict mode"
AI: "Rule saved. I'll follow this going forward."
```

**Rule types:**
- **MUST** — Always do this
- **NEVER** — Never do this
- **PREFER** — Prefer this approach
- **AVOID** — Try to avoid this

### `ekkOS_Recall`

Find past conversations by topic or time.

```
You: "What did we decide about the database schema?"
AI: [Searches conversations] "We discussed this 2 weeks ago..."
```

### `ekkOS_Conflict`

Check an action against your rules before executing.

```
AI: [Before deleting files]
    "Let me check if this violates any rules..."
    "⚠️ CONFLICT: This violates a NEVER rule. I'll ask first."
```

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
