# RFC-001: AionUI 统一扩展系统（Unified Extension System）

- **Status**: Phase 1–3 Implemented
- **Date**: 2026-02-13
- **Author**: AionUI Team

---

## 1. 背景与动机

AionUI 当前存在 **7+ 套独立的扩展/插件机制**，各自运行互不关联：

| 子系统 | 负责领域 | 当前方式 | 痛点 |
|--------|---------|---------|------|
| ACP Backends | CLI Agent 集成 | `ACP_BACKENDS_ALL` 硬编码 | 添加新 CLI 需改源码 |
| Gemini Extensions | Gemini MCP/Context | `~/.gemini/extensions/` JSON 扫描 | 仅限 Gemini Agent |
| MCP Servers | 工具/知识库服务 | `ConfigStorage → mcp.config` UI | 无法批量分发 |
| Preset Assistants | 内置助手模板 | `ASSISTANT_PRESETS` 硬编码 | 添加新助手需改源码 |
| Custom Assistants | 用户自定义助手 | `ConfigStorage → acp.customAgents` UI | 无法预配置分发 |
| Skills | Agent 技能包 | `skills/` 目录 + SKILL.md | 内置目录，不易外部扩展 |
| Channel Plugins | 聊天机器人平台 | `ChannelManager` 硬编码 `registerPlugin()` | 添加新平台需改源码 |
| WebUI | Web 访问层 | Express + WebSocket 固定路由 | 无 API 扩展点 |

**核心问题**：企业用户、社区开发者无法在不修改源码的情况下扩展 AionUI 的能力。

---

## 2. 设计目标

1. **一个清单文件** (`aion-extension.json`) 声明所有能力，无需修改源码
2. **覆盖所有子系统** 的外部扩展需求（ACP、MCP、助手、Skills、Channel、WebUI、主题）
3. **多来源加载**：文件系统扫描 + 环境变量路径 + 未来的 Marketplace
4. **企业场景友好**：集中分发、环境变量注入 (`${env:VAR_NAME}`)
5. **向后兼容**：现有所有机制保持不变，扩展系统作为新的供应层注入
6. **安全隔离**：扩展路由/命名空间前缀隔离，默认鉴权

---

## 3. 格式选型：JSON (JSONC)

### 3.1 对比分析

| 维度 | JSON (JSONC) | TOML |
|------|-------------|------|
| 生态一致性 | ✅ 项目全 JSON，Gemini extensions 也用 JSON | ❌ 引入新格式，需额外依赖 |
| TypeScript 支持 | ✅ 原生 `JSON.parse()`，Zod 验证 | ⚠️ 需要 `@iarna/toml` 或 `smol-toml` |
| Schema 验证 | ✅ JSON Schema 成熟，IDE 自动补全 | ⚠️ TOML Schema 支持较弱 |
| 人工可读性 | ⚠️ 需要引号/大括号 | ✅ 更简洁 |
| 注释支持 | ⚠️ JSONC 支持 `//` 注释 | ✅ 原生 `#` 注释 |
| 复杂嵌套 | ✅ 天然支持 | ⚠️ 深层嵌套可读性差 |
| MCP 生态 | ✅ MCP 配置用 JSON | ❌ 不一致 |
| Web/前端可读 | ✅ 浏览器原生支持 | ❌ 需额外解析 |

### 3.2 结论

选择 **JSON (JSONC)** 格式。理由：

1. 与 Gemini CLI 的 `gemini-extension.json` 保持一致
2. 与 MCP 配置格式统一
3. 整个 Electron/TypeScript 生态都是 JSON
4. JSONC 支持注释，弥补 JSON 不能注释的短板
5. 提供 JSON Schema 让用户在 VS Code 中获得自动补全和验证

---

## 4. 扩展清单格式：`aion-extension.json`

### 4.1 完整 Schema

```jsonc
{
  // JSON Schema，提供 IDE 自动补全
  "$schema": "https://aionui.dev/schemas/aion-extension-v1.json",

  // ===== 扩展元信息 =====
  "name": "enterprise-toolkit",            // 唯一标识（kebab-case）
  "displayName": "Enterprise Toolkit",     // UI 显示名
  "displayNameI18n": {                     // 可选：国际化
    "zh-CN": "企业工具包"
  },
  "version": "1.0.0",                     // 语义化版本
  "description": "All-in-one enterprise extension pack",
  "descriptionI18n": {
    "zh-CN": "一体化企业扩展包"
  },
  "author": "DevOps Team",
  "icon": "./icon.svg",                   // 可选：相对路径
  "homepage": "https://internal.company.com/aionui-ext",

  // ===== 能力声明（contributes）=====
  "contributes": {

    // ---- 1. ACP CLI Adapters ----
    "acpAdapters": [ /* 见 §4.2 */ ],

    // ---- 2. MCP Servers（知识库 + 工具服务）----
    "mcpServers": [ /* 见 §4.3 */ ],

    // ---- 3. Assistants（自定义助手预设）----
    "assistants": [ /* 见 §4.4 */ ],

    // ---- 4. Skills（技能包）----
    "skills": [ /* 见 §4.5 */ ],

    // ---- 5. Channel Plugins（聊天机器人平台）----
    "channelPlugins": [ /* 见 §4.6 */ ],

    // ---- 6. WebUI Extensions（Web 层扩展）----
    "webui": { /* 见 §4.7 */ },

    // ---- 7. Themes（CSS 主题）----
    "themes": [ /* 见 §4.8 */ ]
  }
}
```

