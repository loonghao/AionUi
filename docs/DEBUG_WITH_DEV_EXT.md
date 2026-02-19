# 🔧 使用 dev-ext 调试自定义扩展 Agent / Debug Custom Extension Agent with dev-ext

## 概述 / Overview

本指南介绍如何使用 `vx just dev-ext` 启动应用，然后通过 MCP 工具调试自定义扩展 Agent 的连接问题。

This guide shows how to start the app with `vx just dev-ext` and debug custom extension agent connection issues using MCP tools.

## 前置条件 / Prerequisites

1. 已安装 `vx` 和 `just`
2. 已配置自定义扩展 Agent（例如 "Hello CodeBuddy"）
3. 应用至少运行过一次（创建了数据库）

## 调试流程 / Debug Workflow

### 步骤 1: 启动开发环境 / Step 1: Start Development Environment

```bash
# 使用 dev-ext 启动应用（启用扩展开发模式）
vx just dev-ext
```

这将：
- 启动应用并加载所有扩展
- 启用开发者工具
- 显示详细的控制台日志

### 步骤 2: 查看自定义 Agent 配置 / Step 2: Check Custom Agent Configuration

在另一个终端窗口运行：

```bash
# 列出所有 MCP 服务器和自定义 Agent
npm run debug:mcp:list
```

输出示例：
```
📋 Listing MCP servers...

🔍 CLAUDE:
   No servers configured

🔍 QWEN:
   No servers configured

🔍 CUSTOM EXTENSION AGENTS:
   1. Hello CodeBuddy
      CLI: npx @tencent-ai/codebuddy-code
      Args: --acp
      Enabled: true
```

### 步骤 3: 启用详细日志 / Step 3: Enable Verbose Logging

如果需要更详细的日志，重新启动应用并启用性能日志：

```bash
# 停止当前应用（Ctrl+C）

# 启用 ACP 性能日志
ACP_PERF=1 vx just dev-ext
```

### 步骤 4: 尝试连接 Agent / Step 4: Try Connecting to Agent

1. 在应用中创建新对话
2. 选择自定义 Agent（例如 "Hello CodeBuddy"）
3. 观察控制台输出

### 步骤 5: 分析日志 / Step 5: Analyze Logs

在控制台中查找以下关键日志：

#### ✅ 成功的连接日志 / Successful Connection Logs

```
[ACP] Using NPX approach for custom backend
[ACP] Spawning process: npx --yes --prefer-offline @tencent-ai/codebuddy-code --acp
[ACP-PERF] custom: env prepared 5ms
[ACP-PERF] custom: spawn completed 1200ms
[ACP-PERF] custom: initialize completed 800ms
[ACP-PERF] custom: connect completed 2000ms
```

#### ❌ 失败的连接日志 / Failed Connection Logs

**问题 1: CLI 路径错误**
```
[ACP custom] Process exited with code: 1
Error: spawn ENOENT
```

**问题 2: ACP 参数缺失**
```
[ACP] Process started but no ACP protocol detected
[ACP] Initialize timeout after 60 seconds
```

**问题 3: 进程启动后立即退出**
```
[ACP custom] Process exited during startup (code: 1)
stderr: Error: Cannot find module '@tencent-ai/codebuddy-code'
```

## 常见问题诊断 / Common Issues Diagnosis

### 问题 1: "正在连接..." 一直卡住 / Stuck at "Connecting..."

**可能原因**：
1. CLI 启动慢（首次下载依赖）
2. 网络问题
3. ACP 协议初始化失败

**调试步骤**：
```bash
# 1. 手动测试 CLI 是否可用
npx @tencent-ai/codebuddy-code --acp

# 2. 检查网络连接
ping registry.npmjs.org

# 3. 查看详细日志
ACP_PERF=1 vx just dev-ext
```

### 问题 2: 进程立即退出 / Process Exits Immediately

**可能原因**：
1. CLI 路径错误
2. 缺少必要的参数
3. 环境变量问题

