# RFC-004: WebUI 扩展化设计

- **Status**: Implemented
- **Date**: 2026-02-13
- **Parent**: [RFC-001: 统一扩展系统](./RFC-001-unified-extension-system.md)
- **Phase**: Phase 3

---

## 1. 概述

本 RFC 详细描述如何为 WebUI 层（Express HTTP Server + WebSocket）添加扩展点，允许外部扩展注册自定义 API 路由、WebSocket 消息处理器、中间件和静态资源。

---

## 2. 现有架构分析

### 2.1 当前代码结构

```
src/webserver/
├── index.ts              # startWebServer / startWebServerWithInstance
│                         # Express app + HTTP server + WebSocket 创建
├── adapter.ts            # initWebAdapter → WebSocket ↔ Bridge 桥接
├── setup.ts              # setupSecurityMiddleware, setupCors, setupCsrf
├── routes/
│   ├── authRoutes.ts     # /login, /api/auth/*
│   ├── apiRoutes.ts      # /api/* (directory API, 少量)
│   └── staticRoutes.ts   # 静态资源, SPA fallback
├── websocket/
│   └── WebSocketManager.ts  # WS 连接管理, 心跳, 消息路由
├── auth/                 # 认证系统 (token, password)
└── middleware/            # 安全中间件 (CSRF, rate limit 等)
```

### 2.2 WebServer 启动流程

```typescript
// webserver/index.ts — 简化流程
async function startWebServerWithInstance(port, allowRemote) {
  const app = express();
  const server = createServer(app);

  // 1. 安全中间件
  setupSecurityMiddleware(app);
  setupCors(app, allowRemote);
  setupCsrf(app);

  // 2. 认证路由
  setupAuthRoutes(app);

  // 3. API 路由
  setupApiRoutes(app);

  // 4. 静态资源 + SPA fallback
  setupStaticRoutes(app);

  // 5. WebSocket
  const wss = new WebSocketServer({ server });
  const wsManager = new WebSocketManager(wss);
  wsManager.initialize();

  // 6. 启动
  server.listen(port);
}
```

### 2.3 WebSocket 消息处理

当前 `WebSocketManager` 通过 `setupConnectionHandler` 注册一个全局消息处理函数：

```typescript
wsManager.setupConnectionHandler((name, data, ws) => {
  // name = 消息类型名（如 "chat:send", "file:select"）
  // 路由到对应处理器
});
```

### 2.4 痛点

1. **无 API 扩展点**：所有路由在 `setupApiRoutes` 中硬编码
2. **无 WS 扩展点**：所有消息类型在 `adapter.ts` 中硬编码处理
3. **无中间件扩展**：安全中间件固定
4. **无自定义页面**：静态资源路径固定

---

## 3. 设计方案

### 3.1 扩展清单声明

```jsonc
// aion-extension.json → contributes.webui
{
  "webui": {
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
        "description": "Real-time knowledge search"
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
}
```

### 3.2 安全隔离规则

| 资源类型 | 前缀约束 | 强制规则 |
|---------|---------|---------|
| API 路由 | `/api/ext/` | 扩展声明的 `path` 若不以 `/api/ext/` 开头，自动添加前缀 |
| WS 命名空间 | `ext:` | 扩展声明的 `namespace` 若不以 `ext:` 开头，自动添加前缀 |
| 静态资源 | `/ext/` | 扩展声明的 `urlPrefix` 若不以 `/ext/` 开头，自动添加前缀 |
| 中间件 | — | 仅作用于 `/api/**` 或扩展自身的路由 |

这确保扩展路由不会覆盖内置路由（`/api/auth/*`, `/api/*`, `/login` 等）。

---

## 4. WebuiResolver 详细设计

### 4.1 API Routes