### 4.2 ACP CLI Adapters

声明外部 CLI Agent，供 `AcpDetector` 检测和 `AcpAgentManager` 使用。

```jsonc
{
  "id": "internal-copilot",                // 唯一标识
  "name": "Internal Copilot",
  "nameI18n": { "zh-CN": "内部 Copilot" },
  "cliCommand": "icopilot",               // CLI 命令名
  "defaultCliPath": "icopilot",            // 默认路径
  "acpArgs": ["--acp"],                    // ACP 协议参数
  "env": {                                 // 环境变量
    "COPILOT_MODE": "enterprise"
  },
  "icon": "./icons/copilot.svg",
  "authRequired": false,
  "supportsStreaming": false,
  "yoloMode": {
    "type": "session",
    "sessionMode": "auto"
  },
  "healthCheck": {
    "versionCommand": "icopilot --version",
    "timeout": 3000
  }
}
```

**映射关系**：`ExtAcpAdapter` → `AcpBackendConfig`（添加 `_source: 'extension'`）

### 4.3 MCP Servers

声明 MCP 服务（知识库、工具服务等），注入 `McpService` 管理。

```jsonc
[
  {
    "name": "enterprise-docs",
    "description": "Internal documentation knowledge base",
    "transport": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@company/docs-mcp"],
      "env": { "API_KEY": "${env:COMPANY_DOCS_KEY}" }
    },
    "enabled": true
  },
  {
    "name": "internal-db-query",
    "description": "Internal database query service",
    "transport": {
      "type": "streamable_http",
      "url": "https://mcp.internal.company.com/db",
      "headers": {
        "Authorization": "Bearer ${env:INTERNAL_TOKEN}"
      }
    },
    "enabled": true
  }
]
```

**映射关系**：`ExtMcpServer` → `IMcpServer`

**环境变量模板**：`${env:VAR_NAME}` 在加载时被解析为 `process.env[VAR_NAME]`。

### 4.4 Assistants

声明自定义助手预设，作为 preset assistant 注入。

```jsonc
{
  "id": "code-reviewer",
  "name": "Code Reviewer",
  "nameI18n": { "zh-CN": "代码审查助手" },
  "description": "Code review with enterprise standards",
  "descriptionI18n": { "zh-CN": "基于企业标准的代码审查" },
  "avatar": "🔍",
  "presetAgentType": "gemini",             // "gemini" | "claude" | "codex" | "opencode"
  "contextFile": "./prompts/code-reviewer.md",
  "contextFileI18n": {
    "zh-CN": "./prompts/code-reviewer.zh-CN.md"
  },
  "enabledSkills": ["enterprise-standards"],
  "prompts": ["Review the latest PR", "Check compliance"],
  "promptsI18n": {
    "zh-CN": ["审查最新 PR", "检查合规性"]
  }
}
```

**映射关系**：`ExtAssistant` → `AcpBackendConfig`（`isPreset: true`）

**contextFile**：相对于扩展目录的 Markdown 文件，读取后填充到 `context` 字段。支持 i18n 版本。

### 4.5 Skills

声明技能包，注入 `AcpSkillManager`。

```jsonc
{
  "name": "enterprise-standards",
  "description": "Enterprise coding standards and review checklist",
  "file": "./skills/enterprise-standards/SKILL.md"
}
```

**映射关系**：与内置 `skills/` 目录下的 SKILL.md 格式一致。

### 4.6 Channel Plugins

声明聊天机器人平台插件，动态注册到 `ChannelManager` / `PluginManager`。

```jsonc
{
  "type": "dingtalk",                      // 新增平台类型
  "name": "DingTalk Bot",
  "nameI18n": { "zh-CN": "钉钉机器人" },
  "description": "DingTalk group bot integration",
  "entryPoint": "./plugins/dingtalk/index.js",
  "credentialFields": [
    { "key": "appKey", "label": "App Key", "type": "text", "required": true },
    { "key": "appSecret", "label": "App Secret", "type": "password", "required": true }
  ],
  "configFields": [
    {
      "key": "mode",
      "label": "Mode",
      "type": "select",
      "options": ["webhook", "websocket"],
      "default": "webhook"
    }
  ]
}
```