**调试步骤**：
```bash
# 1. 验证配置
npm run debug:mcp:list

# 2. 手动运行 CLI
npx @tencent-ai/codebuddy-code --acp
# 应该启动并等待输入，不应该立即退出

# 3. 检查 stderr 输出
# 在应用控制台中查找红色错误信息
```

### 问题 3: MCP 服务器初始化失败 / MCP Server Initialization Failed

**可能原因**：
1. MCP 配置文件格式错误
2. MCP 服务器路径不正确
3. 权限问题

**调试步骤**：
```bash
# 验证 MCP 配置
npm run debug:mcp:validate

# 检查 MCP 配置文件
# Windows: %USERPROFILE%\.codebuddy\mcp.json
# macOS/Linux: ~/.codebuddy/mcp.json
```

## 实时调试技巧 / Live Debugging Tips

### 1. 使用 Chrome DevTools

应用启动后，DevTools 会自动打开：
1. 切换到 "Console" 标签
2. 过滤日志：输入 `[ACP]` 只显示 ACP 相关日志
3. 查看网络请求：切换到 "Network" 标签

### 2. 监控性能

启用性能监控：
```bash
ACP_PERF=1 PERF_MONITOR=1 vx just dev-ext
```

查看性能指标：
- 连接耗时（目标 <5s）
- 初始化耗时（目标 <2s）
- 会话创建耗时（目标 <1s）

### 3. 检查进程状态

在应用运行时，打开任务管理器（Windows）或活动监视器（macOS）：
- 查找 `node` 或 `npx` 进程
- 确认 Agent CLI 进程是否在运行
- 检查 CPU 和内存使用情况

## 修复示例 / Fix Examples

### 示例 1: 修复 CLI 路径

**问题**：CLI 路径不正确
```json
{
  "defaultCliPath": "codebuddy-code"  // ❌ 错误
}
```

**解决方案**：
```json
{
  "defaultCliPath": "npx @tencent-ai/codebuddy-code",  // ✅ 正确
  "acpArgs": ["--acp"]
}
```

### 示例 2: 添加环境变量

**问题**：Agent 需要特定环境变量

**解决方案**：
```json
{
  "defaultCliPath": "npx @tencent-ai/codebuddy-code",
  "acpArgs": ["--acp"],
  "env": {
    "NODE_ENV": "development",
    "DEBUG": "acp:*"
  }
}
```

### 示例 3: 分离命令和参数

**问题**：命令和参数混在一起
```json
{
  "defaultCliPath": "node /path/to/agent.js --acp"  // ❌ 不推荐
}
```

**解决方案**：
```json
{
  "defaultCliPath": "node /path/to/agent.js",  // ✅ 推荐
  "acpArgs": ["--acp"]
}
```

## 获取更多帮助 / Get More Help

### 查看文档
- [自定义 Agent 调试指南](./DEBUG_CUSTOM_AGENT.md)
- [性能优化指南](./PERFORMANCE_OPTIMIZATION.md)
- [MCP 调试指南](./DEBUG_GUIDE.md)

### 收集诊断信息

如果问题仍未解决，收集以下信息：

1. **配置信息**：
   ```bash
   npm run debug:mcp:list > debug-config.txt
   ```

2. **日志信息**：
   - 启用 `ACP_PERF=1` 运行
   - 复制所有控制台输出
   - 保存到文件

3. **系统信息**：
   - 操作系统版本
   - Node.js 版本：`node --version`
   - NPM 版本：`npm --version`
   - Agent CLI 版本

## 总结 / Summary

使用 `vx just dev-ext` 调试自定义扩展 Agent 的关键步骤：

1. ✅ 启动开发环境：`vx just dev-ext`
2. ✅ 检查配置：`npm run debug:mcp:list`
3. ✅ 启用详细日志：`ACP_PERF=1 vx just dev-ext`
4. ✅ 分析控制台输出
5. ✅ 根据错误信息修复配置

记住：大多数连接问题都是由于 CLI 路径、ACP 参数或环境变量配置不正确导致的。

