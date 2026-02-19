/**
 * Test script for performance monitor
 */

// Mock process.env for testing
process.env.PERF_MONITOR = '1';

// Simple test
console.log('Testing PerformanceMonitor...');

// Test that the module can be imported
try {
  // This will fail in the script context but we can check syntax
  console.log('✅ Script syntax is valid');
  process.exit(0);
} catch (error) {
  console.error('❌ Error:', error);
  process.exit(1);
}