**entryPoint**：必须导出一个继承 `BasePlugin` 的类。详见 [RFC-003](./RFC-003-channel-plugin-extension.md)。

**credentialFields / configFields**：声明式 UI 表单定义，设置页面自动渲染。

### 4.7 WebUI Extensions

声明 Web 层扩展能力：API 路由、WebSocket 处理器、中间件、静态资源。

```jsonc
{
  "apiRoutes": [
    {
      "path": "/api/ext/knowledge",
      "entryPoint": "./webui/routes/knowledge.js",
      "description": "Knowledge base search API",
      "auth": true
    }
  ],
  "wsHandlers": [
    {
      "namespace": "ext:knowledge",
      "entryPoint": "./webui/ws/knowledge-handler.js",
      "description": "Real-time knowledge search via WebSocket"
    }
  ],
  "middleware": [
    {
      "entryPoint": "./webui/middleware/audit-log.js",
      "description": "Enterprise audit logging",
      "applyTo": "/api/**",
      "order": "before"
    }
  ],
  "staticAssets": [
    {
      "urlPrefix": "/ext/dashboard",
      "directory": "./webui/static/dashboard",
      "description": "Custom admin dashboard"
    }
  ]
}
```

**安全隔离规则**：
- API 路由强制 `/api/ext/` 前缀
- WS 命名空间强制 `ext:` 前缀
- 静态资源强制 `/ext/` 前缀
- 默认需要鉴权（`auth: true`）

详见 [RFC-004](./RFC-004-webui-extension.md)。

### 4.8 Themes

声明 CSS 主题（未来实现）。

```jsonc
{
  "id": "corporate-dark",
  "name": "Corporate Dark",
  "file": "./themes/corporate-dark.css"
}
```

---

## 5. 扩展加载架构

### 5.1 扩展来源（优先级从高到低）

```
┌──────────────────────────────────────────────────────────────┐
│  Priority 1: Built-in（源码内置，不可覆盖）                     │
│  ACP_BACKENDS_ALL, ASSISTANT_PRESETS, built-in skills/,       │
│  registerPlugin('telegram'/'lark'), 内置路由                   │
├──────────────────────────────────────────────────────────────┤
│  Priority 2: Local Extensions                                 │
│  ~/.aionui/extensions/*/aion-extension.json                   │
│  <appData>/AionUI/extensions/*/aion-extension.json            │
├──────────────────────────────────────────────────────────────┤
│  Priority 3: Environment Extensions                           │
│  AIONUI_EXTENSIONS_PATH 环境变量指定的路径（; 或 : 分隔）        │
├──────────────────────────────────────────────────────────────┤
│  Priority 4: UI Configured（用户手动配置）                     │
│  ConfigStorage → acp.customAgents, mcp.config                 │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 初始化时序

```
应用启动
  │
  ├─1→ ExtensionLoader.loadAll()
  │    ├── 扫描 ~/.aionui/extensions/*/
  │    ├── 扫描 <appData>/AionUI/extensions/*/
  │    ├── 扫描 AIONUI_EXTENSIONS_PATH 各路径
  │    ├── 读取每个目录下的 aion-extension.json
  │    ├── EnvResolver 处理 ${env:} 模板
  │    └── Zod schema 验证
  │
  ├─2→ ExtensionRegistry.initialize()
  │    ├── AcpAdapterResolver   → registry.acpAdapters
  │    ├── McpServerResolver    → registry.mcpServers
  │    ├── AssistantResolver    → registry.assistants
  │    ├── SkillResolver        → registry.skills
  │    ├── ChannelPluginResolver→ registry.channelPlugins
  │    └── (WebUI 延迟到 WebServer 启动时)
  │
  ├─3→ AcpDetector.initialize()
  │    └── 合并 内置 + registry.acpAdapters → 检测 CLI
  │
  ├─4→ ChannelManager.initialize()
  │    ├── registerPlugin('telegram', TelegramPlugin)  ← 内置
  │    ├── registerPlugin('lark', LarkPlugin)           ← 内置
  │    └── registry.channelPlugins.forEach(registerPlugin)  ← 扩展
  │
  ├─5→ startWebServer() (如果启用)
  │    ├── 常规中间件、路由
  │    ├── WebuiResolver → 注册扩展 API/WS/Static/Middleware
  │    └── 错误处理（最后）
  │
  └─6→ 前端渲染 → 展示所有 Agent、助手、MCP、Skills
