/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Extension Hot Reload Watcher
 * P2: 扩展热重载机制
 *
 * 监听扩展目录的变化，自动重新加载扩展：
 * - aion-extension.json 文件变更
 * - 扩展目录的新增/删除
 *
 * ## 使用方式
 * ```typescript
 * const watcher = new ExtensionWatcher();
 * watcher.onReload((extensions) => {
 *   console.log('Extensions reloaded:', extensions.length);
 * });
 * watcher.start();
 * ```
 *
 * ## 注意事项
 * - 热重载仅影响数据驱动的贡献（ACP、MCP、Assistant、Skill、Theme）
 * - 动态加载的 JS 模块（Channel Plugin、WebUI）无法热卸载
 * - 生产环境默认禁用，需要显式启用
 */

import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { ExtensionRegistry } from './ExtensionRegistry';
import { ExtensionLoader } from './ExtensionLoader';
import type { LoadedExtension } from './types';
import {
  getUserExtensionsDir,
  getAppDataExtensionsDir,
  getEnvExtensionsDirs,
  EXTENSION_MANIFEST_FILE,
} from './constants';

export interface ExtensionWatcherOptions {
  /**
   * Enable hot reload in production environment.
   * Default: false (only enabled in development)
   */
  enableInProduction?: boolean;

  /**
   * Debounce delay in milliseconds for file change events.
   * Default: 1000ms
   */
  debounceDelay?: number;

  /**
   * Directories to watch (defaults to all extension source directories)
   */
  directories?: string[];
}

type ReloadCallback = (extensions: LoadedExtension[]) => void;

export class ExtensionWatcher extends EventEmitter {
  private watchers: fs.FSWatcher[] = [];
  private options: Required<ExtensionWatcherOptions>;
  private isWatching = false;
  private debounceTimer: NodeJS.Timeout | null = null;
  private pendingChanges: Set<string> = new Set();

  static readonly RELOAD_EVENT = 'reload';
  static readonly ERROR_EVENT = 'error';

  constructor(options?: ExtensionWatcherOptions) {
    super();
    this.options = {
      enableInProduction: false,
      debounceDelay: 1000,
      directories: [],
      ...options,
    };
  }

  /**
   * Check if hot reload is enabled.
   * Disabled by default in production unless explicitly enabled.
   */
  private isHotReloadEnabled(): boolean {
    const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
    return isDev || this.options.enableInProduction;
  }

  /**
   * Start watching extension directories for changes.
   */
  start(): void {
    if (this.isWatching) {
      console.warn('[Extensions] Watcher already running');
      return;
    }

    if (!this.isHotReloadEnabled()) {
      console.log('[Extensions] Hot reload disabled in production');
      return;
    }

    const directories = this.options.directories.length > 0
      ? this.options.directories
      : this.getDefaultDirectories();

    for (const dir of directories) {
      this.watchDirectory(dir);
    }

    this.isWatching = true;
    console.log(`[Extensions] Hot reload watcher started for ${directories.length} director(y/ies)`);
  }

  /**
   * Stop watching extension directories.
   */
  stop(): void {
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.isWatching = false;
    this.pendingChanges.clear();
    console.log('[Extensions] Hot reload watcher stopped');
  }

  /**
   * Register a callback for reload events.
   */
  onReload(callback: ReloadCallback): this {
    this.on(ExtensionWatcher.RELOAD_EVENT, callback);
    return this;
  }

  /**
   * Register a callback for error events.
   */
  onError(callback: (error: Error) => void): this {
    this.on(ExtensionWatcher.ERROR_EVENT, callback);
    return this;
  }

  /**
   * Get default directories to watch.
   */
  private getDefaultDirectories(): string[] {
    const dirs: string[] = [];

    const userDir = getUserExtensionsDir();
    dirs.push(userDir);

    const appDataDir = getAppDataExtensionsDir();
    if (appDataDir !== userDir) {
      dirs.push(appDataDir);
    }

    const envDirs = getEnvExtensionsDirs();
    dirs.push(...envDirs);

    return dirs.filter((dir) => fs.existsSync(dir));
  }

  /**
   * Watch a directory for changes.
   */
  private watchDirectory(dir: string): void {
    try {
      // Watch the parent directory to detect new extension folders
      const watcher = fs.watch(
        dir,
        { persistent: false, recursive: false },
        (eventType, filename) => {
          if (!filename) return;

          const fullPath = path.join(dir, filename);
          this.handleChange(fullPath, eventType);
        }
      );

      watcher.on('error', (error) => {
        console.error(`[Extensions] Watcher error for ${dir}:`, error);
        this.emit(ExtensionWatcher.ERROR_EVENT, error);
      });

      this.watchers.push(watcher);

      // Also watch existing extension subdirectories for manifest changes
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          this.watchExtensionDirectory(path.join(dir, entry.name));
        }
      }
    } catch (error) {
      console.warn(`[Extensions] Failed to watch directory ${dir}:`, error);
    }
  }

  /**
   * Watch an individual extension directory for manifest changes.
   */
  private watchExtensionDirectory(extDir: string): void {
    const manifestPath = path.join(extDir, EXTENSION_MANIFEST_FILE);
    if (!fs.existsSync(manifestPath)) return;

    try {
      const watcher = fs.watch(
        manifestPath,
        { persistent: false },
        (eventType) => {
          if (eventType === 'change') {
            this.handleChange(manifestPath, 'change');
          }
        }
      );

      watcher.on('error', (error) => {
        console.error(`[Extensions] Manifest watcher error for ${manifestPath}:`, error);
      });

      this.watchers.push(watcher);
    } catch (error) {
      // Ignore errors for individual manifest files
    }
  }

  /**
   * Handle a file system change event.
   */
  private handleChange(path: string, eventType: string): void {
    this.pendingChanges.add(path);

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.processPendingChanges();
    }, this.options.debounceDelay);
  }

  /**
   * Process accumulated file changes and trigger reload.
   */
  private async processPendingChanges(): Promise<void> {
    if (this.pendingChanges.size === 0) return;

    const changedPaths = [...this.pendingChanges];
    this.pendingChanges.clear();

    console.log(`[Extensions] Detected changes in ${changedPaths.length} file(s), reloading...`);

    try {
      // Reset and reinitialize the registry
      ExtensionRegistry.resetInstance();
      const registry = ExtensionRegistry.getInstance();
      await registry.initialize();

      const extensions = registry.getLoadedExtensions();
      this.emit(ExtensionWatcher.RELOAD_EVENT, extensions);
    } catch (error) {
      console.error('[Extensions] Failed to reload extensions:', error);
      this.emit(ExtensionWatcher.ERROR_EVENT, error instanceof Error ? error : new Error(String(error)));
    }
  }
}
