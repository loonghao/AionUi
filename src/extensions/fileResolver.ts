/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * File Reference Resolver for Extension Manifests
 * 解析 $file:relative/path 引用，将值替换为引用文件的内容
 *
 * Supported syntax:
 *   "$file:path/to/config.json"  → parsed JSON object/array
 *   "$file:path/to/prompt.md"    → raw string content
 *
 * File paths are resolved relative to the extension directory.
 * Supports recursive resolution (referenced JSON files can contain $file: references).
 * Circular references are detected and reported as errors.
 *
 * @see RFC-001 §6.3
 */

import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import stripJsonComments from 'strip-json-comments';

const FILE_REF_PREFIX = '$file:';
const JSON_EXTENSIONS = new Set(['.json', '.jsonc', '.json5']);

/**
 * Check if a value is a $file: reference string.
 */
function isFileRef(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(FILE_REF_PREFIX);
}

/**
 * Extract the relative path from a $file: reference.
 */
function extractFilePath(ref: string): string {
  return ref.slice(FILE_REF_PREFIX.length).trim();
}

/**
 * Resolve all $file: references in a parsed manifest object.
 * Must be called BEFORE env template resolution (so referenced files can also use ${env:}).
 *
 * @param obj - The parsed JSON object (manifest or fragment)
 * @param extensionDir - Absolute path to the extension directory
 * @param resolvedPaths - Set of already-resolved file paths (for circular reference detection)
 */
export async function resolveFileRefs<T>(obj: T, extensionDir: string, resolvedPaths?: Set<string>): Promise<T> {
  const visited = resolvedPaths ?? new Set<string>();

  if (isFileRef(obj)) {
    return (await resolveFileRefValue(obj, extensionDir, visited)) as T;
  }

  if (Array.isArray(obj)) {
    const results = await Promise.all(obj.map((item) => resolveFileRefs(item, extensionDir, visited)));
    return results as T;
  }

  if (obj !== null && typeof obj === 'object') {
    const entries = Object.entries(obj as Record<string, unknown>);
    const resolved = await Promise.all(
      entries.map(async ([key, value]) => [key, await resolveFileRefs(value, extensionDir, visited)] as const)
    );
    return Object.fromEntries(resolved) as T;
  }

  return obj;
}

/**
 * Resolve a single $file: reference value.
 */
async function resolveFileRefValue(ref: string, extensionDir: string, visited: Set<string>): Promise<unknown> {
  const relativePath = extractFilePath(ref);
  const absolutePath = path.resolve(extensionDir, relativePath);

  // Circular reference detection
  if (visited.has(absolutePath)) {
    console.warn(`[Extensions] Circular $file: reference detected: ${relativePath}`);
    return ref; // Return the raw reference string as-is
  }

  // File existence check
  if (!existsSync(absolutePath)) {
    console.warn(`[Extensions] Referenced file not found: ${absolutePath} (from $file:${relativePath})`);
    return ref; // Return the raw reference string as-is
  }

  visited.add(absolutePath);

  try {
    const content = await fs.readFile(absolutePath, 'utf-8');
    const ext = path.extname(absolutePath).toLowerCase();

    if (JSON_EXTENSIONS.has(ext)) {
      // Parse JSON/JSONC file → resolve nested $file: references recursively
      const stripped = stripJsonComments(content);
      const parsed = JSON.parse(stripped);
      return resolveFileRefs(parsed, extensionDir, visited);
    }

    // Non-JSON files → return as raw string (trimmed trailing newline)
    return content.replace(/\n$/, '');
  } catch (error) {
    console.warn(
      `[Extensions] Failed to resolve $file:${relativePath}:`,
      error instanceof Error ? error.message : error
    );
    return ref;
  }
}