```typescript
// extensions/resolvers/WebuiResolver.ts

import { Express, Router } from 'express';
import path from 'path';
import { validateApiAccess } from '../../webserver/middleware/auth';

class WebuiResolver {

  /**
   * 加载 API Route 扩展
   * 每个 entryPoint 必须导出一个 Express Router
   */
  resolveApiRoutes(
    routes: ExtApiRoute[],
    extensionDir: string,
    app: Express
  ): void {
    for (const route of routes) {
      const routerPath = path.resolve(extensionDir, route.entryPoint);

      // 安全：路径穿越检查
      if (!routerPath.startsWith(extensionDir)) {
        console.warn(`[Extension WebUI] Path traversal: ${route.entryPoint}`);
        continue;
      }

      try {
        const mod = require(routerPath);
        const router: Router = mod.default || mod.router || mod;

        if (typeof router !== 'function') {
          console.warn(`[Extension WebUI] ${route.path}: must export Express Router`);
          continue;
        }

        // 强制 /api/ext/ 前缀
        const safePath = this.ensureApiExtPrefix(route.path);

        // 鉴权
        if (route.auth !== false) {
          app.use(safePath, validateApiAccess, router);
        } else {
          app.use(safePath, router);
        }

        console.log(`[Extension WebUI] API route: ${safePath}`);
      } catch (error) {
        console.error(`[Extension WebUI] Failed: ${route.path}`, error);
      }
    }
  }

  private ensureApiExtPrefix(routePath: string): string {
    if (routePath.startsWith('/api/ext/')) return routePath;
    if (routePath.startsWith('/api/ext')) return routePath;
    const clean = routePath.startsWith('/') ? routePath.slice(1) : routePath;
    return `/api/ext/${clean}`;
  }
}
```

**扩展作者示例**（API Route）：

```javascript
// webui/routes/knowledge.js
const { Router } = require('express');

const router = Router();

router.get('/search', async (req, res) => {
  const { q } = req.query;
  // 搜索知识库...
  res.json({ results: [...] });
});

router.post('/index', async (req, res) => {
  const { documents } = req.body;
  // 索引文档...
  res.json({ success: true, indexed: documents.length });
});

module.exports = router;
```

访问路径：`GET /api/ext/knowledge/search?q=xxx`

### 4.2 WebSocket Handlers

当前 `WebSocketManager` 的消息处理是通过 `setupConnectionHandler` 注册的单一回调。我们需要添加命名空间路由支持。

#### 4.2.1 WebSocketManager 修改

```typescript
// webserver/websocket/WebSocketManager.ts — 新增

interface WsNamespaceHandler {
  onMessage?(data: any, ws: WebSocket): Promise<void> | void;
  onConnect?(ws: WebSocket): void;
  onDisconnect?(ws: WebSocket): void;
}

class WebSocketManager {
  // 新增：命名空间处理器注册表
  private namespaceHandlers: Map<string, WsNamespaceHandler> = new Map();

  /**
   * 注册命名空间处理器
   * 消息名以 "namespace:" 开头的会路由到对应处理器
   */
  registerNamespace(namespace: string, handler: WsNamespaceHandler): boolean {
    // 强制 ext: 前缀
    const safeNamespace = namespace.startsWith('ext:')
      ? namespace
      : `ext:${namespace}`;

    if (this.namespaceHandlers.has(safeNamespace)) {
      console.warn(`[WS] Namespace already registered: ${safeNamespace}`);
      return false;
    }

    this.namespaceHandlers.set(safeNamespace, handler);
    console.log(`[WS] Registered namespace: ${safeNamespace}`);
    return true;
  }

  /**
   * 路由消息到命名空间处理器
   * 消息格式：{ name: "ext:knowledge:search", data: {...} }
   */
  private routeToNamespace(name: string, data: any, ws: WebSocket): boolean {
    // 查找匹配的命名空间
    for (const [ns, handler] of this.namespaceHandlers) {
      if (name.startsWith(ns + ':') || name === ns) {
        handler.onMessage?.(data, ws);
        return true;  // 已处理
      }
    }
    return false;  // 未匹配
  }

  // 修改现有的消息处理逻辑
  setupConnectionHandler(onMessage) {
    // ... 现有逻辑 ...
    // 在现有的消息处理中，先尝试命名空间路由
    // if (this.routeToNamespace(name, data, ws)) return;
    // 否则走现有的 onMessage 回调
  }
}
```

#### 4.2.2 WS Handler 加载

