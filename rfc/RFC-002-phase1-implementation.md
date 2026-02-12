# RFC-002: Phase 1 实施任务清单

- **Status**: Draft
- **Date**: 2026-02-13
- **Parent**: [RFC-001: 统一扩展系统](./RFC-001-unified-extension-system.md)
- **Scope**: `acpAdapters`, `mcpServers`, `assistants`, `skills` — 纯数据驱动的 4 种能力

---

## 1. 概述

Phase 1 实现扩展系统的核心框架和 4 种纯数据驱动的能力（不涉及 JS 模块动态加载）。这些能力只需读取 JSON 配置并转换为内部类型，是最安全、最易实现的部分。

---

## 2. 任务分解

### Task 1: 基础设施 — 类型与常量

**新增文件**：

#### 1.1 `src/extensions/types.ts`

- 定义 `ExtensionManifest` 及所有子类型的 Zod schema
- 导出 TypeScript 推导类型
- 包含 `LoadedExtension` 接口
- 参考 RFC-001 §6.2 中的完整 schema 定义

#### 1.2 `src/extensions/constants.ts`

```typescript
// 环境变量名
export const AIONUI_EXTENSIONS_PATH = 'AIONUI_EXTENSIONS_PATH';

// 扩展清单文件名
export const EXTENSION_MANIFEST_FILE = 'aion-extension.json';

// 默认扩展目录名
export const EXTENSIONS_DIR_NAME = 'extensions';

// 用户级扩展目录 (~/.aionui/extensions/)
export function getUserExtensionsDir(): string;

// 应用数据级扩展目录 (<appData>/AionUI/extensions/)
export function getAppDataExtensionsDir(): string;

// 路径分隔符（Windows: ;, Unix: :）
export const PATH_SEPARATOR = process.platform === 'win32' ? ';' : ':';
```

**验收标准**：
- [ ] 所有 Zod schema 能正确验证有效/无效的 `aion-extension.json`
- [ ] 路径常量在 Windows/macOS/Linux 上正确工作

---

### Task 2: 基础设施 — 环境变量模板解析器

**新增文件**：

#### 2.1 `src/extensions/envResolver.ts`

功能：
- `resolveEnvTemplates(value: string): string` — 解析单个字符串中的 `${env:VAR_NAME}`
- `resolveEnvInObject<T>(obj: T): T` — 递归处理对象中所有字符串值
- 未定义的环境变量替换为空字符串，输出 warning 日志

**验收标准**：
- [ ] `${env:HOME}` 被替换为实际值
- [ ] `${env:UNDEFINED_VAR}` 被替换为空字符串，有 warning 日志
- [ ] 嵌套对象/数组中的模板全部被处理
- [ ] 非字符串值（number, boolean, null）不受影响

---

### Task 3: 基础设施 — ExtensionLoader

**新增文件**：

#### 3.1 `src/extensions/ExtensionLoader.ts`

核心流程：
```
loadAll()
  ├── getExtensionDirs()        → 收集所有扫描目录
  ├── scanDirectory(dir)        → 扫描子目录，寻找 aion-extension.json
  │     ├── fs.readdir()
  │     ├── JSON.parse() (JSONC 支持)
  │     ├── EnvResolver         → 处理 ${env:} 模板
  │     └── Zod.safeParse()     → 验证
  └── 返回 LoadedExtension[]
```

关键设计决策：
- **JSONC 解析**：使用 `strip-json-comments` 或手动去除注释后 `JSON.parse()`
- **错误处理**：单个扩展加载失败不影响其他扩展，记录 warning 日志
- **去重**：同 `name` 的扩展只保留优先级最高的

**验收标准**：
- [ ] 能扫描 `~/.aionui/extensions/` 目录
- [ ] 能扫描 `<appData>/AionUI/extensions/` 目录
- [ ] 能扫描 `AIONUI_EXTENSIONS_PATH` 环境变量指定的路径
- [ ] JSONC 注释被正确处理
- [ ] 无效 JSON 文件被跳过并记录 warning
- [ ] schema 验证失败被跳过并记录 warning
- [ ] 同名扩展按优先级去重

---

### Task 4: 基础设施 — ExtensionRegistry（单例）

**新增文件**：

#### 4.1 `src/extensions/ExtensionRegistry.ts`

职责：
- 持有所有 `LoadedExtension` 实例
- 通过各 Resolver 提供类型安全的查询 API
- 单例模式，全局共享

