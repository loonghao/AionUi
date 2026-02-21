# RFC-005: 从 @electron-forge/plugin-vite 迁移到 electron-vite

- **Status**: Draft
- **Date**: 2026-02-17
- **Author**: AionUI Team

---

## 1. 背景与动机

### 1.1 当前问题

AionUi 当前使用 `@electron-forge/plugin-vite` + 自定义 `pluginExternalizeDynamicImports` 插件进行构建。这套方案导致了多个严重问题：

| 问题 | 根因 | 影响 |
|------|------|------|
| `EADDRINUSE` 崩溃 | esbuild 独立 bundle 创建了隔离的模块实例，`webServerInstance` 单例不跨 bundle 共享 | WebUI 服务器被启动两次 |
| CSRF 密钥重复生成 | `setup.ts` 在多个 bundle 中各执行一次 | 安全隐患，日志噪音 |
| `global.__aionui_*` hack | 为绕过 bundle 隔离而引入的全局状态共享 | 代码不优雅，维护困难 |
| 构建速度慢 | Rollup 遍历 230+ 文件的动态导入子树 | 开发体验差 |
| 配置分散 | 4 个独立 Vite 配置文件 + forge.config.ts | 维护成本高 |

### 1.2 行业对比

| 项目 | Stars | 构建工具 | 打包工具 |
|------|-------|---------|---------|
| **Cherry Studio** | 39.9k | electron-vite | electron-builder |
| **MineContext** (ByteDance) | 4.9k | electron-vite | electron-builder |
| **AionUi** (当前) | — | @electron-forge/plugin-vite | electron-builder |

**结论**：`electron-vite` 是 Electron + Vite 的行业标准方案，已被大量生产级项目验证。

---

## 2. 迁移方案

### 2.1 核心变更

```
@electron-forge/plugin-vite + 自定义插件  →  electron-vite (v5.x)
4 个 Vite 配置 + forge.config.ts          →  1 个 electron.vite.config.ts
.vite/build/ + .vite/renderer/             →  out/main/ + out/preload/ + out/renderer/
MAIN_WINDOW_VITE_DEV_SERVER_URL            →  process.env['ELECTRON_RENDERER_URL']
electron-forge start/package               →  electron-vite dev/build
pluginExternalizeDynamicImports            →  (删除) electron-vite 原生处理
getExternalDeps()                          →  externalizeDepsPlugin()
```

### 2.2 配置映射

#### 当前：4 个配置文件

| 文件 | 职责 |
|------|------|
| `vite.main.config.ts` (262 行) | 主进程构建 + `pluginExternalizeDynamicImports` + `vite-plugin-static-copy` |
| `vite.preload.config.ts` (28 行) | Preload 脚本构建 |
| `vite.renderer.config.ts` (171 行) | 渲染进程 + UnoCSS + iconPark + chunk splitting |
| `vite.worker.config.ts` (68 行) | Worker 多入口构建 (gemini, acp, codex, openclaw-gateway, nanobot) |
| `forge.config.ts` (215 行) | Electron Forge 配置 |

#### 目标：1 个配置文件

```typescript
// electron.vite.config.ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['fix-path'] })],
    resolve: { alias: { '@': resolve('src'), ... } },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/index.ts'),
          // Workers 作为额外入口点，与主进程一起构建
          gemini: resolve('src/worker/gemini.ts'),
          acp: resolve('src/worker/acp.ts'),
          codex: resolve('src/worker/codex.ts'),
          'openclaw-gateway': resolve('src/worker/openclaw-gateway.ts'),
          nanobot: resolve('src/worker/nanobot.ts'),
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload.ts') }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    plugins: [UnoCSS(), iconParkPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve('src/renderer/index.html') },
        output: { manualChunks: { /* 保持现有 chunk 拆分 */ } }
      }
    }
  }
})
```

### 2.3 Worker 构建策略

当前 Worker 通过 `utilityProcess.fork()` 启动，路径解析方式：

```typescript
// BaseAgentManager.ts
super(path.resolve(__dirname, type + '.js'), { type, data });
```

**关键约束**：Worker JS 文件必须与主进程 `index.js` 在同一目录下（`__dirname` 相同）。

**方案**：将 Worker 文件作为 `main.build.rollupOptions.input` 的额外入口。electron-vite 会将所有主进程入口输出到 `out/main/` 目录，满足 `path.resolve(__dirname, type + '.js')` 的路径解析需求。

### 2.4 输出目录结构