```typescript
// WebuiResolver.ts

resolveWsHandlers(
  handlers: ExtWsHandler[],
  extensionDir: string,
  wsManager: WebSocketManager
): void {
  for (const handler of handlers) {
    const handlerPath = path.resolve(extensionDir, handler.entryPoint);

    if (!handlerPath.startsWith(extensionDir)) {
      console.warn(`[Extension WS] Path traversal: ${handler.entryPoint}`);
      continue;
    }

    try {
      const mod = require(handlerPath);
      const nsHandler: WsNamespaceHandler = {
        onMessage: mod.onMessage || mod.default?.onMessage,
        onConnect: mod.onConnect || mod.default?.onConnect,
        onDisconnect: mod.onDisconnect || mod.default?.onDisconnect,
      };

      // 强制 ext: 前缀
      const safeNamespace = handler.namespace.startsWith('ext:')
        ? handler.namespace
        : `ext:${handler.namespace}`;

      wsManager.registerNamespace(safeNamespace, nsHandler);
    } catch (error) {
      console.error(`[Extension WS] Failed: ${handler.namespace}`, error);
    }
  }
}
```

**扩展作者示例**（WS Handler）：

```javascript
// webui/ws/knowledge-handler.js

module.exports = {
  async onMessage(data, ws) {
    // data = { action: 'search', query: '...' }
    if (data.action === 'search') {
      const results = await searchKnowledgeBase(data.query);
      ws.send(JSON.stringify({
        name: 'ext:knowledge:results',
        data: { results }
      }));
    }
  },

  onConnect(ws) {
    console.log('Knowledge WS client connected');
  },

  onDisconnect(ws) {
    console.log('Knowledge WS client disconnected');
  }
};
```

客户端发送：`{ name: "ext:knowledge:search", data: { action: "search", query: "deploy" } }`

### 4.3 Middleware