API 设计：
```typescript
class ExtensionRegistry {
  static getInstance(): ExtensionRegistry;

  async initialize(): Promise<void>;
  getLoadedExtensions(): LoadedExtension[];
  getAcpAdapters(): AcpBackendConfig[];
  getMcpServers(): IMcpServer[];
  getAssistants(): AcpBackendConfig[];
  getSkills(): SkillDefinition[];
  // Phase 2+
  getChannelPlugins(): Map<string, { constructor: PluginConstructor; meta: ExtChannelPlugin }>;
  getChannelPluginMeta(type: string): ExtChannelPlugin | undefined;
  getWebuiContributions(): Array<{ config: ExtWebuiConfig; directory: string }>;
}
```

**验收标准**：
- [ ] 单例模式正确工作
- [ ] `initialize()` 调用 ExtensionLoader 并存储结果
- [ ] 各 getter 方法返回正确的转换结果

---

### Task 5: Resolver — AcpAdapterResolver

**新增文件**：

#### 5.1 `src/extensions/resolvers/AcpAdapterResolver.ts`

映射规则：

| ExtAcpAdapter 字段 | AcpBackendConfig 字段 | 转换逻辑 |
|-------------------|----------------------|---------|
| `id` | `id` | 直接映射 |
| `name` | `name` | 直接映射 |
| `nameI18n` | `nameI18n` | 直接映射 |
| `cliCommand` | `cliCommand` | 直接映射 |
| `defaultCliPath` | `defaultCliPath` | 直接映射 |
| `acpArgs` | `acpArgs` | 直接映射 |
| `env` | `env` | EnvResolver 处理后映射 |
| `icon` | `avatar` | 转为绝对路径 |
| `authRequired` | `authRequired` | 直接映射 |
| `supportsStreaming` | `supportsStreaming` | 默认 `false` |
| — | `isPreset` | 固定 `false` |
| — | `isBuiltin` | 固定 `false` |
| — | `enabled` | 固定 `true` |
| — | `_source` | 固定 `'extension'` |

**验收标准**：
- [ ] 转换后的 `AcpBackendConfig` 能被 `AcpDetector` 正确识别
- [ ] `env` 中的 `${env:}` 模板被正确解析
- [ ] `icon` 相对路径转为绝对路径

---

### Task 6: Resolver — McpServerResolver

**新增文件**：

#### 6.1 `src/extensions/resolvers/McpServerResolver.ts`

映射规则：

| ExtMcpServer 字段 | IMcpServer 字段 | 转换逻辑 |
|------------------|----------------|---------|
| `name` | `name` | 直接映射 |
| — | `id` | 生成 `ext-${extensionName}-${name}` |
| `description` | `description` | 直接映射 |
| `transport` | `transport` | 映射到对应的 `IMcpServerTransport` 联合类型 |
| `enabled` | `enabled` | 默认 `true` |
| — | `createdAt` | 扩展加载时间戳 |
| — | `updatedAt` | 扩展加载时间戳 |
| — | `originalJson` | 原始 JSON 字符串 |

Transport 映射：

| ExtMcpServer.transport.type | IMcpServerTransport 类型 |
|----------------------------|------------------------|
| `stdio` | `IMcpServerTransportStdio` |
| `sse` | `IMcpServerTransportSSE` |
| `http` | `IMcpServerTransportHTTP` |
| `streamable_http` | `IMcpServerTransportStreamableHTTP` |

**验收标准**：
- [ ] 4 种 transport 类型全部正确映射
- [ ] `transport.env` 和 `transport.headers` 中的 `${env:}` 模板被解析
- [ ] 生成的 `IMcpServer` 能被 `McpService` 正确管理

---

### Task 7: Resolver — AssistantResolver

**新增文件**：

#### 7.1 `src/extensions/resolvers/AssistantResolver.ts`

映射规则：

| ExtAssistant 字段 | AcpBackendConfig 字段 | 转换逻辑 |
|------------------|----------------------|---------|
| `id` | `id` | 添加 `ext-` 前缀 |
| `name` | `name` | 直接映射 |
| `nameI18n` | `nameI18n` | 直接映射 |
| `description` | `description` | 直接映射 |
| `descriptionI18n` | `descriptionI18n` | 直接映射 |
| `avatar` | `avatar` | 直接映射 |
| `presetAgentType` | `presetAgentType` | 直接映射 |
| `contextFile` | `context` | **读取文件内容**填充 |
| `contextFileI18n` | `contextI18n` | 各语言分别读取文件内容 |
| `models` | `models` | 直接映射 |
| `enabledSkills` | `enabledSkills` | 直接映射 |
| `prompts` | `prompts` | 直接映射 |
| `promptsI18n` | `promptsI18n` | 直接映射 |
| — | `isPreset` | 固定 `true` |
| — | `isBuiltin` | 固定 `false` |
| — | `_source` | 固定 `'extension'` |

