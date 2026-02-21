# AionUI Extension Examples

This directory contains example extensions demonstrating how to build extensions for AionUI.

## hello-world-extension

A comprehensive example extension that demonstrates **all contribution types** supported by the AionUI extension system.

### Quick Start

AionUI automatically discovers extensions from the following locations (in priority order):

1. **Local** — `./extensions/` directory relative to the app
2. **Environment Variable** — path set in `AIONUI_EXTENSIONS_DIR`
3. **AppData** — `~/.aionui/extensions/` (user data directory)

To try this example, copy or symlink it into one of the above directories:

```bash
# Option 1: Copy to user extensions directory
cp -r examples/hello-world-extension ~/.aionui/extensions/hello-world

# Option 2: Set environment variable
export AIONUI_EXTENSIONS_DIR=/path/to/examples

# Option 3: Symlink to local extensions folder
ln -s examples/hello-world-extension extensions/hello-world
```

Then restart AionUI. The extension will be loaded automatically.

---

### Directory Structure

```
hello-world-extension/
├── aion-extension.json          # Extension manifest (entry point)
├── assets/
│   └── icon.svg                 # Extension icon
├── contributes/
│   ├── acp-adapters.json        # ACP Agent adapters
│   ├── assistants.json          # Preset assistants
│   ├── mcp-servers.json         # MCP server definitions
│   ├── themes.json              # CSS theme declarations
│   └── webui.json               # Web UI routes & static assets
├── assistants/
│   ├── greeter-context.md       # Assistant system prompt (English)
│   └── greeter-context-zh.md    # Assistant system prompt (Chinese)
├── skills/
│   └── code-review/             # Skill files
├── themes/
│   ├── hello-light.css          # Light theme CSS
│   └── hello-dark.css           # Dark theme CSS (CodeBuddy style)
└── webui/
    ├── api/
    │   └── hello.js             # Express Router API handler
    └── static/
        └── index.html           # Static dashboard page
```

---

### Extension Manifest (`aion-extension.json`)

The manifest is the entry point of every extension. It declares metadata and contribution points.

```jsonc
{
  "$schema": "https://aionui.dev/schemas/aion-extension-v1.json",
  "name": "hello-world",           // Unique ID, must be kebab-case [a-z0-9-]
  "displayName": "Hello World Extension",
  "displayNameI18n": { "zh-CN": "Hello World 示例扩展" },
  "version": "1.0.0",
  "description": "A comprehensive example extension",
  "descriptionI18n": { "zh-CN": "展示所有扩展贡献类型的综合示例" },
  "author": "AionUI Team",
  "icon": "assets/icon.svg",       // Relative path to extension icon
  "contributes": {
    // Each contribution type can be inline or use $file: reference
    "acpAdapters": "$file:contributes/acp-adapters.json",
    "mcpServers": "$file:contributes/mcp-servers.json",
    "assistants": "$file:contributes/assistants.json",
    "skills": [ ... ],             // Inline definition
    "webui": "$file:contributes/webui.json",
    "themes": "$file:contributes/themes.json"
  }
}
```

**Metadata Fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique extension ID. Must be `kebab-case` (`[a-z0-9-]`). |
| `displayName` | Yes | Human-readable name shown in UI. |
| `displayNameI18n` | No | Localized display names. Key is locale code (e.g. `zh-CN`). |
| `version` | Yes | Semantic version string (`major.minor.patch`). |
| `description` | No | Short description of the extension. |
| `descriptionI18n` | No | Localized descriptions. |
| `author` | No | Author name or organization. |
| `icon` | No | Relative path to an SVG/PNG icon file. |
| `homepage` | No | URL to extension homepage. |
| `contributes` | Yes | Object declaring all contribution points (see below). |

**`$file:` References:**

Use `"$file:path/to/file.json"` to externalize contribution definitions into separate files. This keeps the manifest clean and each contribution type maintainable independently. Paths are relative to the extension directory.

---

### Contribution Types

#### 1. ACP Adapters (`acpAdapters`)

Register custom AI coding agents that appear in the agent selector (main chat and channel bots).

```jsonc
[
  {
    "id": "hello-opencode",              // Unique adapter ID
    "name": "Hello OpenCode",            // Display name
    "nameI18n": { "zh-CN": "..." },      // Localized name
    "cliCommand": "opencode",            // CLI executable name
    "acpArgs": ["acp"],                  // Arguments to enable ACP protocol
    "icon": "assets/icon.svg",           // Adapter icon
    "authRequired": false,               // Whether auth is needed before use
    "supportsStreaming": true,            // Supports streaming responses
    "healthCheck": {                     // Optional: verify CLI is available
      "versionCommand": "opencode --version",
      "timeout": 5000                    // Timeout in milliseconds
    }
  }
]
```

**Fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique adapter identifier. Must not conflict with built-in backends. |
| `name` | Yes | Display name shown in UI. |
| `cliCommand` | No | CLI executable name. Optional for `websocket`/`http` agents. |
| `defaultCliPath` | No | Full CLI invocation path (e.g. `"vx npx @tencent-ai/codebuddy-code"`). |
| `acpArgs` | No | CLI arguments to enable ACP protocol mode (e.g. `["acp"]`, `["--acp"]`). |
| `env` | No | Environment variables to set when launching the CLI. |
| `connectionType` | No | Transport type: `"cli"` (default), `"websocket"`, or `"http"`. |
| `endpoint` | No | WebSocket/HTTP endpoint URL (for non-CLI agents). |
| `models` | No | List of available model names for this adapter. |
| `supportsStreaming` | No | Whether the agent supports streaming responses. |
| `authRequired` | No | Whether authentication is required before use. |
| `healthCheck` | No | Object with `versionCommand` (string) and optional `timeout` (number, ms). |

#### 2. MCP Servers (`mcpServers`)

Contribute [Model Context Protocol](https://modelcontextprotocol.io/) servers that are automatically merged into AionUI's MCP configuration.

```jsonc
[
  {
    "name": "hello-fetch",                          // Server name
    "description": "A demo MCP server",             // Description
    "transport": {
      "type": "stdio",                               // Transport: stdio | sse | http | streamable_http
      "command": "npx",                              // Command to start server
      "args": ["-y", "@anthropic-ai/claude-code-mcp-server"],
      "env": {}                                      // Environment variables
    },
    "enabled": true                                  // Auto-enable on load
  }
]
```

**Transport Types:**

| Type | Fields | Description |
|------|--------|-------------|
| `stdio` | `command`, `args`, `env` | Standard I/O — launches a child process. |
| `sse` | `url`, `headers` | Server-Sent Events endpoint. |
| `http` | `url`, `headers` | HTTP endpoint. |
| `streamable_http` | `url`, `headers` | Streamable HTTP endpoint. |

#### 3. Assistants (`assistants`)

Create preset assistants with custom system prompts, model preferences, and quick-action prompts.

```jsonc
[
  {
    "id": "friendly-greeter",                  // Unique assistant ID
    "name": "Friendly Greeter",                // Display name
    "avatar": "👋",                            // Emoji or image path
    "presetAgentType": "claude",               // Base agent: claude | gemini | codex | codebuddy | opencode
    "contextFile": "assistants/greeter-context.md",   // System prompt file
    "contextFileI18n": {
      "zh-CN": "assistants/greeter-context-zh.md"     // Localized prompt
    },
    "models": ["claude-sonnet-4-20250514"],    // Preferred models
    "enabledSkills": ["code-review"],          // Skills to activate
    "prompts": [                               // Quick-action prompt suggestions
      "Introduce yourself",
      "Tell me a fun fact"
    ],
    "promptsI18n": {
      "zh-CN": ["介绍一下你自己", "给我讲一个有趣的事实"]
    }
  }
]
```

**Fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique assistant identifier. |
| `name` | Yes | Display name. |
| `presetAgentType` | Yes | The base AI agent backend to use. |
| `contextFile` | Yes | Relative path to a Markdown file containing the system prompt / rules. |
| `avatar` | No | Emoji character or path to avatar image. |
| `models` | No | Preferred model list. First available model will be used. |
| `enabledSkills` | No | List of skill names to activate for this assistant. |
| `prompts` | No | Quick-action prompt suggestions displayed in the chat UI. |

#### 4. Skills (`skills`)

Contribute skill definitions that extend agent capabilities.

```jsonc
{
  "skills": [
    {
      "name": "code-review",                   // Skill name
      "description": "Helps review code",      // Description
      "file": "skills/code-review/SKILL.md"    // Skill definition file
    }
  ]
}
```

#### 5. Themes (`themes`)

Contribute custom CSS themes that users can select in Settings > Appearance.

```jsonc
[
  {
    "id": "hello-dark",                        // Unique theme ID
    "name": "Hello Dark (CodeBuddy Style)",    // Display name
    "nameI18n": { "zh-CN": "暗色主题" },        // Localized name
    "file": "themes/hello-dark.css",           // CSS file path
    "cover": "assets/theme-preview.png"        // Optional: preview image
  }
]
```

**Writing Theme CSS:**

The CSS file must override AionUI's system CSS variables. Key variables to customize:

```css
/* Light mode — :root */
:root {
  --color-primary: #667eea;      /* Primary brand color */
  --bg-1: #f8f9fe;               /* Page background */
  --bg-2: #ffffff;               /* Card background */
  --color-text-1: #1a1a2e;      /* Primary text */
  --color-text-2: #4a4a6a;      /* Secondary text */
  --color-border: #dde1fb;       /* Border color */
  --success: #10b981;            /* Success color */
  --warning: #f59e0b;            /* Warning color */
  --danger: #ef4444;             /* Error/danger color */
}

/* Dark mode */
[data-theme='dark'] {
  --color-primary: #8b9cf7;
  --bg-1: #1a1b2e;
  --color-text-1: #e5e5f0;
  /* ... */
}
```

> **Important:** Only overriding private variables like `--my-color` will NOT work. You must override the system variables listed above.

#### 6. WebUI (`webui`)

Extend AionUI's embedded web server with API routes, WebSocket handlers, middleware, and static assets.

```jsonc
{
  "apiRoutes": [
    {
      "path": "/hello",                    // Route path (auto-prefixed to /api/ext/hello)
      "entryPoint": "webui/api/hello.js",  // JS file exporting an Express Router
      "description": "Returns a greeting",
      "auth": false                         // false = no auth required (default: true)
    }
  ],
  "wsHandlers": [
    {
      "namespace": "hello",                 // WS namespace (auto-prefixed to ext:hello)
      "entryPoint": "webui/ws/handler.js",
      "description": "Real-time updates"
    }
  ],
  "middleware": [
    {
      "entryPoint": "webui/middleware/logger.js",
      "description": "Request logger",
      "applyTo": "/api/**",                 // Scope (restricted to /api/** and /ext/**)
      "order": "before"                      // "before" or "after" route handlers
    }
  ],
  "staticAssets": [
    {
      "urlPrefix": "/hello-world",           // URL prefix (auto-prefixed to /ext/hello-world)
      "directory": "webui/static",           // Local directory to serve
      "description": "Dashboard page"
    }
  ]
}
```

**API Route Entry Point Format:**

The JS file must export an Express Router:

```js
const { Router } = require('express');
const router = Router();

router.get('/', (_req, res) => {
  res.json({ message: 'Hello from extension!' });
});

module.exports = router;
```

**Security Notes:**
- API routes are forced under `/api/ext/` prefix
- WebSocket namespaces are forced under `ext:` prefix
- Static assets are forced under `/ext/` prefix
- Middleware scope is restricted to `/api/**` and `/ext/**`
- Path traversal outside the extension directory is blocked

#### 7. Channel Plugins (`channelPlugins`)

Contribute custom messaging platform plugins (e.g. Slack, Discord). The entry point must export a class extending `BasePlugin`.

```jsonc
{
  "channelPlugins": [
    {
      "type": "slack",                        // Platform type identifier
      "name": "Slack Integration",
      "entryPoint": "plugins/slack.js",       // JS file exporting a BasePlugin subclass
      "credentialFields": [                   // Credential form fields
        { "key": "token", "label": "Bot Token", "type": "password", "required": true }
      ],
      "configFields": [                       // Configuration form fields
        { "key": "channel", "label": "Default Channel", "type": "text" }
      ]
    }
  ]
}
```

---

### Verification

After loading, you can verify the extension is working:

1. **Themes** — Go to Settings > Appearance > CSS Theme and select "Hello Light" or "Hello Dark"
2. **ACP Agents** — Check the agent selector on the main page for "Hello OpenCode" / "Hello CodeBuddy"
3. **Assistants** — Go to Settings > Assistants to see "Friendly Greeter" with an `Ext` badge
4. **MCP Servers** — Go to Settings > Tools to see "hello-fetch" in the MCP server list
5. **WebUI API** — Visit `http://localhost:25808/api/ext/hello` in your browser
6. **Static Page** — Visit `http://localhost:25808/ext/hello-world/` in your browser

---

### Creating Your Own Extension

1. Create a new directory under one of the discovery paths
2. Create `aion-extension.json` with at least `name`, `displayName`, `version`, and `contributes`
3. Add contribution files as needed
4. Restart AionUI to load the extension

Refer to the type definitions in `src/extensions/types.ts` for the complete schema of all contribution types.
