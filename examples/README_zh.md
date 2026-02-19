# AionUI 扩展示例

此目录包含 AionUI 扩展的示例，展示如何构建扩展。

## hello-world-extension

一个综合示例扩展，演示了 AionUI 扩展系统支持的**所有贡献类型**。

### 快速开始

AionUI 按以下优先级自动发现扩展：

1. **本地目录** — 应用根目录下的 `./extensions/`
2. **环境变量** — `AIONUI_EXTENSIONS_DIR` 指定的路径
3. **用户数据目录** — `~/.aionui/extensions/`

要试用此示例，将其复制或软链接到上述目录之一：

```bash
# 方式 1：复制到用户扩展目录
cp -r examples/hello-world-extension ~/.aionui/extensions/hello-world

# 方式 2：设置环境变量
export AIONUI_EXTENSIONS_DIR=/path/to/examples

# 方式 3：软链接到本地扩展目录
ln -s examples/hello-world-extension extensions/hello-world
```

然后重启 AionUI，扩展将自动加载。

---

### 目录结构

```
hello-world-extension/
├── aion-extension.json          # 扩展清单（入口文件）
├── assets/
│   └── icon.svg                 # 扩展图标
├── contributes/
│   ├── acp-adapters.json        # ACP Agent 适配器
│   ├── assistants.json          # 预设助手
│   ├── mcp-servers.json         # MCP 服务器定义
│   ├── themes.json              # CSS 主题声明
│   └── webui.json               # Web UI 路由和静态资源
├── assistants/
│   ├── greeter-context.md       # 助手系统提示词（英文）
│   └── greeter-context-zh.md    # 助手系统提示词（中文）
├── skills/
│   └── code-review/             # 技能文件
├── themes/
│   ├── hello-light.css          # 浅色主题 CSS
│   └── hello-dark.css           # 暗色主题 CSS（CodeBuddy 风格）
└── webui/
    ├── api/
    │   └── hello.js             # Express Router API 处理器
    └── static/
        └── index.html           # 静态仪表盘页面
```

---

### 扩展清单（`aion-extension.json`）

清单是每个扩展的入口文件，声明元数据和贡献点。

```jsonc
{
  "$schema": "https://aionui.dev/schemas/aion-extension-v1.json",
  "name": "hello-world",           // 唯一标识，必须为 kebab-case [a-z0-9-]
  "displayName": "Hello World Extension",
  "displayNameI18n": { "zh-CN": "Hello World 示例扩展" },
  "version": "1.0.0",
  "description": "A comprehensive example extension",
  "descriptionI18n": { "zh-CN": "展示所有扩展贡献类型的综合示例" },
  "author": "AionUI Team",
  "icon": "assets/icon.svg",       // 扩展图标的相对路径
  "contributes": {
    // 每个贡献类型可以内联定义，也可以使用 $file: 引用外部文件
    "acpAdapters": "$file:contributes/acp-adapters.json",
    "mcpServers": "$file:contributes/mcp-servers.json",
    "assistants": "$file:contributes/assistants.json",
    "skills": [ ... ],             // 内联定义
    "webui": "$file:contributes/webui.json",
    "themes": "$file:contributes/themes.json"
  }
}
```

**元数据字段：**

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | 扩展唯一标识。必须为 `kebab-case` 格式（`[a-z0-9-]`）。 |
| `displayName` | 是 | UI 中显示的可读名称。 |
| `displayNameI18n` | 否 | 本地化显示名称。键为地区代码（如 `zh-CN`）。 |
| `version` | 是 | 语义化版本号（`主版本.次版本.修订号`）。 |
| `description` | 否 | 扩展的简短描述。 |
| `descriptionI18n` | 否 | 本地化描述。 |
| `author` | 否 | 作者名称或组织。 |
| `icon` | 否 | SVG/PNG 图标文件的相对路径。 |
| `homepage` | 否 | 扩展主页 URL。 |
| `contributes` | 是 | 声明所有贡献点的对象（见下文）。 |

**`$file:` 引用机制：**

使用 `"$file:path/to/file.json"` 将贡献定义外部化到独立文件中。这样可以保持清单文件简洁，每种贡献类型可独立维护。路径相对于扩展目录。

---

### 贡献类型

#### 1. ACP 适配器（`acpAdapters`）

注册自定义 AI 编码代理，它们会出现在主聊天页面和频道机器人的 Agent 选择器中。

```jsonc
[
  {
    "id": "hello-opencode",              // 唯一适配器 ID
    "name": "Hello OpenCode",            // 显示名称
    "nameI18n": { "zh-CN": "..." },      // 本地化名称
    "cliCommand": "opencode",            // CLI 可执行文件名
    "acpArgs": ["acp"],                  // 启用 ACP 协议的参数
    "icon": "assets/icon.svg",           // 适配器图标
    "authRequired": false,               // 使用前是否需要认证
    "supportsStreaming": true,            // 是否支持流式响应
    "healthCheck": {                     // 可选：验证 CLI 是否可用
      "versionCommand": "opencode --version",
      "timeout": 5000                    // 超时时间（毫秒）
    }
  }
]
```