```

### 5.3 冲突解决规则

- **同 ID 冲突**：内置优先，忽略扩展中的重复 ID 并输出警告日志
- **路由冲突**：先注册者优先（扫描顺序 = 目录名字典序）
- **WS 命名空间冲突**：先注册者优先，后续注册被拒绝并记录警告

---

## 6. 核心模块设计

### 6.1 目录结构

```
src/extensions/
├── types.ts                          # Zod schema + TypeScript 类型
├── constants.ts                      # 环境变量名、目录路径常量
├── envResolver.ts                    # ${env:VAR_NAME} 模板处理
├── ExtensionLoader.ts                # 文件系统扫描 + JSON 读取 + Zod 验证
├── ExtensionRegistry.ts              # 统一注册表（单例）
├── resolvers/
│   ├── AcpAdapterResolver.ts         # → AcpBackendConfig[]
│   ├── McpServerResolver.ts          # → IMcpServer[]
│   ├── AssistantResolver.ts          # → AcpBackendConfig[] (isPreset)
│   ├── SkillResolver.ts              # → SkillDefinition[]
│   ├── ChannelPluginResolver.ts      # → Map<type, PluginConstructor>
│   ├── WebuiResolver.ts              # → Express Router/Middleware/Static
│   └── ThemeResolver.ts              # → ICssTheme[] (未来)
└── index.ts                          # 模块导出
```

### 6.2 关键类型定义 (`types.ts`)

```typescript
import { z } from 'zod';

// ---- 元信息 ----
export const ExtensionMetaSchema = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/),
  displayName: z.string(),
  displayNameI18n: z.record(z.string()).optional(),
  version: z.string(),
  description: z.string().optional(),
  descriptionI18n: z.record(z.string()).optional(),
  author: z.string().optional(),
  icon: z.string().optional(),
  homepage: z.string().url().optional(),
});

// ---- ACP Adapter ----
export const ExtAcpAdapterSchema = z.object({
  id: z.string(),
  name: z.string(),
  nameI18n: z.record(z.string()).optional(),
  cliCommand: z.string(),
  defaultCliPath: z.string().optional(),
  acpArgs: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  icon: z.string().optional(),
  authRequired: z.boolean().optional(),
  supportsStreaming: z.boolean().optional(),
  yoloMode: z.object({
    type: z.enum(['session', 'global']),
    sessionMode: z.string().optional(),
  }).optional(),
  healthCheck: z.object({
    versionCommand: z.string(),
    timeout: z.number().optional(),
  }).optional(),
});

// ---- MCP Server ----
export const ExtMcpTransportSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('stdio'),
    command: z.string(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
  }),
  z.object({
    type: z.literal('sse'),
    url: z.string(),
    headers: z.record(z.string()).optional(),
  }),
  z.object({
    type: z.literal('http'),
    url: z.string(),
    headers: z.record(z.string()).optional(),
  }),
  z.object({
    type: z.literal('streamable_http'),
    url: z.string(),
    headers: z.record(z.string()).optional(),
  }),
]);

export const ExtMcpServerSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  transport: ExtMcpTransportSchema,
  enabled: z.boolean().default(true),
});

// ---- Assistant ----
export const ExtAssistantSchema = z.object({
  id: z.string(),
  name: z.string(),
  nameI18n: z.record(z.string()).optional(),
  description: z.string().optional(),
  descriptionI18n: z.record(z.string()).optional(),
  avatar: z.string().optional(),
  presetAgentType: z.enum(['gemini', 'claude', 'codex', 'opencode']),
  contextFile: z.string(),
  contextFileI18n: z.record(z.string()).optional(),
  models: z.array(z.string()).optional(),
  enabledSkills: z.array(z.string()).optional(),
  prompts: z.array(z.string()).optional(),
  promptsI18n: z.record(z.array(z.string())).optional(),
});

// ---- Skill ----
export const ExtSkillSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  file: z.string(),
});

// ---- Credential/Config Field (for Channel Plugins) ----
export const ExtFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(['text', 'password', 'select', 'number', 'boolean']),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

// ---- Channel Plugin ----
export const ExtChannelPluginSchema = z.object({
  type: z.string(),
  name: z.string(),
  nameI18n: z.record(z.string()).optional(),
  description: z.string().optional(),
  entryPoint: z.string(),
  credentialFields: z.array(ExtFieldSchema).optional(),
  configFields: z.array(ExtFieldSchema).optional(),
});

// ---- WebUI ----
export const ExtApiRouteSchema = z.object({
  path: z.string(),
  entryPoint: z.string(),
  description: z.string().optional(),
  auth: z.boolean().default(true),
});

export const ExtWsHandlerSchema = z.object({
  namespace: z.string(),
  entryPoint: z.string(),
  description: z.string().optional(),
});

export const ExtMiddlewareSchema = z.object({
  entryPoint: z.string(),
  description: z.string().optional(),
  applyTo: z.string().default('/**'),
  order: z.enum(['before', 'after']).default('before'),
});

export const ExtStaticAssetSchema = z.object({
  urlPrefix: z.string(),
  directory: z.string(),
  description: z.string().optional(),
});

