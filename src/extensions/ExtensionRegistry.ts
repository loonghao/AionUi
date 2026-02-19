/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Extension Registry (Singleton)
 * 统一注册表，持有所有已加载的扩展并提供类型安全的查询 API
 *
 * @see RFC-001 §6.5, RFC-002 Task 4
 *
 * ## P2: Lifecycle Management
 * Extensions can be enabled/disabled at runtime:
 * - `disableExtension(name)`: Temporarily disables an extension's contributions
 * - `enableExtension(name)`: Re-enables a previously disabled extension
 * - Disabled extensions are still loaded but their contributions are filtered out
 */

import type { AcpBackendConfig } from '@/types/acpTypes';
import type { ICssTheme, IMcpServer } from '@/common/storage';
import type { SkillDefinition } from '@/process/task/AcpSkillManager';
import type { LoadedExtension, ExtChannelPlugin, ExtWebuiConfig } from './types';
import { ExtensionLoader } from './ExtensionLoader';
import { resolveAcpAdapters } from './resolvers/AcpAdapterResolver';
import { resolveMcpServers } from './resolvers/McpServerResolver';
import { resolveAssistants } from './resolvers/AssistantResolver';
import { resolveSkills } from './resolvers/SkillResolver';
import { resolveThemes } from './resolvers/ThemeResolver';
import { resolveChannelPlugins, type ResolvedChannelPlugin } from './resolvers/ChannelPluginResolver';

export interface ExtensionState {
  enabled: boolean;
  disabledAt?: Date;
  disabledReason?: string;
}

export class ExtensionRegistry {
  private static instance: ExtensionRegistry;

  private extensions: LoadedExtension[] = [];
  private initialized = false;

  /** P2: Track enabled/disabled state for each extension */
  private extensionStates: Map<string, ExtensionState> = new Map();

  // Resolved caches
  private _acpAdapters: AcpBackendConfig[] = [];
  private _mcpServers: IMcpServer[] = [];
  private _assistants: AcpBackendConfig[] = [];
  private _skills: SkillDefinition[] = [];
  private _themes: ICssTheme[] = [];
  private _channelPlugins: Map<string, ResolvedChannelPlugin> = new Map();
  private _webuiContributions: { config: ExtWebuiConfig; directory: string }[] = [];

  static getInstance(): ExtensionRegistry {
    if (!ExtensionRegistry.instance) {
      ExtensionRegistry.instance = new ExtensionRegistry();
    }
    return ExtensionRegistry.instance;
  }

  /**
   * Initialize: scan all extension sources, load manifests, resolve contributions.
   * Safe to call multiple times (no-op after first initialization).
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('[Extensions] Initializing extension registry...');
    const startTime = Date.now();

    try {
      const loader = new ExtensionLoader();
      this.extensions = await loader.loadAll();

      // Initialize all extensions as enabled
      for (const ext of this.extensions) {
        this.extensionStates.set(ext.manifest.name, { enabled: true });
      }

      // Resolve all contributions
      await this.resolveContributions();

      this.initialized = true;

      const elapsed = Date.now() - startTime;
      console.log(
        `[Extensions] Registry initialized in ${elapsed}ms: ` +
          `${this.extensions.length} extension(s), ` +
          `${this._acpAdapters.length} adapter(s), ` +
          `${this._mcpServers.length} MCP server(s), ` +
          `${this._assistants.length} assistant(s), ` +
          `${this._skills.length} skill(s), ` +
          `${this._themes.length} theme(s), ` +
          `${this._channelPlugins.size} channel plugin(s), ` +
          `${this._webuiContributions.length} webui contribution(s)`
      );
    } catch (error) {
      console.error('[Extensions] Failed to initialize registry:', error);
      // Mark as initialized to avoid blocking app startup on retry
      this.initialized = true;
    }
  }

  /**
   * P2: Disable an extension by name.
   * The extension's contributions will be removed from the resolved caches.
   * @returns true if the extension was disabled, false if not found or already disabled
   */
  disableExtension(name: string, reason?: string): boolean {
    const state = this.extensionStates.get(name);
    if (!state) {
      console.warn(`[Extensions] Cannot disable: extension "${name}" not found`);
      return false;
    }
    if (!state.enabled) {
      console.warn(`[Extensions] Extension "${name}" is already disabled`);
      return false;
    }

    state.enabled = false;
    state.disabledAt = new Date();
    state.disabledReason = reason;

    console.log(`[Extensions] Disabled extension "${name}"${reason ? `: ${reason}` : ''}`);

    // Re-resolve contributions to exclude disabled extension
    this.resolveContributions();

    return true;
  }

