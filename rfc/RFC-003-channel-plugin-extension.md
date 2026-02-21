# RFC-003: Channel Plugin 扩展化设计

- **Status**: Implemented
- **Date**: 2026-02-13
- **Parent**: [RFC-001: 统一扩展系统](./RFC-001-unified-extension-system.md)
- **Phase**: Phase 2

---

## 1. 概述

本 RFC 详细描述如何将 Channel Plugin（聊天机器人平台集成）从硬编码注册改为支持外部扩展动态加载。

---

## 2. 现有架构分析

### 2.1 当前代码结构

```
src/channels/
├── core/
│   └── ChannelManager.ts        # 顶层编排器（单例）
├── gateway/
│   ├── PluginManager.ts         # 插件生命周期管理
│   └── ActionExecutor.ts        # 消息路由（Chat/System/Platform Actions）
├── plugins/
│   ├── BasePlugin.ts            # 抽象基类
│   ├── index.ts                 # 导出 registerPlugin、pluginRegistry
│   ├── telegram/
│   │   └── TelegramPlugin.ts
│   └── lark/
│       └── LarkPlugin.ts
├── actions/
│   ├── ChatActions.ts
│   ├── SystemActions.ts
│   └── PlatformActions.ts
├── agent/
│   └── ChannelMessageService.ts # 消息处理服务
├── session/
│   └── SessionManager.ts
└── types.ts                     # PluginType 联合类型等
```

### 2.2 当前注册流程

```typescript
// channels/plugins/index.ts
const pluginRegistry: Map<PluginType, PluginConstructor> = new Map();

export function registerPlugin(type: PluginType, constructor: PluginConstructor): void {
  pluginRegistry.set(type, constructor);
}

// channels/core/ChannelManager.ts — 构造函数
registerPlugin('telegram', TelegramPlugin);
registerPlugin('lark', LarkPlugin);
```

### 2.3 痛点

1. `PluginType` 是硬编码联合类型 `'telegram' | 'slack' | 'discord' | 'lark'`
2. 添加新平台需要修改 3+ 个源码文件
3. 无法在不修改源码的情况下支持钉钉、企业微信、Slack 等新平台
4. `IPluginCredentials` 是固定字段，无法适配新平台的认证需求

---

## 3. 设计方案

### 3.1 核心改动：开放 PluginType

```typescript
// channels/types.ts — 修改

// Before:
// export type PluginType = 'telegram' | 'slack' | 'discord' | 'lark';

// After:
export type PluginType = string;

// 保留内置类型常量，供类型检查使用
export const BUILTIN_PLUGIN_TYPES = ['telegram', 'slack', 'discord', 'lark'] as const;
export type BuiltinPluginType = (typeof BUILTIN_PLUGIN_TYPES)[number];

// 类型守卫
export function isBuiltinPluginType(type: string): type is BuiltinPluginType {
  return (BUILTIN_PLUGIN_TYPES as readonly string[]).includes(type);
}
```

### 3.2 开放 IPluginCredentials

当前 `IPluginCredentials` 只有固定的几个字段（`token`, `appId`, `appSecret`, `encryptKey`, `verificationToken`），无法适配新平台。

```typescript
// channels/types.ts — 修改

// Before:
// interface IPluginCredentials {
//   token?: string;
//   appId?: string;
//   appSecret?: string;
//   ...
// }

// After:
// 保留内置字段，同时支持扩展字段
export interface IPluginCredentials {
  // 内置字段（向后兼容）
  token?: string;
  appId?: string;
  appSecret?: string;
  encryptKey?: string;
  verificationToken?: string;

  // 扩展字段（动态键值对）
  [key: string]: string | undefined;
}
```

### 3.3 声明式 UI 表单

扩展清单中的 `credentialFields` 和 `configFields` 驱动设置页面自动渲染表单：

