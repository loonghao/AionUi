/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Extension Loader
 * 扫描文件系统中的扩展目录，读取并验证 aion-extension.json
 *
 * @see RFC-001 §6.4, RFC-002 Task 3
 */

import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import stripJsonComments from 'strip-json-comments';

import { ExtensionManifestSchema } from './types';
import type { LoadedExtension, ExtensionSource } from './types';
import { resolveEnvInObject, UndefinedEnvVariableError, type EnvResolveOptions } from './envResolver';
import { resolveFileRefs } from './fileResolver';
import {
  getUserExtensionsDir,
  getAppDataExtensionsDir,
  getEnvExtensionsDirs,
  EXTENSION_MANIFEST_FILE,
} from './constants';

export interface ExtensionLoaderOptions extends EnvResolveOptions {
  /**
   * If true, continue loading other extensions when one fails.
   * Defaults to true.
   */
  continueOnError?: boolean;
}

interface ScanSource {
  dir: string;
  source: ExtensionSource;
}

export class ExtensionLoader {
  private options: ExtensionLoaderOptions;

  constructor(options?: ExtensionLoaderOptions) {
    this.options = {
      continueOnError: true,
      ...options,
    };
  }

  /**
   * Scan all extension source directories, load and validate aion-extension.json files.
   * Invalid extensions are skipped with warnings. Duplicate names are resolved by priority.
   *
   * In strict mode, throws UndefinedEnvVariableError if any required environment variable is missing.
   */
  async loadAll(): Promise<LoadedExtension[]> {
    const scanSources = this.getScanSources();
    const allExtensions: LoadedExtension[] = [];
    const seenNames = new Set<string>();

    for (const { dir, source } of scanSources) {
      const extensions = await this.scanDirectory(dir, source);
      for (const ext of extensions) {
        if (seenNames.has(ext.manifest.name)) {
          console.warn(
            `[Extensions] Skipping duplicate extension "${ext.manifest.name}" from ${ext.directory} (already loaded)`
          );
          continue;
        }
        seenNames.add(ext.manifest.name);
        allExtensions.push(ext);
      }
    }

    return allExtensions;
  }

  /**
   * Collect all directories to scan, ordered by priority (highest first).
   * Priority: local (~/.aionui) > appdata > env paths
   */
  private getScanSources(): ScanSource[] {
    const sources: ScanSource[] = [];

    // Priority 1: User local extensions
    const userDir = getUserExtensionsDir();
    sources.push({ dir: userDir, source: 'local' });

    // Priority 2: App data extensions
    const appDataDir = getAppDataExtensionsDir();
    if (appDataDir !== userDir) {
      sources.push({ dir: appDataDir, source: 'appdata' });
    }

    // Priority 3: Environment variable paths
    const envDirs = getEnvExtensionsDirs();
    for (const dir of envDirs) {
      sources.push({ dir, source: 'env' });
    }

    return sources;
  }

  /**
   * Scan a single base directory for extension subdirectories.
   * Each subdirectory should contain an aion-extension.json file.
   */
  private async scanDirectory(baseDir: string, source: ExtensionSource): Promise<LoadedExtension[]> {
    if (!existsSync(baseDir)) {
      return [];
    }

    const extensions: LoadedExtension[] = [];

    try {
      const entries = await fs.readdir(baseDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const extensionDir = path.join(baseDir, entry.name);
        const manifestPath = path.join(extensionDir, EXTENSION_MANIFEST_FILE);

        if (!existsSync(manifestPath)) continue;

        try {
          const loaded = await this.loadManifest(extensionDir, manifestPath, source);
          if (loaded) {
            extensions.push(loaded);
          }
        } catch (error) {
          // In strict mode with UndefinedEnvVariableError, propagate the error
          if (error instanceof UndefinedEnvVariableError) {
            if (!this.options.continueOnError) {
              throw error;
            }
            console.error(
              `[Extensions] Failed to load extension from ${extensionDir}: ${error.message}`
            );
          } else {
            console.warn(
              `[Extensions] Failed to load extension from ${extensionDir}:`,
              error instanceof Error ? error.message : error
            );
          }
        }
      }
    } catch (error) {
      console.warn(
        `[Extensions] Failed to scan directory ${baseDir}:`,
        error instanceof Error ? error.message : error
      );
    }

    return extensions;
  }

  /**
   * Read and validate a single aion-extension.json manifest.
   * Supports JSONC (JSON with comments).
   *
   * In strict mode, throws UndefinedEnvVariableError if any required environment variable is missing.
   */
  private async loadManifest(
    extensionDir: string,
    manifestPath: string,
    source: ExtensionSource
  ): Promise<LoadedExtension | null> {
    const raw = await fs.readFile(manifestPath, 'utf-8');

    // Strip JSONC comments
    const jsonStr = stripJsonComments(raw);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (error) {
      console.warn(
        `[Extensions] Invalid JSON in ${manifestPath}:`,
        error instanceof Error ? error.message : error
      );
      return null;
    }

    // Resolve $file: references first (so referenced files can also use ${env:})
    const fileResolved = await resolveFileRefs(parsed, extensionDir);

    // Resolve ${env:VAR_NAME} templates before validation
    // This will throw in strict mode if any required env var is undefined
    const resolved = resolveEnvInObject(fileResolved, this.options);

    // Validate with Zod schema
    const result = ExtensionManifestSchema.safeParse(resolved);
    if (!result.success) {
      const errors = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      console.warn(`[Extensions] Schema validation failed for ${manifestPath}: ${errors}`);
      return null;
    }

    return {
      manifest: result.data,
      directory: extensionDir,
      source,
    };
  }
}