  /**
   * P2: Enable a previously disabled extension.
   * The extension's contributions will be re-added to the resolved caches.
   * @returns true if the extension was enabled, false if not found or already enabled
   */
  enableExtension(name: string): boolean {
    const state = this.extensionStates.get(name);
    if (!state) {
      console.warn(`[Extensions] Cannot enable: extension "${name}" not found`);
      return false;
    }
    if (state.enabled) {
      console.warn(`[Extensions] Extension "${name}" is already enabled`);
      return false;
    }

    state.enabled = true;
    state.disabledAt = undefined;
    state.disabledReason = undefined;

    console.log(`[Extensions] Enabled extension "${name}"`);

    // Re-resolve contributions to include enabled extension
    this.resolveContributions();

    return true;
  }

  /**
   * P2: Check if an extension is enabled.
   */
  isExtensionEnabled(name: string): boolean {
    const state = this.extensionStates.get(name);
    return state?.enabled ?? false;
  }

  /**
   * P2: Get the state of an extension.
   */
  getExtensionState(name: string): ExtensionState | undefined {
    return this.extensionStates.get(name);
  }

  /**
   * P2: Get list of disabled extensions with their states.
   */
  getDisabledExtensions(): Array<{ name: string; state: ExtensionState }> {
    const result: Array<{ name: string; state: ExtensionState }> = [];
    for (const [name, state] of this.extensionStates) {
      if (!state.enabled) {
        result.push({ name, state });
      }
    }
    return result;
  }

  /**
   * Internal: Resolve all contributions from enabled extensions.
   */
  private async resolveContributions(): Promise<void> {
    // Filter to only enabled extensions
    const enabledExtensions = this.extensions.filter((ext) =>
      this.isExtensionEnabled(ext.manifest.name)
    );

    this._acpAdapters = resolveAcpAdapters(enabledExtensions);
    this._mcpServers = resolveMcpServers(enabledExtensions);
    this._assistants = await resolveAssistants(enabledExtensions);
    this._skills = resolveSkills(enabledExtensions);
    this._themes = resolveThemes(enabledExtensions);
    this._channelPlugins = resolveChannelPlugins(enabledExtensions);
    this._webuiContributions = this.resolveWebuiContributions(enabledExtensions);
  }

  /** Get all loaded extensions */
  getLoadedExtensions(): LoadedExtension[] {
    return this.extensions;
  }

  /** Get all extension-contributed ACP adapters (converted to AcpBackendConfig) */
  getAcpAdapters(): AcpBackendConfig[] {
    return this._acpAdapters;
  }

  /** Get all extension-contributed MCP servers (converted to IMcpServer) */
  getMcpServers(): IMcpServer[] {
    return this._mcpServers;
  }

  /** Get all extension-contributed assistants (converted to AcpBackendConfig with isPreset=true) */
  getAssistants(): AcpBackendConfig[] {
    return this._assistants;
  }

  /** Get all extension-contributed skills (converted to SkillDefinition) */
  getSkills(): SkillDefinition[] {
    return this._skills;
  }

  /** Get all extension-contributed themes (converted to ICssTheme) */
  getThemes(): ICssTheme[] {
    return this._themes;
  }

  /** Get all extension-contributed channel plugins (type → { constructor, meta }) */
  getChannelPlugins(): Map<string, ResolvedChannelPlugin> {
    return this._channelPlugins;
  }

  /** Get metadata for a specific channel plugin type */
  getChannelPluginMeta(type: string): ExtChannelPlugin | undefined {
    return this._channelPlugins.get(type)?.meta;
  }

  /** Get all extension-contributed WebUI configurations */
  getWebuiContributions(): { config: ExtWebuiConfig; directory: string }[] {
    return this._webuiContributions;
  }

  /**
   * Resolve WebUI contributions from loaded extensions.
   */
  private resolveWebuiContributions(
    extensions: LoadedExtension[]
  ): { config: ExtWebuiConfig; directory: string }[] {
    const result: { config: ExtWebuiConfig; directory: string }[] = [];
    for (const ext of extensions) {
      const webui = ext.manifest.contributes.webui;
      if (webui) {
        result.push({ config: webui, directory: ext.directory });
      }
    }
    return result;
  }

  /**
   * Reset the singleton instance (for testing or hot-reload scenarios).
   */
  static resetInstance(): void {
    ExtensionRegistry.instance = undefined as unknown as ExtensionRegistry;
  }
}
