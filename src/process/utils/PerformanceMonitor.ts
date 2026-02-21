/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Runtime Performance Monitor
 * 
 * Provides real-time performance monitoring and profiling capabilities:
 * - Track operation durations
 * - Monitor memory usage
 * - Detect performance bottlenecks
 * - Generate performance reports
 */

interface PerformanceEntry {
  id: string;
  operation: string;
  component: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, any>;
}

interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}

class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private entries: Map<string, PerformanceEntry> = new Map();
  private completedEntries: PerformanceEntry[] = [];
  private memorySnapshots: MemorySnapshot[] = [];
  private enabled: boolean = false;
  private memoryMonitorInterval?: NodeJS.Timeout;

  private constructor() {
    // Enable if ACP_PERF or PERF_MONITOR env var is set
    this.enabled = process.env.ACP_PERF === '1' || process.env.PERF_MONITOR === '1';
    
    if (this.enabled) {
      console.log('[PerformanceMonitor] Enabled');
      this.startMemoryMonitoring();
    }
  }

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Start tracking an operation
   */
  start(component: string, operation: string, metadata?: Record<string, any>): string {
    if (!this.enabled) return '';

    const id = `${component}:${operation}:${Date.now()}:${Math.random()}`;
    const entry: PerformanceEntry = {
      id,
      component,
      operation,
      startTime: Date.now(),
      metadata,
    };

    this.entries.set(id, entry);
    return id;
  }

  /**
   * End tracking an operation
   */
  end(id: string, metadata?: Record<string, any>): number | undefined {
    if (!this.enabled || !id) return undefined;

    const entry = this.entries.get(id);
    if (!entry) {
      console.warn(`[PerformanceMonitor] Entry not found: ${id}`);
      return undefined;
    }

    entry.endTime = Date.now();
    entry.duration = entry.endTime - entry.startTime;
    if (metadata) {
      entry.metadata = { ...entry.metadata, ...metadata };
    }

    this.entries.delete(id);
    this.completedEntries.push(entry);

    // Log slow operations
    if (entry.duration > 100) {
      console.warn(
        `[PerformanceMonitor] Slow operation: ${entry.component}.${entry.operation} took ${entry.duration}ms`,
        entry.metadata
      );
    }

    return entry.duration;
  }

  /**
   * Measure a synchronous function
   */
  measure<T>(component: string, operation: string, fn: () => T, metadata?: Record<string, any>): T {
    const id = this.start(component, operation, metadata);
    try {
      const result = fn();
      this.end(id);
      return result;
    } catch (error) {
      this.end(id, { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Measure an async function
   */
  async measureAsync<T>(
    component: string,
    operation: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const id = this.start(component, operation, metadata);
    try {
      const result = await fn();
      this.end(id);
      return result;
    } catch (error) {
      this.end(id, { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Start monitoring memory usage
   */
  private startMemoryMonitoring() {
    this.memoryMonitorInterval = setInterval(() => {
      const usage = process.memoryUsage();
      this.memorySnapshots.push({
        timestamp: Date.now(),
        heapUsed: usage.heapUsed,
        heapTotal: usage.heapTotal,
        external: usage.external,
        rss: usage.rss,
      });

      // Keep only last 1000 snapshots
      if (this.memorySnapshots.length > 1000) {
        this.memorySnapshots.shift();
      }
    }, 5000); // Every 5 seconds
  }

  /**
   * Get performance statistics
   */
  getStats() {
    const stats: Record<string, { count: number; totalDuration: number; avgDuration: number; maxDuration: number }> = {};

    this.completedEntries.forEach((entry) => {
      const key = `${entry.component}.${entry.operation}`;
      if (!stats[key]) {
        stats[key] = { count: 0, totalDuration: 0, avgDuration: 0, maxDuration: 0 };
      }
      stats[key].count++;
      stats[key].totalDuration += entry.duration || 0;
      stats[key].maxDuration = Math.max(stats[key].maxDuration, entry.duration || 0);
    });

    Object.keys(stats).forEach((key) => {
      stats[key].avgDuration = stats[key].totalDuration / stats[key].count;
    });

    return stats;
  }

  /**
   * Get memory statistics
   */
  getMemoryStats() {
    if (this.memorySnapshots.length === 0) return null;

    const latest = this.memorySnapshots[this.memorySnapshots.length - 1];
    const first = this.memorySnapshots[0];

    return {
      current: latest,
      growth: {
        heapUsed: latest.heapUsed - first.heapUsed,
        heapTotal: latest.heapTotal - first.heapTotal,
        rss: latest.rss - first.rss,
      },
      snapshots: this.memorySnapshots.length,
    };
  }

  /**
   * Clear all collected data
   */
  clear() {
    this.completedEntries = [];
    this.memorySnapshots = [];
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.memoryMonitorInterval) {
      clearInterval(this.memoryMonitorInterval);
    }
  }
}

export const performanceMonitor = PerformanceMonitor.getInstance();

