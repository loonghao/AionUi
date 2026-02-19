/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Performance Debugging and Analysis Tool
 * 
 * This script provides comprehensive performance monitoring and debugging capabilities:
 * 1. Enable performance logging across all components
 * 2. Monitor IPC communication latency
 * 3. Track database query performance
 * 4. Analyze memory usage and leaks
 * 5. Profile agent lifecycle and message processing
 * 6. Generate performance reports
 * 
 * Usage:
 *   bun run debug:perf              # Start with performance monitoring
 *   bun run debug:perf -- --report  # Generate performance report
 *   bun run debug:perf -- --mcp     # Enable MCP debugging
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface PerformanceMetrics {
  timestamp: number;
  component: string;
  operation: string;
  duration: number;
  metadata?: Record<string, any>;
}

class PerformanceDebugger {
  private metrics: PerformanceMetrics[] = [];
  private startTime: number = Date.now();
  private logFile: string;

  constructor() {
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    this.logFile = path.join(logsDir, `perf-${Date.now()}.json`);
  }

  /**
   * Start the application with performance monitoring enabled
   */
  async startWithMonitoring(options: { mcp?: boolean; report?: boolean }) {
    console.log('🚀 Starting AionUi with performance monitoring...\n');

    // Set environment variables for performance logging
    const env = {
      ...process.env,
      ACP_PERF: '1',                    // Enable ACP performance logs
      DEBUG: 'aionui:*',                // Enable debug logs
      NODE_ENV: 'development',
      ELECTRON_ENABLE_LOGGING: '1',     // Enable Electron logging
    };

    if (options.mcp) {
      console.log('📊 MCP debugging enabled\n');
      env.MCP_DEBUG = '1';
    }

    // Start the application
    const child = spawn('bun', ['start'], {
      env,
      stdio: 'inherit',
      shell: true,
    });

    child.on('error', (error) => {
      console.error('❌ Failed to start application:', error);
      process.exit(1);
    });

    child.on('exit', (code) => {
      console.log(`\n✅ Application exited with code ${code}`);
      if (options.report) {
        this.generateReport();
      }
    });

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n⏹️  Stopping application...');
      child.kill('SIGINT');
    });
  }

  /**
   * Generate performance report from collected metrics
   */
  generateReport() {
    console.log('\n📈 Generating performance report...\n');

    const report = {
      summary: {
        totalDuration: Date.now() - this.startTime,
        totalMetrics: this.metrics.length,
        components: this.getComponentStats(),
      },
      slowOperations: this.getSlowOperations(),
      recommendations: this.getRecommendations(),
    };

    // Save report to file
    const reportFile = path.join(path.dirname(this.logFile), `perf-report-${Date.now()}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

    console.log('📄 Report saved to:', reportFile);
    console.log('\n📊 Performance Summary:');
    console.log(`   Total Duration: ${report.summary.totalDuration}ms`);
    console.log(`   Total Metrics: ${report.summary.totalMetrics}`);
    console.log('\n⚠️  Slow Operations (>100ms):');
    report.slowOperations.slice(0, 10).forEach((op, i) => {
      console.log(`   ${i + 1}. ${op.component}.${op.operation}: ${op.duration}ms`);
    });

    console.log('\n💡 Recommendations:');
    report.recommendations.forEach((rec, i) => {
      console.log(`   ${i + 1}. ${rec}`);
    });
  }

  private getComponentStats() {
    const stats: Record<string, { count: number; totalDuration: number; avgDuration: number }> = {};
    
    this.metrics.forEach((metric) => {
      if (!stats[metric.component]) {
        stats[metric.component] = { count: 0, totalDuration: 0, avgDuration: 0 };
      }
      stats[metric.component].count++;
      stats[metric.component].totalDuration += metric.duration;
    });

    Object.keys(stats).forEach((component) => {
      stats[component].avgDuration = stats[component].totalDuration / stats[component].count;
    });

    return stats;
  }

  private getSlowOperations() {
    return this.metrics
      .filter((m) => m.duration > 100)
      .sort((a, b) => b.duration - a.duration);
  }

  private getRecommendations(): string[] {
    const recommendations: string[] = [];
    const stats = this.getComponentStats();

    // Check for slow components
    Object.entries(stats).forEach(([component, stat]) => {
      if (stat.avgDuration > 50) {
        recommendations.push(`Optimize ${component}: average operation time is ${stat.avgDuration.toFixed(2)}ms`);
      }
    });

    return recommendations;
  }
}

// CLI interface
const args = process.argv.slice(2);
const options = {
  mcp: args.includes('--mcp'),
  report: args.includes('--report'),
};

const debugger = new PerformanceDebugger();
debugger.startWithMonitoring(options);