```jsonc
// aion-extension.json → contributes.channelPlugins[0]
{
  "type": "dingtalk",
  "name": "DingTalk Bot",
  "entryPoint": "./plugins/dingtalk/index.js",
  "credentialFields": [
    { "key": "appKey", "label": "App Key", "type": "text", "required": true },
    { "key": "appSecret", "label": "App Secret", "type": "password", "required": true }
  ],
  "configFields": [
    {
      "key": "mode",
      "label": "Connection Mode",
      "type": "select",
      "options": ["webhook", "websocket"],
      "default": "webhook"
    },
    {
      "key": "requireMention",
      "label": "Require @mention",
      "type": "boolean",
      "default": true
    }
  ]
}
```

前端根据 `credentialFields` / `configFields` 动态生成表单：

```typescript
// 伪代码：设置页面
function PluginConfigForm({ pluginType }: { pluginType: string }) {
  const meta = extensionRegistry.getChannelPluginMeta(pluginType);

  if (isBuiltinPluginType(pluginType)) {
    // 内置插件：使用现有的硬编码表单
    return <BuiltinPluginForm type={pluginType} />;
  }

  if (meta?.credentialFields) {
    // 扩展插件：动态渲染表单
    return <DynamicPluginForm credentialFields={meta.credentialFields}
                              configFields={meta.configFields} />;
  }

  return null;
}
```

### 3.4 ChannelPluginResolver

```typescript
// src/extensions/resolvers/ChannelPluginResolver.ts

import path from 'path';
import fs from 'fs';
import { BasePlugin } from '../../channels/plugins/BasePlugin';
import type { ExtChannelPlugin } from '../types';

type PluginConstructor = new () => BasePlugin;

export class ChannelPluginResolver {
  /**
   * 从扩展包加载 Channel Plugin
   * entryPoint 必须导出一个继承 BasePlugin 的类
   */
  async resolve(
    plugins: ExtChannelPlugin[],
    extensionDir: string
  ): Promise<Map<string, { constructor: PluginConstructor; meta: ExtChannelPlugin }>> {
    const result = new Map();

    for (const plugin of plugins) {
      const entryPath = path.resolve(extensionDir, plugin.entryPoint);

      // 安全检查：entryPoint 必须在扩展目录内
      if (!entryPath.startsWith(extensionDir)) {
        console.warn(`[Extension] Path traversal detected: ${plugin.entryPoint}`);
        continue;
      }

      if (!fs.existsSync(entryPath)) {
        console.warn(`[Extension] Channel plugin entry not found: ${entryPath}`);
        continue;
      }

      try {
        const mod = require(entryPath);
        const PluginClass = mod.default || mod.Plugin || mod[Object.keys(mod)[0]];

        // 验证继承关系
        if (!PluginClass || !(PluginClass.prototype instanceof BasePlugin)) {
          console.warn(
            `[Extension] ${plugin.type}: exported class must extend BasePlugin`
          );
          continue;
        }

        result.set(plugin.type, { constructor: PluginClass, meta: plugin });
        console.log(`[Extension] Loaded channel plugin: ${plugin.type}`);
      } catch (error) {
        console.error(
          `[Extension] Failed to load channel plugin: ${plugin.type}`,
          error
        );
      }
    }

    return result;
  }
}
```

### 3.5 ChannelManager 集成

```typescript
// channels/core/ChannelManager.ts — 修改

import { ExtensionRegistry } from '../../extensions';

class ChannelManager {
  private constructor() {
    // ... 现有初始化 ...

    // 内置插件（保持不变）
    registerPlugin('telegram', TelegramPlugin);
    registerPlugin('lark', LarkPlugin);

    // 扩展插件（新增）
    this.loadExtensionPlugins();
  }

  private loadExtensionPlugins(): void {
    const registry = ExtensionRegistry.getInstance();
    const extPlugins = registry.getChannelPlugins();

    for (const [type, { constructor, meta }] of extPlugins) {
      // 避免覆盖内置插件
      if (isBuiltinPluginType(type)) {
        console.warn(
          `[ChannelManager] Extension plugin type "${type}" conflicts with built-in, skipped`
        );
        continue;
      }

      registerPlugin(type, constructor);
      console.log(
        `[ChannelManager] Registered extension plugin: ${type} (${meta.name})`
      );
    }
  }
}
```