关键逻辑：
- `contextFile` 是相对路径，需要 `path.resolve(extensionDir, contextFile)` 后读取文件内容
- 支持 i18n：根据当前语言选择对应的 `contextFileI18n[locale]`，fallback 到 `contextFile`

**验收标准**：
- [ ] `contextFile` 的 Markdown 内容被正确读取并填充到 `context`
- [ ] `contextFileI18n` 按语言正确读取
- [ ] 文件不存在时 graceful fallback，输出 warning

---

### Task 8: Resolver — SkillResolver

**新增文件**：

#### 8.1 `src/extensions/resolvers/SkillResolver.ts`

映射规则：

| ExtSkill 字段 | 内部表示 | 转换逻辑 |
|-------------|---------|---------|
| `name` | skill name | 直接映射 |
| `description` | skill description | 直接映射 |
| `file` | SKILL.md 绝对路径 | `path.resolve(extensionDir, file)` |

需要与 `AcpSkillManager` 的 `loadSkillFromDirectory()` 兼容。

**验收标准**：
- [ ] 扩展 skill 的 SKILL.md 被正确定位
- [ ] 与内置 `skills/` 目录下的 skill 合并时不冲突
- [ ] 无效路径被跳过并记录 warning

---

### Task 9: 集成 — AcpDetector 修改

**修改文件**：`src/agent/acp/AcpDetector.ts`

修改内容：
```typescript
// 在现有的 backends 列表构建逻辑后，追加扩展的 adapters
const extensionAdapters = ExtensionRegistry.getInstance().getAcpAdapters();
allBackends = [...builtinBackends, ...extensionAdapters];
```

注意事项：
- 确保扩展 adapter 的 `id` 不与内置 `ACP_BACKENDS_ALL` 的 key 重复
- 重复时跳过扩展版本，输出 warning

**验收标准**：
- [ ] 扩展的 CLI adapter 出现在 Agent 选择列表中
- [ ] 扩展 adapter 的健康检查（`healthCheck.versionCommand`）正常工作
- [ ] 与内置 backend ID 冲突时，内置优先

---

### Task 10: 集成 — McpService 修改

**修改文件**：`src/process/services/mcpServices/McpService.ts`

修改内容：
- 在加载用户配置的 MCP servers 后，合并扩展贡献的 MCP servers
- 前端 UI 中标记来源为 "Extension: {extensionName}"

```typescript
const extensionMcpServers = ExtensionRegistry.getInstance().getMcpServers();
// 合并到 allServers，标记来源
```

**验收标准**：
- [ ] 扩展的 MCP server 出现在 MCP 管理页面
- [ ] 来自扩展的 MCP server 标记为 "extension" 来源
- [ ] 可正常连接和测试扩展的 MCP server

---

### Task 11: 集成 — AssistantManagement 修改

**修改文件**：`src/renderer/pages/settings/AssistantManagement.tsx` + 相关 hooks

修改内容：
- 合并扩展贡献的助手到 preset assistants 列表
- UI 中标记为 "Extension: {extensionName}"

**验收标准**：
- [ ] 扩展助手出现在助手管理页面的 "预设助手" 区域
- [ ] 扩展助手的 context（从 Markdown 文件加载）正常工作
- [ ] 扩展助手的 i18n 显示正确

---

### Task 12: 集成 — 应用启动初始化

**修改文件**：`src/process/bridge/index.ts`

修改内容：
- 在应用启动早期调用 `ExtensionRegistry.getInstance().initialize()`
- 在各子系统初始化之前完成扩展加载

```typescript
// process/bridge/index.ts
import { ExtensionRegistry } from '../extensions';

// 在现有初始化逻辑之前
await ExtensionRegistry.getInstance().initialize();
```

**验收标准**：
- [ ] 应用启动时正确扫描和加载扩展
- [ ] 扩展加载失败不阻止应用启动
- [ ] 启动日志中输出加载的扩展列表

---