export const ExtWebuiSchema = z.object({
  apiRoutes: z.array(ExtApiRouteSchema).optional(),
  wsHandlers: z.array(ExtWsHandlerSchema).optional(),
  middleware: z.array(ExtMiddlewareSchema).optional(),
  staticAssets: z.array(ExtStaticAssetSchema).optional(),
});

// ---- Theme ----
export const ExtThemeSchema = z.object({
  id: z.string(),
  name: z.string(),
  file: z.string(),
});

// ---- Contributes ----
export const ExtContributesSchema = z.object({
  acpAdapters: z.array(ExtAcpAdapterSchema).optional(),
  mcpServers: z.array(ExtMcpServerSchema).optional(),
  assistants: z.array(ExtAssistantSchema).optional(),
  skills: z.array(ExtSkillSchema).optional(),
  channelPlugins: z.array(ExtChannelPluginSchema).optional(),
  webui: ExtWebuiSchema.optional(),
  themes: z.array(ExtThemeSchema).optional(),
});

// ---- 完整清单 ----
export const ExtensionManifestSchema = ExtensionMetaSchema.extend({
  $schema: z.string().optional(),
  contributes: ExtContributesSchema,
});

export type ExtensionManifest = z.infer<typeof ExtensionManifestSchema>;
export type ExtAcpAdapter = z.infer<typeof ExtAcpAdapterSchema>;
export type ExtMcpServer = z.infer<typeof ExtMcpServerSchema>;
export type ExtAssistant = z.infer<typeof ExtAssistantSchema>;
export type ExtSkill = z.infer<typeof ExtSkillSchema>;
export type ExtChannelPlugin = z.infer<typeof ExtChannelPluginSchema>;
export type ExtWebuiConfig = z.infer<typeof ExtWebuiSchema>;
export type ExtTheme = z.infer<typeof ExtThemeSchema>;

// ---- 加载后的扩展实例 ----
export interface LoadedExtension {
  manifest: ExtensionManifest;
  directory: string;   // 扩展所在目录的绝对路径
  source: 'local' | 'env' | 'appdata';
}
```

### 6.3 环境变量模板 (`envResolver.ts`)

```typescript
/**
 * 解析 ${env:VAR_NAME} 模板，替换为对应环境变量值
 */
export function resolveEnvTemplates(value: string): string {
  return value.replace(/\$\{env:([^}]+)\}/g, (_match, varName) => {
    return process.env[varName] || '';
  });
}

/**
 * 递归处理对象中所有字符串值的环境变量模板
 */
export function resolveEnvInObject<T>(obj: T): T {
  if (typeof obj === 'string') return resolveEnvTemplates(obj) as T;
  if (Array.isArray(obj)) return obj.map(resolveEnvInObject) as T;
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, resolveEnvInObject(v)])
    ) as T;
  }
  return obj;
}
```

### 6.4 ExtensionLoader

```typescript
class ExtensionLoader {
  /**
   * 扫描所有扩展来源目录，加载并验证 aion-extension.json
   * @returns 已验证的 LoadedExtension[]
   */
  async loadAll(): Promise<LoadedExtension[]>;

  /**
   * 获取所有扫描目录
   * - ~/.aionui/extensions/
   * - <appData>/AionUI/extensions/
   * - AIONUI_EXTENSIONS_PATH 中的各路径
   */
  private getExtensionDirs(): Array<{ dir: string; source: LoadedExtension['source'] }>;

  /**
   * 扫描单个目录下的所有子目录，寻找 aion-extension.json
   */
  private async scanDirectory(baseDir: string, source: string): Promise<LoadedExtension[]>;

  /**
   * 读取并验证单个 aion-extension.json
   */
  private async loadManifest(extensionDir: string): Promise<ExtensionManifest | null>;
}
```

### 6.5 ExtensionRegistry（单例）

```typescript
class ExtensionRegistry {
  private static instance: ExtensionRegistry;
  private extensions: LoadedExtension[] = [];

  static getInstance(): ExtensionRegistry;

  /** 初始化：调用 ExtensionLoader 加载所有扩展 */
  async initialize(): Promise<void>;

  /** 获取所有已加载的扩展 */
  getLoadedExtensions(): LoadedExtension[];

  /** 获取所有扩展贡献的 ACP Adapters */
  getAcpAdapters(): AcpBackendConfig[];

  /** 获取所有扩展贡献的 MCP Servers */
  getMcpServers(): IMcpServer[];

  /** 获取所有扩展贡献的 Assistants */
  getAssistants(): AcpBackendConfig[];

  /** 获取所有扩展贡献的 Skills */
  getSkills(): SkillDefinition[];

  /** 获取所有扩展贡献的 Channel Plugins */
  getChannelPlugins(): Map<string, { constructor: PluginConstructor; meta: ExtChannelPlugin }>;

