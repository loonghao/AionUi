/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Dependency Resolver
 * P2: 扩展依赖验证和解析
 *
 * 验证扩展之间的依赖关系，确保：
 * - 所有依赖都已安装
 * - 版本范围兼容
 * - 没有循环依赖
 */

import type { ExtensionManifest } from './types';

export interface DependencyIssue {
  type: 'missing' | 'version_mismatch' | 'circular';
  extensionName: string;
  dependencyName: string;
  requiredVersion?: string;
  installedVersion?: string;
  message: string;
}

export interface DependencyValidationResult {
  valid: boolean;
  issues: DependencyIssue[];
  loadOrder: string[];
}

/**
 * Simple semver comparison utilities
 */
function parseVersion(version: string): { major: number; minor: number; patch: number } | null {
  // Remove leading ^ or ~
  const clean = version.replace(/^[\^~]/, '');
  const parts = clean.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 3 || parts.some(isNaN)) {
    return null;
  }
  return { major: parts[0], minor: parts[1], patch: parts[2] };
}

/**
 * Check if a version satisfies a version range.
 * Only supports simple ^ and ~ ranges.
 */
function satisfiesVersion(version: string, range: string): boolean {
  const parsedVersion = parseVersion(version);
  const parsedRange = parseVersion(range);
  if (!parsedVersion || !parsedRange) return false;

  // Exact match
  if (range === version) return true;

  // ^ (caret) - compatible with version (same major)
  if (range.startsWith('^')) {
    return (
      parsedVersion.major === parsedRange.major &&
      (parsedVersion.minor > parsedRange.minor ||
        (parsedVersion.minor === parsedRange.minor && parsedVersion.patch >= parsedRange.patch))
    );
  }

  // ~ (tilde) - approximately equivalent (same major.minor)
  if (range.startsWith('~')) {
    return (
      parsedVersion.major === parsedRange.major &&
      parsedVersion.minor === parsedRange.minor &&
      parsedVersion.patch >= parsedRange.patch
    );
  }

  // Simple version comparison (>=)
  return (
    parsedVersion.major > parsedRange.major ||
    (parsedVersion.major === parsedRange.major &&
      (parsedVersion.minor > parsedRange.minor ||
        (parsedVersion.minor === parsedRange.minor && parsedVersion.patch >= parsedRange.patch)))
  );
}

/**
 * Detect circular dependencies using DFS.
 */
function detectCircularDependencies(
  graph: Map<string, Set<string>>,
  start: string,
  visited: Set<string>,
  path: Set<string>
): string[] | null {
  visited.add(start);
  path.add(start);

  const deps = graph.get(start);
  if (deps) {
    for (const dep of deps) {
      if (!visited.has(dep)) {
        const cycle = detectCircularDependencies(graph, dep, visited, path);
        if (cycle) return cycle;
      } else if (path.has(dep)) {
        // Found a cycle
        return [dep, start];
      }
    }
  }

  path.delete(start);
  return null;
}

/**
 * Topological sort to determine load order.
 */
function topologicalSort(graph: Map<string, Set<string>>, nodes: string[]): string[] {
  const visited = new Set<string>();
  const result: string[] = [];

  function visit(node: string) {
    if (visited.has(node)) return;
    visited.add(node);

    const deps = graph.get(node);
    if (deps) {
      for (const dep of deps) {
        visit(dep);
      }
    }

    result.push(node);
  }

  for (const node of nodes) {
    visit(node);
  }

  return result;
}

/**
 * Validate dependencies for a list of extensions.
 * Returns validation result with issues and suggested load order.
 */
export function validateDependencies(
  extensions: ExtensionManifest[]
): DependencyValidationResult {
  const issues: DependencyIssue[] = [];
  const extensionMap = new Map<string, ExtensionManifest>();
  const dependencyGraph = new Map<string, Set<string>>();

  // Build extension map and dependency graph
  for (const ext of extensions) {
    extensionMap.set(ext.name, ext);
    dependencyGraph.set(ext.name, new Set());

    if (ext.dependencies) {
      for (const [depName] of Object.entries(ext.dependencies)) {
        dependencyGraph.get(ext.name)!.add(depName);
      }
    }
  }

  // Check for missing dependencies and version mismatches
  for (const ext of extensions) {
    if (!ext.dependencies) continue;

    for (const [depName, requiredVersion] of Object.entries(ext.dependencies)) {
      const dep = extensionMap.get(depName);

      if (!dep) {
        issues.push({
          type: 'missing',
          extensionName: ext.name,
          dependencyName: depName,
          requiredVersion,
          message: `Extension "${ext.name}" requires "${depName}@${requiredVersion}" which is not installed`,
        });
      } else {
        const installedVersion = dep.version;
        if (!satisfiesVersion(installedVersion, requiredVersion)) {
          issues.push({
            type: 'version_mismatch',
            extensionName: ext.name,
            dependencyName: depName,
            requiredVersion,
            installedVersion,
            message: `Extension "${ext.name}" requires "${depName}@${requiredVersion}" but version ${installedVersion} is installed`,
          });
        }
      }
    }
  }

  // Check for circular dependencies
  const visited = new Set<string>();
  for (const ext of extensions) {
    if (!visited.has(ext.name)) {
      const cycle = detectCircularDependencies(dependencyGraph, ext.name, visited, new Set());
      if (cycle) {
        issues.push({
          type: 'circular',
          extensionName: cycle[1],
          dependencyName: cycle[0],
          message: `Circular dependency detected: ${cycle[0]} -> ${cycle[1]}`,
        });
      }
    }
  }

  // Calculate load order (extensions without dependencies first)
  const loadOrder = topologicalSort(dependencyGraph, extensions.map((e) => e.name));

  return {
    valid: issues.length === 0,
    issues,
    loadOrder,
  };
}

/**
 * Sort extensions by dependency order.
 * Extensions without dependencies come first, then extensions that depend on them.
 */
export function sortByDependencyOrder(
  extensions: { manifest: ExtensionManifest; [key: string]: unknown }[]
): { manifest: ExtensionManifest; [key: string]: unknown }[] {
  const manifests = extensions.map((e) => e.manifest);
  const result = validateDependencies(manifests);

  if (!result.valid) {
    console.warn('[Extensions] Dependency validation issues:', result.issues);
  }

  // Create a map for quick lookup
  const extMap = new Map(extensions.map((e) => [e.manifest.name, e]));

  // Sort by load order
  return result.loadOrder
    .filter((name) => extMap.has(name))
    .map((name) => extMap.get(name)!);
}