### Task 13: 模块导出 + JSON Schema

**新增文件**：

#### 13.1 `src/extensions/index.ts`

```typescript
export { ExtensionRegistry } from './ExtensionRegistry';
export { ExtensionLoader } from './ExtensionLoader';
export type { ExtensionManifest, LoadedExtension, /* ... */ } from './types';
```

#### 13.2 `schemas/aion-extension-v1.json`

- 从 Zod schema 导出 JSON Schema（使用 `zod-to-json-schema`）
- 或手动编写等效的 JSON Schema
- 发布后可通过 `$schema` 字段在 VS Code 中获得自动补全

**验收标准**：
- [ ] 在 VS Code 中编写 `aion-extension.json` 时有自动补全
- [ ] JSON Schema 验证与 Zod schema 一致

---

## 3. 依赖关系图

```
Task 1 (types + constants)
  ├── Task 2 (envResolver)
  │     └── Task 3 (ExtensionLoader)
  │           └── Task 4 (ExtensionRegistry)
  │                 ├── Task 5 (AcpAdapterResolver)
  │                 ├── Task 6 (McpServerResolver)
  │                 ├── Task 7 (AssistantResolver)
  │                 └── Task 8 (SkillResolver)
  │
  └── Task 9-11 (集成修改，依赖 Task 4 + 对应 Resolver)
        └── Task 12 (启动初始化，依赖 Task 4)
              └── Task 13 (导出 + Schema)
```

---

## 4. 测试策略

### 4.1 单元测试

| 模块 | 测试重点 |
|------|---------|
| `envResolver` | 模板替换、嵌套对象、未定义变量、非字符串值 |
| `ExtensionLoader` | 有效/无效 JSON、JSONC 注释、空目录、权限错误 |
| `AcpAdapterResolver` | 字段映射、env 模板、icon 路径 |
| `McpServerResolver` | 4 种 transport 映射、env 模板 |
| `AssistantResolver` | contextFile 读取、i18n fallback |
| `SkillResolver` | 路径解析、无效路径 |

### 4.2 集成测试

创建一个测试用的扩展包，验证端到端流程：

```
tests/fixtures/test-extension/
├── aion-extension.json
├── prompts/
│   └── test-assistant.md
└── skills/
    └── test-skill/SKILL.md
```

测试场景：
1. 扫描发现测试扩展
2. 各 Resolver 正确转换
3. AcpDetector 能检测到扩展 adapter
4. McpService 管理扩展 MCP server
5. 助手列表包含扩展助手

---

## 5. 涉及文件清单

| 操作 | 文件 | Task |
|------|------|------|
| 新增 | `src/extensions/types.ts` | 1 |
| 新增 | `src/extensions/constants.ts` | 1 |
| 新增 | `src/extensions/envResolver.ts` | 2 |
| 新增 | `src/extensions/ExtensionLoader.ts` | 3 |
| 新增 | `src/extensions/ExtensionRegistry.ts` | 4 |
| 新增 | `src/extensions/resolvers/AcpAdapterResolver.ts` | 5 |
| 新增 | `src/extensions/resolvers/McpServerResolver.ts` | 6 |
| 新增 | `src/extensions/resolvers/AssistantResolver.ts` | 7 |
| 新增 | `src/extensions/resolvers/SkillResolver.ts` | 8 |
| 新增 | `src/extensions/index.ts` | 13 |
| 新增 | `schemas/aion-extension-v1.json` | 13 |
| 修改 | `src/types/acpTypes.ts` | 9 |
| 修改 | `src/agent/acp/AcpDetector.ts` | 9 |
| 修改 | `src/process/services/mcpServices/McpService.ts` | 10 |
| 修改 | `src/renderer/pages/settings/AssistantManagement.tsx` | 11 |
| 修改 | `src/process/bridge/index.ts` | 12 |
| 新增 | `tests/fixtures/test-extension/aion-extension.json` | 测试 |
| 新增 | `tests/extensions/` | 测试 |

---

## 6. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| JSONC 解析库引入 | 包体积增加 | `strip-json-comments` 仅 ~1KB |
| 扩展文件系统扫描性能 | 启动变慢 | 并行扫描 + 缓存已加载结果 |
| `AcpBackendConfig` 类型变更 | 影响现有逻辑 | `_source` 为可选字段，不影响现有代码 |
| 环境变量泄露 | 安全风险 | `${env:}` 仅在加载时解析，不存入持久化存储 |
