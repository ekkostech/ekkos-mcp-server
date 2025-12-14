# Publishing @ekkos/mcp-server to npm

## Pre-Publish Checklist

- [x] Package renamed to @ekkos/mcp-server
- [x] Version updated to 1.2.3
- [x] Built successfully
- [x] README updated
- [x] npm login completed (via token)
- [x] Published to npm (v1.2.3)
- [ ] Tested with npx

## Publishing Steps

### 1. Login to npm

```bash
cd /Volumes/MacMiniPort/DEV/EKKOS/mcp-servers/ekkos-memory
npm login
```

**Note:** You'll need to authenticate via browser. npm will open a login page.

### 2. Publish Package

```bash
npm publish --access public
```

**Important:** Scoped packages (@ekkos/\*) default to private. Use `--access public` to make it publicly available.

### 3. Verify Publication

```bash
npm view @ekkos/mcp-server
```

Should show version 1.2.3 and package details.

### 4. Test with npx

```bash
npx -y @ekkos/mcp-server
```

Should download and start the server (will fail without env vars, but that's expected).

## Post-Publish

### Update Documentation

- [ ] Update Windsurf integration guide
- [ ] Update Cursor integration guide
- [ ] Update platform dashboard wizard
- [ ] Add to ekkOS Connect extension templates

### Test Configurations

**Windsurf:**

```json
{
  "mcpServers": {
    "ekkos-memory": {
      "command": "npx",
      "args": ["-y", "@ekkos/mcp-server"],
      "env": {
        "EKKOS_API_KEY": "test_key",
        "EKKOS_USER_ID": "test_user"
      }
    }
  }
}
```

**Cursor:**

```json
{
  "mcpServers": {
    "ekkos-memory": {
      "command": "npx",
      "args": ["-y", "@ekkos/mcp-server"],
      "env": {
        "EKKOS_API_KEY": "test_key",
        "EKKOS_USER_ID": "test_user"
      }
    }
  }
}
```

## Troubleshooting

**"npm ERR! 402 Payment Required"**

- Scoped packages require paid account OR use `--access public`

**"npm ERR! 403 Forbidden"**

- Package name already taken
- Try alternate name or check npm account permissions

**"npm ERR! E401 Unauthorized"**

- Run `npm login` again
- Verify npm account is active

## Package Contents

Verify what's included:

```bash
npm pack --dry-run
```

Should include:

- build/index.js (compiled server)
- package.json
- README.md
- tsconfig.json

Should NOT include:

- node_modules/
- src/ (only build artifacts)
- .git/

---

**Status:** ✅ Published v1.2.3  
**Last Published:** 2025-12-13  
**Changes:** Added resources capability support for Windsurf compatibility