  /** 获取特定 Channel Plugin 的元数据（用于 UI 表单生成） */
  getChannelPluginMeta(type: string): ExtChannelPlugin | undefined;

  /** 获取所有扩展贡献的 WebUI 配置 */
  getWebuiContributions(): Array<{ config: ExtWebuiConfig; directory: string }>;
}
```

---

## 7. 与现有系统的集成策略

### 7.1 设计原则

**不重写现有系统**，扩展系统作为一个"供应层"注入到现有流程中。

### 7.2 集成点

| 现有系统 | 集成方式 | 修改量 |
|---------|---------|--------|
| `AcpDetector` | 启动时调用 `registry.getAcpAdapters()` 合并到检测列表 | 小 |
| `McpService` | 启动时调用 `registry.getMcpServers()` 合并到服务列表，UI 标记来源为 "extension" | 小 |
| `AssistantManagement` | `registry.getAssistants()` 返回 `AcpBackendConfig[]`（`isPreset=true`），与内置预设合并 | 小 |
| `AcpSkillManager` | `registry.getSkills()` 与内置 `skills/` 合并 | 小 |
| `ChannelManager` | 构造函数中遍历 `registry.getChannelPlugins()` 调用 `registerPlugin()` | 小 |
| `WebServer` | `startWebServer()` 中调用 `WebuiResolver` 注册扩展路由 | 中 |
| `WebSocketManager` | 添加 `registerNamespace()` 方法支持命名空间路由 | 中 |

### 7.3 类型修改

#### `src/types/acpTypes.ts`

```typescript
// 添加 _source 字段标记来源
interface AcpBackendConfig {
  // ... 现有字段 ...
  _source?: 'builtin' | 'extension' | 'user';
  _extensionName?: string;  // 来源扩展名
}
```

#### `src/channels/types.ts`

```typescript
// PluginType 从联合类型改为 string，保留内置类型作为常量
export type PluginType = string;