---

## 4. 扩展作者开发指南

### 4.1 目录结构

```
my-extension/
├── aion-extension.json
└── plugins/
    └── dingtalk/
        ├── index.js              # 入口：导出 Plugin 类
        ├── DingTalkAdapter.js    # 消息格式转换（可选）
        └── package.json          # 第三方依赖声明（可选）
```

### 4.2 入口文件模板

```javascript
// plugins/dingtalk/index.js
const { BasePlugin } = require('aionui/channels');

class DingTalkPlugin extends BasePlugin {
  // --- 必须实现的抽象属性 ---
  get type() { return 'dingtalk'; }

  // --- 生命周期 ---
  async onInitialize(config) {
    this.appKey = config.credentials?.appKey;
    this.appSecret = config.credentials?.appSecret;
    this.mode = config.config?.mode || 'webhook';
    // 初始化 SDK 等
  }

  async onStart() {
    // 连接钉钉平台
    if (this.mode === 'websocket') {
      await this.connectWebSocket();
    } else {
      await this.registerWebhook();
    }
  }

  async onStop() {
    // 断开连接，清理资源
  }

  // --- 消息发送 ---
  async sendMessage(chatId, message) {
    // 将 IUnifiedOutgoingMessage 转换为钉钉格式并发送
    // 返回消息 ID
    return messageId;
  }

  async editMessage(chatId, messageId, message) {
    // 编辑已发送的消息（如果平台支持）
  }

  // --- 状态查询 ---
  getActiveUserCount() {
    return this.activeUsers.size;
  }

  getBotInfo() {
    return { username: this.botName, displayName: '钉钉机器人' };
  }

  // --- 静态方法：连接测试 ---
  static async testConnection(credentials) {
    // 验证凭证是否有效
    return { success: true, botUsername: 'MyDingBot' };
  }
}

module.exports = { Plugin: DingTalkPlugin };
```

### 4.3 消息格式映射

扩展 Plugin 收到平台消息后，应转换为 `IUnifiedIncomingMessage` 格式：

```javascript
// 钉钉消息 → 统一格式
function toUnifiedMessage(dingMsg) {
  return {
    id: dingMsg.msgId,
    platform: 'dingtalk',
    chatId: dingMsg.conversationId,
    user: {
      id: dingMsg.senderId,
      username: dingMsg.senderNick,
      displayName: dingMsg.senderNick,
    },
    content: {
      type: 'text',
      text: dingMsg.text?.content?.trim(),
    },
    timestamp: Date.now(),
  };
}
```

发送消息时，将 `IUnifiedOutgoingMessage` 转换为平台格式：

```javascript
// 统一格式 → 钉钉消息
function toDingMessage(msg) {
  if (msg.type === 'text') {
    return { msgtype: 'text', text: { content: msg.text } };
  }
  if (msg.type === 'buttons') {
    return {
      msgtype: 'actionCard',
      actionCard: {
        title: msg.text,
        btnOrientation: '1',
        btns: msg.buttons?.flat().map(btn => ({
          title: btn.text,
          actionURL: btn.callbackData || btn.url,
        })),
      },
    };
  }
}
```

---

## 5. BasePlugin 导出方式

为了让扩展作者能 `require('aionui/channels')` 来获取 `BasePlugin`，有两种方案：

### 方案 A：通过 package.json exports（推荐）

```jsonc
// package.json
{
  "exports": {
    "./channels": "./dist/channels/plugins/BasePlugin.js"
  }
}
```

扩展作者：`const { BasePlugin } = require('aionui/channels');`

### 方案 B：全局注入

在加载扩展 JS 模块前，将 `BasePlugin` 注入到 `global` 或 `require.cache`：