**字段说明：**

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 是 | 唯一适配器标识符，不能与内置后端冲突。 |
| `name` | 是 | UI 中显示的名称。 |
| `cliCommand` | 否 | CLI 可执行文件名。`websocket`/`http` 类型的代理可不填。 |
| `defaultCliPath` | 否 | 完整的 CLI 调用路径（如 `"vx npx @tencent-ai/codebuddy-code"`）。 |
| `acpArgs` | 否 | 启用 ACP 协议模式的 CLI 参数（如 `["acp"]`、`["--acp"]`）。 |
| `env` | 否 | 启动 CLI 时设置的环境变量。 |
| `connectionType` | 否 | 传输类型：`"cli"`（默认）、`"websocket"` 或 `"http"`。 |
| `endpoint` | 否 | WebSocket/HTTP 端点 URL（用于非 CLI 类型的代理）。 |
| `models` | 否 | 此适配器可用的模型名称列表。 |
| `supportsStreaming` | 否 | 代理是否支持流式响应。 |
| `authRequired` | 否 | 使用前是否需要认证。 |
| `healthCheck` | 否 | 包含 `versionCommand`（字符串）和可选 `timeout`（毫秒）的对象。 |

#### 2. MCP 服务器（`mcpServers`）

贡献 [Model Context Protocol](https://modelcontextprotocol.io/) 服务器，它们会自动合并到 AionUI 的 MCP 配置中。

```jsonc
[
  {
    "name": "hello-fetch",                          // 服务器名称
    "description": "一个示例 MCP 服务器",             // 描述
    "transport": {
      "type": "stdio",                               // 传输类型：stdio | sse | http | streamable_http
      "command": "npx",                              // 启动服务器的命令
      "args": ["-y", "@anthropic-ai/claude-code-mcp-server"],
      "env": {}                                      // 环境变量
    },
    "enabled": true                                  // 加载时自动启用
  }
]
```

**传输类型：**

| 类型 | 字段 | 说明 |
|------|------|------|
| `stdio` | `command`、`args`、`env` | 标准输入输出 — 启动子进程。 |
| `sse` | `url`、`headers` | Server-Sent Events 端点。 |
| `http` | `url`、`headers` | HTTP 端点。 |
| `streamable_http` | `url`、`headers` | 可流式 HTTP 端点。 |

#### 3. 预设助手（`assistants`）

创建带有自定义系统提示词、模型偏好和快捷提示的预设助手。

```jsonc
[
  {
    "id": "friendly-greeter",                  // 唯一助手 ID
    "name": "Friendly Greeter",                // 显示名称
    "avatar": "👋",                            // 表情符号或图片路径
    "presetAgentType": "claude",               // 基础代理：claude | gemini | codex | codebuddy | opencode
    "contextFile": "assistants/greeter-context.md",   // 系统提示词文件
    "contextFileI18n": {
      "zh-CN": "assistants/greeter-context-zh.md"     // 本地化提示词
    },
    "models": ["claude-sonnet-4-20250514"],    // 首选模型
    "enabledSkills": ["code-review"],          // 要激活的技能
    "prompts": [                               // 快捷提示建议
      "Introduce yourself",
      "Tell me a fun fact"
    ],
    "promptsI18n": {
      "zh-CN": ["介绍一下你自己", "给我讲一个有趣的事实"]
    }
  }
]
```

**字段说明：**

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 是 | 唯一助手标识符。 |
| `name` | 是 | 显示名称。 |
| `presetAgentType` | 是 | 要使用的基础 AI 代理后端。 |
| `contextFile` | 是 | Markdown 格式的系统提示词/规则文件的相对路径。 |
| `avatar` | 否 | 表情字符或头像图片路径。 |
| `models` | 否 | 首选模型列表，使用第一个可用的模型。 |
| `enabledSkills` | 否 | 为此助手激活的技能名称列表。 |
| `prompts` | 否 | 聊天 UI 中显示的快捷提示建议。 |

#### 4. 技能（`skills`）

贡献技能定义，扩展 AI 代理的能力。

```jsonc
{
  "skills": [
    {
      "name": "code-review",                   // 技能名称
      "description": "帮助代码审查",             // 描述
      "file": "skills/code-review/SKILL.md"    // 技能定义文件
    }
  ]
}
```

#### 5. 主题（`themes`）

贡献自定义 CSS 主题，用户可以在 设置 > 外观 > CSS 主题 中选择。

```jsonc
[
  {
    "id": "hello-dark",                        // 唯一主题 ID
    "name": "Hello Dark (CodeBuddy Style)",    // 显示名称
    "nameI18n": { "zh-CN": "暗色主题" },        // 本地化名称
    "file": "themes/hello-dark.css",           // CSS 文件路径
    "cover": "assets/theme-preview.png"        // 可选：预览图
  }
]
```

**编写主题 CSS：**

CSS 文件必须覆盖 AionUI 的系统 CSS 变量。需要自定义的关键变量：

```css
/* 浅色模式 — :root */
:root {
  --color-primary: #667eea;      /* 主品牌色 */
  --bg-1: #f8f9fe;               /* 页面背景 */
  --bg-2: #ffffff;               /* 卡片背景 */
  --color-text-1: #1a1a2e;      /* 主文字色 */
  --color-text-2: #4a4a6a;      /* 次要文字色 */
  --color-border: #dde1fb;       /* 边框颜色 */
  --success: #10b981;            /* 成功色 */
  --warning: #f59e0b;            /* 警告色 */
  --danger: #ef4444;             /* 错误/危险色 */
}

/* 深色模式 */
[data-theme='dark'] {
  --color-primary: #8b9cf7;
  --bg-1: #1a1b2e;
  --color-text-1: #e5e5f0;
  /* ... */
}
```

> **重要提示：** 只覆盖私有变量（如 `--my-color`）不会生效。必须覆盖上面列出的系统变量。

#### 6. WebUI（`webui`）

扩展 AionUI 内嵌的 Web 服务器，添加 API 路由、WebSocket 处理器、中间件和静态资源。

```jsonc
{
  "apiRoutes": [
    {
      "path": "/hello",                    // 路由路径（自动加前缀 /api/ext/hello）
      "entryPoint": "webui/api/hello.js",  // 导出 Express Router 的 JS 文件
      "description": "返回问候消息",
      "auth": false                         // false = 无需认证（默认为 true）
    }
  ],
  "wsHandlers": [
    {
      "namespace": "hello",                 // WS 命名空间（自动加前缀 ext:hello）
      "entryPoint": "webui/ws/handler.js",
      "description": "实时更新"
    }
  ],
  "middleware": [
    {
      "entryPoint": "webui/middleware/logger.js",
      "description": "请求日志记录器",
      "applyTo": "/api/**",                 // 作用范围（限制为 /api/** 和 /ext/**）
      "order": "before"                      // "before" 或 "after" 路由处理器
    }
  ],
  "staticAssets": [
    {
      "urlPrefix": "/hello-world",           // URL 前缀（自动加前缀 /ext/hello-world）
      "directory": "webui/static",           // 要提供服务的本地目录
      "description": "仪表盘页面"
    }
  ]
}
```

**API 路由入口文件格式：**

JS 文件必须导出一个 Express Router：

```js
const { Router } = require('express');
const router = Router();

router.get('/', (_req, res) => {
  res.json({ message: 'Hello from extension!' });
});

module.exports = router;
```

**安全说明：**
- API 路由强制挂载在 `/api/ext/` 前缀下
- WebSocket 命名空间强制使用 `ext:` 前缀
- 静态资源强制挂载在 `/ext/` 前缀下
- 中间件作用范围限制为 `/api/**` 和 `/ext/**`
- 路径穿越（访问扩展目录外的文件）会被阻止

#### 7. 频道插件（`channelPlugins`）

贡献自定义消息平台插件（如 Slack、Discord）。入口文件必须导出一个继承 `BasePlugin` 的类。

```jsonc
{
  "channelPlugins": [
    {
      "type": "slack",                        // 平台类型标识符
      "name": "Slack 集成",
      "entryPoint": "plugins/slack.js",       // 导出 BasePlugin 子类的 JS 文件
      "credentialFields": [                   // 凭证表单字段
        { "key": "token", "label": "Bot Token", "type": "password", "required": true }
      ],
      "configFields": [                       // 配置表单字段
        { "key": "channel", "label": "默认频道", "type": "text" }
      ]
    }
  ]
}
```

---

### 验证

加载扩展后，可以通过以下方式验证：

1. **主题** — 进入 设置 > 外观 > CSS 主题，选择 "Hello Light" 或 "Hello Dark"
2. **ACP Agent** — 在主页的 Agent 选择器中查看 "Hello OpenCode" / "Hello CodeBuddy"
3. **预设助手** — 进入 设置 > 助手管理，查看带有 `Ext` 标签的 "Friendly Greeter"
4. **MCP 服务器** — 进入 设置 > 工具，在 MCP 服务器列表中查看 "hello-fetch"
5. **WebUI API** — 在浏览器中访问 `http://localhost:25808/api/ext/hello`
6. **静态页面** — 在浏览器中访问 `http://localhost:25808/ext/hello-world/`

---

### 创建你自己的扩展

1. 在上述发现路径之一下创建新目录
2. 创建 `aion-extension.json`，至少包含 `name`、`displayName`、`version` 和 `contributes`
3. 根据需要添加贡献文件
4. 重启 AionUI 加载扩展

完整的贡献类型 Schema 定义请参考 `src/extensions/types.ts`。