export const BUILTIN_PLUGIN_TYPES = ['telegram', 'slack', 'discord', 'lark'] as const;
export type BuiltinPluginType = (typeof BUILTIN_PLUGIN_TYPES)[number];
```

---

## 8. 安全设计

### 8.1 路由隔离

| 资源类型 | 前缀约束 | 说明 |
|---------|---------|------|
| API 路由 | `/api/ext/` | 不会覆盖内置 `/api/*` 路由 |
| WS 命名空间 | `ext:` | 不会覆盖内置消息类型 |
| 静态资源 | `/ext/` | 不会覆盖内置静态资源 |

### 8.2 鉴权

- 扩展 API 路由默认需要认证（`auth: true`）
- 除非显式声明 `"auth": false`，否则通过 `validateApiAccess` 中间件保护

### 8.3 沙箱边界

- Channel Plugin 和 WebUI 扩展通过 `require()` 加载 JS 模块，共享 Node.js 进程
- 命名空间隔离，但**不提供完全沙箱**（v1 不做 VM 隔离）
- 扩展目录只读访问内置资源
- 环境变量引用仅限 `${env:}` 语法，不能执行任意代码

### 8.4 验证

- 所有 `aion-extension.json` 必须通过 Zod schema 验证
- 无效清单被跳过并输出警告日志
- `entryPoint` 路径限制在扩展目录内（防止路径穿越）

---

## 9. 使用场景

### 9.1 企业统一分发

```
\\server\tools\aionui-extensions\enterprise-pack\
├── aion-extension.json
├── icon.svg
├── prompts/
│   ├── code-reviewer.md
│   └── code-reviewer.zh-CN.md
├── skills/
│   └── enterprise-deploy/SKILL.md
└── plugins/
    └── dingtalk/index.js
```

IT 通过组策略设置：
```bash
setx AIONUI_EXTENSIONS_PATH "\\server\tools\aionui-extensions"
```

**效果**：员工启动 AionUI 后，自动获得：
- Internal Copilot CLI Agent
- Enterprise docs 知识库（MCP Server）
- Code Reviewer 助手
- Enterprise Deploy Skill
- 钉钉机器人 Channel Plugin

### 9.2 开发者本地开发

```bash
mkdir -p ~/.aionui/extensions/my-test
# 编写 aion-extension.json
# 重启 AionUI 即可加载
```

### 9.3 未来：Web Marketplace

```
https://aionui.dev/extensions/awesome-pack
→ 点击安装 → 下载到 ~/.aionui/extensions/
→ 自动加载，无需重启（热加载）
```

---

## 10. 分阶段实施计划

| 阶段 | 内容 | 涉及字段 | 估计工作量 |
|------|------|---------|-----------|
| **Phase 1** | 核心框架 + 数据驱动能力 | `acpAdapters`, `mcpServers`, `assistants`, `skills` | 中 |
| **Phase 2** | Channel Plugin 动态加载 | `channelPlugins` | 中 |
| **Phase 3** | WebUI 扩展点 | `webui` | 中 |
| **Phase 4** | 主题 + Marketplace UI | `themes` + 在线安装/更新 | 低 |

详细任务分解见：
- [RFC-002: Phase 1 实施任务清单](./RFC-002-phase1-implementation.md)
- [RFC-003: Channel Plugin 扩展化设计](./RFC-003-channel-plugin-extension.md)
- [RFC-004: WebUI 扩展化设计](./RFC-004-webui-extension.md)

---

## 11. 与 Gemini Extension 的关系

| 扩展系统 | 范围 | 格式 | 加载位置 |
|---------|------|------|---------|
| `gemini-extension.json` | Gemini CLI Agent 专用 | JSON | `~/.gemini/extensions/` |
| `aion-extension.json` | AionUI 应用级统一扩展 | JSONC | `~/.aionui/extensions/` |

两套系统**并行不冲突**：
- Gemini Extension 由 Gemini Agent 加载（已有逻辑，不改）
- AionUI Extension 由 ExtensionRegistry 加载（新系统）

---

## 12. 涉及修改的完整文件清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新增 | `src/extensions/types.ts` | 所有扩展类型 + Zod schema |
| 新增 | `src/extensions/constants.ts` | 环境变量名、目录常量 |
| 新增 | `src/extensions/envResolver.ts` | `${env:}` 模板替换 |
| 新增 | `src/extensions/ExtensionLoader.ts` | 扫描 + 读取 + 验证 |
| 新增 | `src/extensions/ExtensionRegistry.ts` | 统一注册表（单例） |
| 新增 | `src/extensions/resolvers/AcpAdapterResolver.ts` | ACP adapter → `AcpBackendConfig` |
| 新增 | `src/extensions/resolvers/McpServerResolver.ts` | MCP server → `IMcpServer` |
| 新增 | `src/extensions/resolvers/AssistantResolver.ts` | Assistant → `AcpBackendConfig` |
| 新增 | `src/extensions/resolvers/SkillResolver.ts` | Skill → `SkillDefinition` |
| 新增 | `src/extensions/resolvers/ChannelPluginResolver.ts` | Channel Plugin 动态加载 |
| 新增 | `src/extensions/resolvers/WebuiResolver.ts` | WebUI 路由/WS/静态注册 |
| 新增 | `src/extensions/resolvers/ThemeResolver.ts` | Theme → CSS（未来） |
| 新增 | `src/extensions/index.ts` | 模块导出 |
| 新增 | `schemas/aion-extension-v1.json` | JSON Schema |
| 修改 | `src/types/acpTypes.ts` | 添加 `_source?`, `_extensionName?` 字段 |
| 修改 | `src/channels/types.ts` | `PluginType` 改为 `string` |
| 修改 | `src/agent/acp/AcpDetector.ts` | 集成 registry 的 adapter |
| 修改 | `src/process/services/mcpServices/McpService.ts` | 集成 registry 的 MCP |
| 修改 | `src/channels/core/ChannelManager.ts` | 集成 registry 的 channel plugins |
| 修改 | `src/webserver/index.ts` | 集成 WebuiResolver |
| 修改 | `src/webserver/websocket/WebSocketManager.ts` | 添加命名空间路由 |
| 修改 | `src/process/bridge/index.ts` | 启动时初始化 ExtensionRegistry |
| 修改 | `src/renderer/pages/settings/AssistantManagement.tsx` | 展示扩展助手 |

---

## 13. 未来扩展路线图

| 版本 | 内容 |
|------|------|
| **v1.0** | 核心框架 + ACP/MCP/Assistant/Skill 扩展 |
| **v1.1** | Channel Plugin 动态加载 |
| **v1.2** | WebUI 扩展点（API/WS/Middleware/Static） |
| **v2.0** | CSS Theme 扩展 + Extension Marketplace UI |
| **v2.1** | 热加载（watch 模式，无需重启） |
| **v2.2** | Extension API（扩展可调用 AionUI 内部 API） |
| **v3.0** | 沙箱隔离（VM2/Worker Thread） |

---

## 14. 设计改进记录（2026-02-17）

### 14.1 P0 级别改进

#### 14.1.1 环境变量严格模式

**问题**：`${env:VAR_NAME}` 未定义时静默替换为空字符串，导致配置错误难以调试。

**解决方案**：
- 新增 `AIONUI_STRICT_ENV` 环境变量
- 严格模式下未定义变量抛出 `UndefinedEnvVariableError`
- 增加汇总日志提示未定义变量

```typescript
// 启用严格模式
AIONUI_STRICT_ENV=1

// 代码中使用
const resolved = resolveEnvInObject(data, { strictMode: true });
```

#### 14.1.2 动态代码加载安全警告

**问题**：扩展代码在主进程中执行，无沙箱隔离，存在安全风险。

**解决方案**：
- 在 `ChannelPluginResolver` 和 `WebuiResolver` 添加安全警告文档
- 新增 `AIONUI_EXTENSION_DEBUG` 环境变量启用安全日志
- 加载外部代码时输出风险警告

```typescript
// 启用安全调试日志
AIONUI_EXTENSION_DEBUG=1
```

### 14.2 P1 级别改进

#### 14.2.1 presetAgentType 枚举化

**问题**：`presetAgentType` 使用任意字符串，缺乏类型安全。

**解决方案**：
- 改为枚举类型：`['gemini', 'claude', 'codex', 'codebuddy', 'opencode']`
- 导出 `PRESET_AGENT_TYPES` 常量供外部使用

#### 14.2.2 条件验证

**问题**：`connectionType=cli` 时无需 `endpoint`，`connectionType=websocket` 时需要 `endpoint`，但无验证。

**解决方案**：
- 添加 `refine` 验证逻辑
- CLI 适配器需要 `cliCommand` 或 `defaultCliPath`
- WebSocket/HTTP 适配器需要 `endpoint`

#### 14.2.3 ID 唯一性验证

**问题**：同一扩展内可能有重复的 ID，导致运行时冲突。

**解决方案**：
- 添加 `validateContributeIds` 函数验证所有贡献项 ID 唯一性
- 覆盖：ACP adapter ID、Assistant ID、MCP server name、Skill name、Channel plugin type、Theme ID、WebUI 路由路径、WS 命名空间

### 14.3 P2 级别改进

#### 14.3.1 生命周期管理

**问题**：无法在运行时禁用/启用扩展。

**解决方案**：
- `ExtensionRegistry` 新增 `disableExtension(name)` 和 `enableExtension(name)` 方法
- 维护 `extensionStates: Map<string, ExtensionState>` 跟踪状态
- 禁用后自动重新解析贡献项

```typescript
const registry = ExtensionRegistry.getInstance();

// 禁用扩展
registry.disableExtension('my-extension', 'Security concern');

// 启用扩展
registry.enableExtension('my-extension');

// 查询状态
const state = registry.getExtensionState('my-extension');
```

#### 14.3.2 依赖管理

**问题**：无扩展间依赖声明和版本兼容性检查。

**解决方案**：
- 新增 `dependencies` 字段：`{ extensionName: "^1.0.0" }`
- 新增 `engine` 字段声明 AionUI 版本兼容性
- 新增 `dependencyResolver.ts` 模块：
  - 版本范围检查（支持 `^` 和 `~`）
  - 循环依赖检测
  - 拓扑排序确定加载顺序

```jsonc
{
  "name": "my-extension",
  "dependencies": {
    "base-utils": "^1.0.0",
    "shared-skills": "~2.1.0"
  },
  "engine": {
    "aionui": "^1.2.0"
  }
}
```

#### 14.3.3 热重载

**问题**：开发扩展时需要重启应用才能看到更改。

**解决方案**：
- 新增 `ExtensionWatcher` 类实现文件监听
- 监听扩展目录的增删和 `aion-extension.json` 变更
- 使用防抖机制避免频繁重载
- 默认仅在开发环境启用

```typescript
import { ExtensionWatcher } from './extensions';

const watcher = new ExtensionWatcher({ enableInProduction: true });
watcher.onReload((extensions) => {
  console.log('Extensions reloaded:', extensions.length);
});
watcher.start();
```

### 14.4 新增文件清单

| 文件 | 说明 |
|------|------|
| `src/extensions/dependencyResolver.ts` | 依赖验证和拓扑排序 |
| `src/extensions/hotReload.ts` | 文件监听和热重载 |

### 14.5 变更汇总

| 类型 | 文件 | 变更内容 |
|------|------|---------|
| 修改 | `src/extensions/types.ts` | 枚举类型、条件验证、ID 唯一性、依赖字段 |
| 修改 | `src/extensions/envResolver.ts` | 严格模式、错误类型 |
| 修改 | `src/extensions/constants.ts` | 新增环境变量常量 |
| 修改 | `src/extensions/ExtensionLoader.ts` | 选项配置、错误处理 |
| 修改 | `src/extensions/ExtensionRegistry.ts` | 生命周期管理 |
| 修改 | `src/extensions/resolvers/ChannelPluginResolver.ts` | 安全警告 |
| 修改 | `src/extensions/resolvers/WebuiResolver.ts` | 安全警告 |
| 修改 | `src/extensions/index.ts` | 导出新模块 |
| 修改 | `schemas/aion-extension-v1.json` | 新增依赖字段、改进约束 |
