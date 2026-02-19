/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ChannelPluginResolver
 * Resolves channel plugin contributions from extensions.
 * Each entryPoint must export a class that extends BasePlugin.
 *
 * @see RFC-003 §3.4
 *
 * ## ⚠️ Security Warning (P0 Fix)
 *
 * This module dynamically loads and executes JavaScript code from external extensions.
 * Extension code runs in the same Node.js process as the main application with FULL access to:
 * - File system (read/write any file the app can access)
 * - Network (make any HTTP request, open any port)
 * - Child processes (execute any command)
 * - Environment variables and process memory
 *
 * **Only load extensions from trusted sources.**
 *
 * Future improvements planned:
 * - v2.1: Extension signing and verification
 * - v3.0: Worker thread isolation with limited capabilities
 *
 * To enable security logging, set environment variable: AIONUI_EXTENSION_DEBUG=1
 */

import path from 'path';
import fs from 'fs';
import { BasePlugin } from '@/channels/plugins/BasePlugin';
import type { ExtChannelPlugin, LoadedExtension } from '../types';

type PluginConstructor = new () => BasePlugin;

export interface ResolvedChannelPlugin {
  constructor: PluginConstructor;
  meta: ExtChannelPlugin;
}

/** Security flag for debug logging */
const DEBUG_ENABLED = process.env.AIONUI_EXTENSION_DEBUG === '1' || process.env.AIONUI_EXTENSION_DEBUG === 'true';

/**
 * Log a security-related message when debug mode is enabled.
 */
function logSecurity(message: string): void {
  if (DEBUG_ENABLED) {
    console.log(`[Extension Security] ${message}`);
  }
}

/**
 * Resolve channel plugin contributions from loaded extensions.
 * Dynamically loads JS entry points and validates BasePlugin inheritance.
 */
export function resolveChannelPlugins(
  extensions: LoadedExtension[]
): Map<string, ResolvedChannelPlugin> {
  const result = new Map<string, ResolvedChannelPlugin>();

  for (const ext of extensions) {
    const plugins = ext.manifest.contributes.channelPlugins;
    if (!plugins || plugins.length === 0) continue;

    for (const plugin of plugins) {
      const entryPath = path.resolve(ext.directory, plugin.entryPoint);

      // Security: entry point must be within the extension directory
      if (!entryPath.startsWith(ext.directory)) {
        console.warn(
          `[Extension] Path traversal detected in channel plugin: ${plugin.entryPoint}`
        );
        continue;
      }

      if (!fs.existsSync(entryPath)) {
        console.warn(
          `[Extension] Channel plugin entry not found: ${entryPath}`
        );
        continue;
      }

      // Skip duplicates
      if (result.has(plugin.type)) {
        console.warn(
          `[Extension] Duplicate channel plugin type "${plugin.type}", skipping`
        );
        continue;
      }

      // Security warning before loading external code
      logSecurity(
        `Loading channel plugin "${plugin.type}" from: ${entryPath}\n` +
          `  ⚠️  This code will run with FULL process privileges.\n` +
          `  ⚠️  Only load extensions from trusted sources.`
      );

      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires, no-eval
        const nativeRequire = eval('require') as NodeRequire;
        const mod = nativeRequire(entryPath);
        const PluginClass = mod.default || mod.Plugin || mod[Object.keys(mod)[0]];

        // Validate inheritance
        if (!PluginClass || !(PluginClass.prototype instanceof BasePlugin)) {
          console.warn(
            `[Extension] Channel plugin "${plugin.type}": exported class must extend BasePlugin`
          );
          continue;
        }

        result.set(plugin.type, {
          constructor: PluginClass as PluginConstructor,
          meta: plugin,
        });
        console.log(
          `[Extension] Loaded channel plugin: ${plugin.type} (${plugin.name})`
        );
        logSecurity(`Channel plugin "${plugin.type}" loaded successfully`);
      } catch (error) {
        console.error(
          `[Extension] Failed to load channel plugin "${plugin.type}":`,
          error
        );
      }
    }
  }

  return result;
}