```typescript
// 加载前注入
(global as any).__AionUI_BasePlugin = BasePlugin;

// 扩展作者
const BasePlugin = global.__AionUI_BasePlugin;
```

**推荐方案 A**，更标准、更易维护。

---

## 6. 任务分解

### Task P2-1: 修改 `PluginType` 为开放类型

**文件**：`src/channels/types.ts`

- 将 `PluginType` 从联合类型改为 `string`
- 添加 `BUILTIN_PLUGIN_TYPES` 常量和 `isBuiltinPluginType()` 类型守卫
- 扩展 `IPluginCredentials` 支持动态键值对
- 排查所有使用 `PluginType` 的地方，确保兼容 string 类型

**影响范围扫描**：
- `PluginManager.ts` — `pluginRegistry: Map<PluginType, ...>`
- `ChannelManager.ts` — 各处 PluginType 参数
- `ActionExecutor.ts` — 平台特定逻辑
- 前端 UI — 插件类型选择、图标映射等

### Task P2-2: 实现 ChannelPluginResolver

**文件**：`src/extensions/resolvers/ChannelPluginResolver.ts`

- 实现 JS 模块动态加载
- 验证继承关系
- 安全检查（路径穿越检测）
- 错误处理

### Task P2-3: 集成到 ChannelManager

**文件**：`src/channels/core/ChannelManager.ts`

- 添加 `loadExtensionPlugins()` 方法
- 在构造函数中调用
- 冲突检测

### Task P2-4: 集成到 ExtensionRegistry

**文件**：`src/extensions/ExtensionRegistry.ts`

- 添加 `getChannelPlugins()` 方法
- 添加 `getChannelPluginMeta()` 方法

### Task P2-5: 前端 — 动态表单渲染

**文件**：新增 `src/renderer/components/DynamicPluginForm.tsx`

- 根据 `credentialFields` / `configFields` 动态渲染表单
- 支持 text / password / select / number / boolean 字段类型
- 表单验证（required 字段）

### Task P2-6: 前端 — 插件类型选择扩展

**文件**：修改 Channel 设置页面

- 插件类型选择列表包含扩展插件
- 图标/名称从扩展元数据获取
- 扩展插件使用动态表单

### Task P2-7: BasePlugin 导出配置

**文件**：`package.json`

- 配置 `exports` 字段暴露 `BasePlugin`
- 确保编译后的 JS 文件路径正确

---

## 7. 测试策略

### 7.1 创建测试扩展

```
tests/fixtures/test-channel-extension/
├── aion-extension.json
└── plugins/
    └── mock-platform/
        └── index.js     # MockPlugin extends BasePlugin
```

### 7.2 测试场景

| 场景 | 预期 |
|------|------|
| 加载有效的扩展 plugin | 成功注册，可启动/停止 |
| entryPoint 不存在 | 跳过，warning 日志 |
| 导出类不继承 BasePlugin | 跳过，warning 日志 |
| 扩展 type 与内置冲突 | 跳过扩展版本，warning 日志 |
| 路径穿越尝试 | 拒绝加载，warning 日志 |
| 动态表单渲染 | 正确显示所有字段类型 |
| 消息收发 | 统一消息格式正确转换 |

---

## 8. 涉及文件清单

| 操作 | 文件 | Task |
|------|------|------|
| 修改 | `src/channels/types.ts` | P2-1 |
| 新增 | `src/extensions/resolvers/ChannelPluginResolver.ts` | P2-2 |
| 修改 | `src/channels/core/ChannelManager.ts` | P2-3 |
| 修改 | `src/extensions/ExtensionRegistry.ts` | P2-4 |
| 新增 | `src/renderer/components/DynamicPluginForm.tsx` | P2-5 |
| 修改 | Channel 设置页面（待定具体文件） | P2-6 |
| 修改 | `package.json` | P2-7 |
| 新增 | `tests/fixtures/test-channel-extension/` | 测试 |