```typescript
// WebuiResolver.ts

resolveMiddleware(
  middlewareList: ExtMiddleware[],
  extensionDir: string,
  app: Express
): { before: Function[]; after: Function[] } {
  const result = { before: [] as Function[], after: [] as Function[] };

  for (const mw of middlewareList) {
    const mwPath = path.resolve(extensionDir, mw.entryPoint);

    if (!mwPath.startsWith(extensionDir)) {
      console.warn(`[Extension MW] Path traversal: ${mw.entryPoint}`);
      continue;
    }

    try {
      const mod = require(mwPath);
      const middleware = mod.default || mod.middleware || mod;

      if (typeof middleware !== 'function') {
        console.warn(`[Extension MW] ${mw.entryPoint}: must export middleware function`);
        continue;
      }

      // 限制作用范围：仅 /api/** 和 /ext/**
      const safeApplyTo = this.validateMiddlewareScope(mw.applyTo);
      const order = mw.order || 'before';

      result[order].push({ middleware, applyTo: safeApplyTo });
      console.log(`[Extension MW] Registered: ${mw.description || mw.entryPoint}`);
    } catch (error) {
      console.error(`[Extension MW] Failed: ${mw.entryPoint}`, error);
    }
  }

  return result;
}

private validateMiddlewareScope(applyTo: string): string {
  // 安全限制：中间件只能作用于 /api/** 和 /ext/**
  // 不能作用于 /login, / 等核心路由
  const allowed = ['/api/', '/ext/'];
  if (allowed.some(prefix => applyTo.startsWith(prefix))) {
    return applyTo;
  }
  console.warn(`[Extension MW] Scope "${applyTo}" restricted to /api/ext/**`);
  return '/api/ext/**';
}
```

**扩展作者示例**（Middleware）：

```javascript
// webui/middleware/audit-log.js

module.exports = function auditLog(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: Date.now() - start,
      user: req.user?.id || 'anonymous',
    }));
  });

  next();
};
```

### 4.4 Static Assets

```typescript
// WebuiResolver.ts

resolveStaticAssets(
  assets: ExtStaticAsset[],
  extensionDir: string,
  app: Express
): void {
  for (const asset of assets) {
    const dir = path.resolve(extensionDir, asset.directory);

    // 安全：路径必须在扩展目录内
    if (!dir.startsWith(extensionDir)) {
      console.warn(`[Extension Static] Path traversal: ${asset.directory}`);
      continue;
    }

    if (!fs.existsSync(dir)) {
      console.warn(`[Extension Static] Directory not found: ${dir}`);
      continue;
    }

    // 强制 /ext/ 前缀
    const safePrefix = asset.urlPrefix.startsWith('/ext/')
      ? asset.urlPrefix
      : `/ext${asset.urlPrefix.startsWith('/') ? '' : '/'}${asset.urlPrefix}`;

    app.use(safePrefix, express.static(dir));
    console.log(`[Extension Static] ${safePrefix} → ${dir}`);
  }
}
```

---

## 5. WebServer 集成

### 5.1 修改 `startWebServerWithInstance`

```typescript
// webserver/index.ts — 修改

import { ExtensionRegistry } from '../extensions';
import { WebuiResolver } from '../extensions/resolvers/WebuiResolver';

async function startWebServerWithInstance(port, allowRemote) {
  const app = express();
  const server = createServer(app);

  // 1. 安全中间件
  setupSecurityMiddleware(app);
  setupCors(app, allowRemote);

  // 2. 扩展中间件（order: "before"）
  const webuiResolver = new WebuiResolver();
  const extensions = ExtensionRegistry.getInstance().getWebuiContributions();
  for (const { config, directory } of extensions) {
    if (config.middleware) {
      const { before } = webuiResolver.resolveMiddleware(
        config.middleware, directory, app
      );
      for (const { middleware, applyTo } of before) {
        app.use(applyTo, middleware);
      }
    }
  }

  // 3. CSRF（在扩展中间件之后）
  setupCsrf(app);

  // 4. 认证路由
  setupAuthRoutes(app);

  // 5. 内置 API 路由
  setupApiRoutes(app);

  // 6. 扩展 API 路由
  for (const { config, directory } of extensions) {
    if (config.apiRoutes) {
      webuiResolver.resolveApiRoutes(config.apiRoutes, directory, app);
    }
  }

  // 7. 扩展静态资源
  for (const { config, directory } of extensions) {
    if (config.staticAssets) {
      webuiResolver.resolveStaticAssets(config.staticAssets, directory, app);
    }
  }

  // 8. 内置静态资源 + SPA fallback（必须最后）
  setupStaticRoutes(app);

  // 9. 扩展中间件（order: "after"）
  for (const { config, directory } of extensions) {
    if (config.middleware) {
      const { after } = webuiResolver.resolveMiddleware(
        config.middleware, directory, app
      );
      for (const { middleware, applyTo } of after) {
        app.use(applyTo, middleware);
      }
    }
  }

  // 10. WebSocket
  const wss = new WebSocketServer({ server });
  const wsManager = new WebSocketManager(wss);
  wsManager.initialize();

  // 11. 扩展 WS handlers
  for (const { config, directory } of extensions) {
    if (config.wsHandlers) {
      webuiResolver.resolveWsHandlers(config.wsHandlers, directory, wsManager);
    }
  }

  // 12. 启动
  server.listen(port);
}
```

### 5.2 路由注册顺序（关键）

```
1. 安全中间件（内置）
2. 扩展中间件（order: "before"）
3. CSRF 中间件（内置）
4. 认证路由（内置 /login, /api/auth/*）
5. 内置 API 路由（/api/*）
6. 扩展 API 路由（/api/ext/*）            ← 新增
7. 扩展静态资源（/ext/*）                  ← 新增
8. 内置静态资源 + SPA fallback（/* catch-all）
9. 扩展中间件（order: "after"，如错误处理）
```

这个顺序确保：
- 内置路由不会被扩展覆盖
- 扩展路由在 SPA catch-all 之前
- 安全中间件对所有请求生效

---

## 6. 任务分解

### Task P3-1: WebuiResolver 实现

**新增文件**：`src/extensions/resolvers/WebuiResolver.ts`

- `resolveApiRoutes()`：加载 Express Router
- `resolveWsHandlers()`：加载 WS 命名空间处理器
- `resolveMiddleware()`：加载中间件（before/after）
- `resolveStaticAssets()`：注册静态目录
- 安全检查：路径穿越、前缀强制、中间件作用域限制

### Task P3-2: WebSocketManager 扩展

**修改文件**：`src/webserver/websocket/WebSocketManager.ts`

- 新增 `namespaceHandlers: Map<string, WsNamespaceHandler>`
- 新增 `registerNamespace()` 方法
- 新增 `routeToNamespace()` 私有方法
- 修改消息处理逻辑：先尝试命名空间路由，再走原有回调

### Task P3-3: WebServer 集成

**修改文件**：`src/webserver/index.ts`

- 在 `startWebServerWithInstance` 中按正确顺序加载扩展
- 遵循 §5.2 的路由注册顺序

### Task P3-4: ExtensionRegistry 扩展

**修改文件**：`src/extensions/ExtensionRegistry.ts`

- 新增 `getWebuiContributions()` 方法

### Task P3-5: Express/WS 类型导出

为扩展作者提供类型定义：
- `Express`, `Router`, `Request`, `Response` 从 express re-export
- `WsNamespaceHandler` 接口导出

---

## 7. 测试策略

### 7.1 测试扩展

```
tests/fixtures/test-webui-extension/
├── aion-extension.json
├── webui/
│   ├── routes/
│   │   └── test-api.js          # Express Router
│   ├── ws/
│   │   └── test-handler.js      # WS Handler
│   ├── middleware/
│   │   └── test-logger.js       # Middleware
│   └── static/
│       └── test-page/
│           └── index.html
```

### 7.2 测试场景

| 场景 | 预期 |
|------|------|
| API 路由注册 | `GET /api/ext/test/hello` 返回 200 |
| WS 命名空间 | 发送 `ext:test:ping` 收到 `ext:test:pong` |
| 中间件 (before) | 日志中间件在请求前执行 |
| 静态资源 | `GET /ext/test-page/index.html` 返回 200 |
| 路径穿越拒绝 | `../../etc/passwd` 被拒绝 |
| 前缀自动修正 | `/knowledge` → `/api/ext/knowledge` |
| 鉴权默认开启 | 未认证请求被拒 |
| 内置路由不受影响 | `/api/auth/*` 正常工作 |
| WS 命名空间冲突 | 第二次注册被拒绝，日志 warning |

---

## 8. 涉及文件清单

| 操作 | 文件 | Task |
|------|------|------|
| 新增 | `src/extensions/resolvers/WebuiResolver.ts` | P3-1 |
| 修改 | `src/webserver/websocket/WebSocketManager.ts` | P3-2 |
| 修改 | `src/webserver/index.ts` | P3-3 |
| 修改 | `src/extensions/ExtensionRegistry.ts` | P3-4 |
| 新增 | `tests/fixtures/test-webui-extension/` | 测试 |

---

## 9. 安全考量

### 9.1 已实施的安全措施

| 措施 | 说明 |
|------|------|
| 路由前缀隔离 | `/api/ext/`, `ext:`, `/ext/` |
| 默认鉴权 | API 路由默认 `auth: true` |
| 路径穿越检查 | `entryPoint` / `directory` 必须在扩展目录内 |
| 中间件作用域限制 | 仅 `/api/**` 和 `/ext/**` |
| 内置路由优先 | 内置路由在扩展之前注册 |
| 命名空间唯一 | 同名 WS 命名空间拒绝覆盖 |

### 9.2 已知限制（v1 不解决）

| 限制 | 原因 | 未来方案 |
|------|------|---------|
| 无 JS 沙箱 | 性能开销大，Node.js VM 有限制 | v3.0 Worker Thread |
| 共享进程内存 | Express middleware 共享请求上下文 | v3.0 进程隔离 |
| 无资源限制 | 扩展可消耗无限 CPU/内存 | v3.0 资源配额 |
| 无权限模型 | 扩展可访问所有 Node.js API | v3.0 capability-based security |

### 9.3 建议

- Phase 3（本 RFC）仅在 **受信任环境** 下使用（企业内部、本地开发）
- 对外发布的扩展市场需要额外的安全审查机制（Phase 4+）
