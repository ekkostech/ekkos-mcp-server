# ekkOS™ Memory MCP Server

Give your AI agent (Claude, GPT-4, etc.) in Cursor, Windsurf, or VS Code a persistent memory. It remembers solutions, learns from mistakes, and gets smarter over time.

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

The MCP server will be available in all chat sessions. Your AI can now remember!

## How It Works

Your AI agent can now access a 10-layer memory system that stores:

- **Patterns** - Proven solutions that worked
- **Conversations** - Past discussions and problem-solving sessions
- **Directives** - Rules your AI must follow (MUST/NEVER/PREFER/AVOID)
- **Codebase** - Semantic search across your project
- **And more** - Episodic memory, procedural workflows, collective knowledge

When you ask a question, your AI searches this memory first, finds relevant solutions, and applies them automatically.

## Core Tools

### `search_memory` 🔍

**What it does:** Searches all your memory layers to find relevant patterns, solutions, and past conversations.

**When to use:** Your AI calls this automatically before answering technical questions. It's the primary way your AI remembers.

**Example:**

```
You: "How did we fix the auth timeout issue?"

AI: [Searches memory automatically]
    "Found it! We used the auth-timeout-mitigation pattern
     from last week. Here's the solution..."
```

**What you get back:**

- Relevant patterns with success rates
- Past conversations about similar problems
- Code examples that worked
- Solutions sorted by how well they worked

---

### `forge_pattern` 🔥

**What it does:** Saves a solution that worked as a reusable pattern. Future AI agents (including yourself) will find it automatically.

**When to use:** After you solve a problem, fix a bug, or discover a better approach. Your AI should call this automatically, but you can also trigger it.

**Example:**

```
AI: [After fixing a bug]
    "I've saved this solution as a pattern. Next time we
     encounter this issue, I'll remember the fix instantly."
```

**What happens:**

- Pattern is stored in memory
- Becomes searchable immediately
- Success rate tracked over time
- Automatically suggested for similar problems

---

### `forge_directive` 📜

**What it does:** Creates a rule your AI must follow. These are MUST/NEVER/PREFER/AVOID rules that guide behavior.

**When to use:** When you want to establish permanent rules for how your AI should behave.

**Example:**

```
You: "Always use TypeScript strict mode"

AI: [Creates directive]
    "Rule saved. I'll always use strict mode going forward."
```

**Types of rules:**

- **MUST** - Always do this (highest priority)
- **NEVER** - Never do this (high priority)
- **PREFER** - Prefer this approach (medium priority)
- **AVOID** - Try to avoid this (lower priority)

**What happens:**

- Rule is enforced in all future interactions
- AI checks against rules before taking actions
- Rules can be project-specific or global

---

### `recall_conversation` 💬

**What it does:** Finds past conversations about a topic, even from days or weeks ago.

**When to use:** When you want to remember what you discussed before, or check if you've already solved a problem.

**Example:**

```
You: "What did we decide about the database schema?"

AI: [Searches past conversations]
    "We discussed this 2 weeks ago. You decided to use
     PostgreSQL with JSONB for flexible fields..."
```

**What you get back:**

- Relevant excerpts from past conversations
- Context about decisions made
- Solutions you've tried before
- Semantic matches (finds related topics, not just keywords)

---

### `check_conflict` ⚖️

**What it does:** Validates an action against your rules and patterns before executing it. Prevents your AI from doing something that violates your preferences.

**When to use:** Before executing destructive operations, deploying changes, or modifying critical configs.

**Example:**

```
AI: [Before deleting files]
    "I want to delete /tmp files. Let me check if this
     violates any rules..."

    [Checks conflicts]
    "⚠️ CONFLICT: This violates NEVER rule: 'Never delete
     files without user confirmation'. I'll ask first."
```

**What you get back:**

- List of violated rules (if any)
- Conflicting patterns
- Recommendations to proceed safely
- Clear explanation of why it conflicts

---

## How to Use It Day-to-Day

### When Starting Work

Your AI automatically searches memory when you ask questions. You don't need to do anything special - just ask:

```
You: "Fix the authentication bug"
AI: [Searches memory] "Found 3 solutions from past work..."
```

### When Solving Problems

After your AI solves something, it should automatically save it as a pattern:

```
AI: [After fixing bug]
    "Solution saved. Future agents will find this automatically."
```

If it doesn't, you can remind it:

```
You: "Save this solution as a pattern"
```

### When Setting Rules

Tell your AI what you want it to always/never do:

```
You: "Never use `any` type in TypeScript"
AI: [Creates directive] "Rule saved. I'll avoid `any` going forward."
```

### When Checking Past Work

Ask about past conversations:

```
You: "What did we decide about the API structure?"
AI: [Searches conversations] "We discussed this last week..."
```

## The Golden Loop

ekkOS uses a continuous learning cycle that makes your AI smarter:

1. **Retrieve** - `search_memory` finds relevant patterns
2. **Apply** - AI uses patterns to solve problems
3. **Measure** - System tracks if solutions worked
4. **Learn** - `forge_pattern` saves new solutions

This creates a self-improving system. Every problem solved makes future problems easier.

## Troubleshooting

### MCP Server Not Appearing

- Make sure Node.js 18+ is installed
- Check your API key is correct in the config file
- Restart your IDE after adding the config
- Check IDE logs for connection errors

### No Patterns Found

- You need to forge some patterns first (solve problems and save them)
- Check your API key has access to your memory
- Make sure `EKKOS_USER_ID` is set for user-scoped patterns

### Authentication Errors

- Verify your API key at https://platform.ekkos.dev
- Check the key hasn't expired
- Make sure the key has correct permissions

## What Gets Stored

Your memory includes:

- **Patterns** - Solutions that worked, with success rates
- **Conversations** - Past discussions, searchable semantically
- **Directives** - Rules your AI follows (MUST/NEVER/PREFER/AVOID)
- **Codebase** - Semantic search across your project files
- **Episodic** - Problem-solving sessions and workflows
- **Procedural** - Step-by-step processes that worked
- **Collective** - Knowledge shared across AI agents
- **Code** - Code embeddings for finding similar code

All of this is searchable instantly when your AI needs it.

## Example Workflow

```
1. You: "Fix the login bug"

2. AI: [Calls search_memory("login bug fix")]
    "Found 2 patterns from past work. Applying the
     highest-success solution..."

3. AI: [Fixes bug using pattern]
    "Fixed! This solution has worked 8 times before."

4. AI: [Calls forge_pattern automatically]
    "Saved this fix as a pattern for next time."

5. Next time: AI remembers instantly and applies the fix
```

## Related

- **Platform Dashboard**: https://platform.ekkos.dev
- **Documentation**: https://docs.ekkos.dev
- **GitHub**: https://github.com/ekkos-ai/ekkos

## License

MIT

---

**ekkOS™** - The memory substrate for AI agents. Making AI smarter, one pattern at a time. 🧠♾️
