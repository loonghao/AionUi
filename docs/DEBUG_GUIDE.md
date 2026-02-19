# AionUi 调试指南 / Debug Guide

## 概述 / Overview

本指南提供了 AionUi 的全面调试和性能分析工具使用说明。

This guide provides comprehensive debugging and performance analysis tools for AionUi.

## 快速开始 / Quick Start

### 1. 启用性能监控 / Enable Performance Monitoring

```bash
# 启动应用并启用性能日志
# Start app with performance logging
npm run debug:perf

# 或者手动设置环境变量
# Or manually set environment variables
ACP_PERF=1 PERF_MONITOR=1 npm start
```

### 2. MCP 调试 / MCP Debugging

```bash
# 列出所有 MCP 服务器
# List all MCP servers
npm run debug:mcp:list

# 验证 MCP 配置
# Validate MCP configurations
npm run debug:mcp:validate

# 测试特定服务器
# Test specific server
npx tsx scripts/debug-mcp.ts test <server-name>
```

### 3. 生成性能报告 / Generate Performance Report

```bash
# 生成详细的性能报告
# Generate detailed performance report
npm run debug:perf:report
```

## 调试工具 / Debugging Tools

### 性能监控器 / Performance Monitor

运行时性能跟踪工具，自动记录所有操作的执行时间和内存使用情况。

Runtime performance tracking tool that automatically records execution time and memory usage.

**使用方法 / Usage:**

```typescript
import { performanceMonitor } from '@process/utils/PerformanceMonitor';

// 方法 1: 手动跟踪 / Method 1: Manual tracking
const id = performanceMonitor.start('ComponentName', 'operationName');
// ... 执行操作 / do work
performanceMonitor.end(id);

// 方法 2: 同步函数包装 / Method 2: Sync function wrapper
const result = performanceMonitor.measure('ComponentName', 'operation', () => {
  // 同步操作 / sync operation
  return someValue;
});

// 方法 3: 异步函数包装 / Method 3: Async function wrapper
const result = await performanceMonitor.measureAsync('ComponentName', 'operation', async () => {
  // 异步操作 / async operation
  return await someAsyncValue;
});

// 获取统计信息 / Get statistics
const stats = performanceMonitor.getStats();
const memoryStats = performanceMonitor.getMemoryStats();
```

**自动监控的组件 / Auto-monitored Components:**

- ✅ AcpAgentManager.sendMessage
- ✅ Database queries (planned)
- ✅ IPC communication (planned)
- ✅ File operations (planned)

### MCP 调试器 / MCP Debugger

诊断 MCP 服务器配置和连接问题。

Diagnose MCP server configuration and connection issues.

**命令 / Commands:**

```bash
# 列出所有 Agent 的 MCP 服务器
# List MCP servers for all agents
npx tsx scripts/debug-mcp.ts list

# 测试服务器连接
# Test server connection
npx tsx scripts/debug-mcp.ts test <server-name>

# 验证所有配置
# Validate all configurations
npx tsx scripts/debug-mcp.ts validate
```

**支持的 Agent / Supported Agents:**

- Claude Code
- Qwen Code
- Gemini CLI
- Codex CLI
- CodeBuddy
- iFlow

## 性能分析 / Performance Analysis

### 查看性能统计 / View Performance Stats

在应用运行时，性能监控器会自动收集数据。你可以通过 IPC 桥接获取统计信息：

Performance monitor automatically collects data while the app is running. You can get statistics via IPC bridge:

```typescript
// 在渲染进程中 / In renderer process
const stats = await window.ipc.invoke('performance.get-stats');
console.log('Performance Stats:', stats);

// 生成报告 / Generate report
const report = await window.ipc.invoke('performance.generate-report');
console.log('Performance Report:', report);
```

### 性能指标 / Performance Metrics

监控的关键指标：

Key metrics being monitored:

- **操作时长 / Operation Duration**: 每个操作的执行时间
- **内存使用 / Memory Usage**: 堆内存、RSS、外部内存
- **慢操作 / Slow Operations**: 超过 100ms 的操作
- **内存增长 / Memory Growth**: 内存泄漏检测