```
# 当前 (.vite/)                    # 目标 (out/)
.vite/                              out/
├── build/                          ├── main/
│   ├── index.js                    │   ├── index.js
│   ├── gemini.js                   │   ├── gemini.js
│   ├── acp.js                      │   ├── acp.js
│   ├── _dyn_*.js (esbuild)         │   ├── codex.js
│   └── skills/, rules/, ...        │   ├── openclaw-gateway.js
├── renderer/                       │   ├── nanobot.js
│   └── main_window/                │   └── skills/, rules/, ...
│       └── index.html              ├── preload/
└──                                 │   └── index.js
                                    └── renderer/
                                        └── index.html
```



---

## 3. 迁移步骤

### Phase 1: 安装 electron-vite 并创建配置

1. 安装 `electron-vite` 为 devDependency
2. 创建 `electron.vite.config.ts`（合并 4 个 Vite 配置）
3. 更新 `package.json`:
   - `"main": "./out/main/index.js"`
   - `"scripts.dev": "electron-vite dev"`
   - `"scripts.build": "electron-vite build"`

### Phase 2: 更新主进程入口

修改 `src/index.ts`:

```typescript
// 之前 (Forge magic constants)
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
  mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
} else {
  mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
}

// 之后 (electron-vite standard)
if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
  mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
} else {
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}
```

### Phase 3: 更新构建和打包脚本

1. **`electron-builder.yml`**:
   - `.vite/build/**/*` → `out/main/**/*`
   - `.vite/renderer/**/*` → `out/renderer/**/*`
   - 添加 `out/preload/**/*`

2. **`scripts/build-with-builder.js`**:
   - `electron-forge package` → `electron-vite build`
   - `.vite/build/index.js` → `out/main/index.js`
   - 移除 `.vite/` 目录结构检查逻辑

3. **`src/webserver/routes/staticRoutes.ts`**:
   - 更新 renderer 资源路径引用

### Phase 4: 移除旧基础设施

删除以下文件和依赖：

| 删除 | 类型 |
|------|------|
| `forge.config.ts` | 配置文件 |
| `vite.main.config.ts` | 配置文件 |
| `vite.preload.config.ts` | 配置文件 |
| `vite.renderer.config.ts` | 配置文件 |
| `vite.worker.config.ts` | 配置文件 |
| `scripts/start-forge.js` | 脚本 |
| `@electron-forge/cli` | devDependency |
| `@electron-forge/maker-*` | devDependency |
| `@electron-forge/plugin-auto-unpack-natives` | devDependency |
| `@electron-forge/plugin-fuses` | devDependency |
| `@electron-forge/plugin-vite` | devDependency |

### Phase 5: 清理 workaround 代码

1. 移除 `src/process/bridge/webuiBridge.ts` 中的 `global.__aionui_webserver_instance__` hack
2. 恢复干净的模块级单例模式
3. 评估 `src/index.ts` 中 `EADDRINUSE` 容错逻辑是否仍需保留

### Phase 6: 验证

| 验证项 | 命令 | 预期结果 |
|--------|------|---------|
| 开发模式 | `electron-vite dev` | 应用正常启动，HMR 工作 |
| 生产构建 | `electron-vite build` | `out/` 目录正确生成 |
| Worker 启动 | 创建 Gemini/ACP 对话 | Worker 进程正常 fork |
| WebUI | 访问 `localhost:25808` | WebUI 服务可用 |
| 打包 | `electron-builder` | 安装包正常生成 |
| CSRF | 查看日志 | 只生成 1 次 CSRF 密钥 |

---

## 4. 风险与回滚

### 4.1 风险评估

| 风险 | 概率 | 缓解措施 |
|------|------|---------|
| Worker 路径解析错误 | 中 | Worker 作为 main 的额外入口，确保 `__dirname` 一致 |
| 静态资源复制遗漏 | 低 | 使用 `vite-plugin-static-copy` 保持不变 |
| electron-builder 路径不匹配 | 低 | 仔细更新 `electron-builder.yml` 中所有路径引用 |
| ESM-only 依赖兼容性 | 低 | `externalizeDepsPlugin({ exclude: [...] })` 处理 |

### 4.2 回滚方案

本次迁移在独立分支上进行。如遇不可解决的问题：
1. 切回 `main` 分支
2. 所有旧配置文件保持不变，零风险回滚

---

## 5. 预期收益

| 维度 | 改善 |
|------|------|
| **构建速度** | 消除 `pluginExternalizeDynamicImports` 的 esbuild 二次编译，预计 dev 启动提速 30-50% |
| **代码质量** | 移除 ~300 行自定义构建插件代码和 global hack |
| **稳定性** | 消除 esbuild bundle 隔离导致的单例共享问题 |
| **维护性** | 5 个配置文件合并为 1 个，与社区标准对齐 |
| **生态兼容** | 与 Cherry Studio、MineContext 等项目使用相同工具链 |
