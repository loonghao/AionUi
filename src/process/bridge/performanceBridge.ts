/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Performance Monitoring IPC Bridge
 *
 * Exposes performance monitoring data to the renderer process
 */

import { performance } from '@/common/ipcBridge';
import { performanceMonitor } from '@process/utils/PerformanceMonitor';

export function initPerformanceBridge() {
  // Get performance statistics
  performance.getStats.provider(async () => {
    try {
      const stats = performanceMonitor.getStats();
      const memory = performanceMonitor.getMemoryStats();

      return {
        success: true,
        stats,
        memory,
      };
    } catch (error) {
      console.error('[PerformanceBridge] Failed to get stats:', error);
      return {
        success: false,
      };
    }
  });

  // Clear performance data
  performance.clear.provider(async () => {
    try {
      performanceMonitor.clear();
      return { success: true };
    } catch (error) {
      console.error('[PerformanceBridge] Failed to clear data:', error);
      return { success: false };
    }
  });

  // Generate performance report
  performance.generateReport.provider(async () => {
    try {
      const stats = performanceMonitor.getStats();
      const memory = performanceMonitor.getMemoryStats();

      // Calculate summary
      const operations = Object.values(stats);
      const totalOperations = operations.reduce((sum, op) => sum + op.count, 0);
      const slowOperations = operations.filter((op) => op.avgDuration > 100).length;
      const avgDuration =
        operations.reduce((sum, op) => sum + op.totalDuration, 0) / totalOperations || 0;

      // Get top slow operations
      const topSlowOperations = Object.entries(stats)
        .map(([operation, data]) => ({
          operation,
          ...data,
        }))
        .sort((a, b) => b.avgDuration - a.avgDuration)
        .slice(0, 10);

      // Generate recommendations
      const recommendations: string[] = [];

      topSlowOperations.forEach((op) => {
        if (op.avgDuration > 100) {
          recommendations.push(
            `Optimize ${op.operation}: average ${op.avgDuration.toFixed(2)}ms (max ${op.maxDuration}ms)`
          );
        }
      });

      if (memory && memory.growth.heapUsed > 50 * 1024 * 1024) {
        recommendations.push(
          `Memory growth detected: ${(memory.growth.heapUsed / 1024 / 1024).toFixed(2)}MB increase`
        );
      }

      return {
        success: true,
        report: {
          summary: {
            totalOperations,
            slowOperations,
            avgDuration,
          },
          topSlowOperations,
          memoryUsage: memory
            ? {
                current: memory.current.heapUsed,
                growth: memory.growth.heapUsed,
              }
            : undefined,
          recommendations,
        },
      };
    } catch (error) {
      console.error('[PerformanceBridge] Failed to generate report:', error);
      return {
        success: false,
      };
    }
  });

  console.log('[PerformanceBridge] Initialized');
}