### 性能阈值 / Performance Thresholds

| 操作 / Operation | 目标 / Target | 警告 / Warning |
|-----------------|--------------|---------------|
| Agent 初始化 / Init | <500ms | >1000ms |
| 消息发送 / Send Message | <100ms | >200ms |
| IPC 往返 / IPC Round-trip | <10ms | >20ms |
| 数据库查询 / DB Query | <5ms | >10ms |

## 常见问题诊断 / Common Issues

### 1. 应用启动慢 / Slow App Startup

**诊断 / Diagnosis:**

```bash
# 启用性能日志
# Enable performance logging
ACP_PERF=1 npm start
```

**查看日志中的 / Check logs for:**
- Agent 初始化时间
- 数据库加载时间
- MCP 服务器检测时间

### 2. 消息发送延迟 / Message Send Delay

**诊断 / Diagnosis:**

```bash
# 启用详细日志
# Enable verbose logging
ACP_PERF=1 PERF_MONITOR=1 npm start
```

**检查 / Check:**
- `AcpAgentManager.sendMessage` 执行时间
- Agent 初始化是否被重复调用
- 网络请求延迟

### 3. 内存泄漏 / Memory Leak

**诊断 / Diagnosis:**

```typescript
// 获取内存统计
// Get memory stats
const memStats = performanceMonitor.getMemoryStats();
console.log('Memory Growth:', memStats.growth);
```

**检查 / Check:**
- 堆内存持续增长
- 未清理的事件监听器
- 未关闭的流

### 4. MCP 连接失败 / MCP Connection Failure

**诊断 / Diagnosis:**

```bash
# 验证 MCP 配置
# Validate MCP configuration
npm run debug:mcp:validate

# 测试特定服务器
# Test specific server
npx tsx scripts/debug-mcp.ts test <server-name>
```

**检查 / Check:**
- CLI 工具是否在 PATH 中
- MCP 服务器配置是否正确
- 传输类型是否支持

## 环境变量 / Environment Variables

| 变量 / Variable | 说明 / Description |
|----------------|-------------------|
| `ACP_PERF=1` | 启用 ACP 性能日志 / Enable ACP performance logs |
| `PERF_MONITOR=1` | 启用运行时性能监控 / Enable runtime performance monitoring |
| `MCP_DEBUG=1` | 启用 MCP 调试日志 / Enable MCP debug logs |
| `DEBUG=aionui:*` | 启用所有调试日志 / Enable all debug logs |
| `ELECTRON_ENABLE_LOGGING=1` | 启用 Electron 日志 / Enable Electron logging |

## 日志位置 / Log Locations

- **性能日志 / Performance Logs**: `logs/perf-*.json`
- **性能报告 / Performance Reports**: `logs/perf-report-*.json`
- **应用日志 / App Logs**: Console output

## 最佳实践 / Best Practices

1. **定期监控 / Regular Monitoring**
   - 在开发过程中启用性能监控
   - 定期生成性能报告
   - 跟踪性能趋势

2. **优化前测量 / Measure Before Optimizing**
   - 使用性能监控器识别瓶颈
   - 关注慢操作（>100ms）
   - 优先优化热路径

3. **内存管理 / Memory Management**
   - 定期检查内存增长
   - 清理事件监听器
   - 关闭不再使用的流

4. **MCP 配置 / MCP Configuration**
   - 验证配置后再使用
   - 测试连接稳定性
   - 使用支持的传输类型

## 参考资料 / References

- [性能优化指南 / Performance Optimization Guide](./PERFORMANCE_OPTIMIZATION.md)
- [MCP 协议文档 / MCP Protocol Docs](https://modelcontextprotocol.io/)
- [Electron 性能 / Electron Performance](https://www.electronjs.org/docs/latest/tutorial/performance)

## 获取帮助 / Getting Help

如果遇到问题：

If you encounter issues:

1. 启用详细日志 / Enable verbose logging
2. 生成性能报告 / Generate performance report
3. 检查常见问题 / Check common issues
4. 提交 Issue 并附上日志 / Submit issue with logs

