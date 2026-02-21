/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Extension System Module Exports
 *
 * @see RFC-001 §6.1
 */

// Core registry and loader
export { ExtensionRegistry, type ExtensionState } from './ExtensionRegistry';
export { ExtensionLoader, type ExtensionLoaderOptions } from './ExtensionLoader';

// Utility functions
export {
  resolveEnvTemplates,
  resolveEnvInObject,
  isGlobalStrictMode,
  clearStrictModeCache,
  UndefinedEnvVariableError,
  type EnvResolveOptions,
} from './envResolver';
export { resolveFileRefs } from './fileResolver';

// Dependency resolver (P2)
export {
  validateDependencies,
  sortByDependencyOrder,
  type DependencyIssue,
  type DependencyValidationResult,
} from './dependencyResolver';

// Hot reload watcher (P2)
export { ExtensionWatcher, type ExtensionWatcherOptions } from './hotReload';

// Resolvers
export { resolveThemes } from './resolvers/ThemeResolver';
export type { ResolvedChannelPlugin } from './resolvers/ChannelPluginResolver';
export type { WsNamespaceHandler } from '@/webserver/websocket/WebSocketManager';

// Type exports
export {
  PRESET_AGENT_TYPES,
  RESERVED_NAME_PREFIXES,
} from './types';
export type {
  ExtensionManifest,
  LoadedExtension,
  ExtensionSource,
  ExtAcpAdapter,
  ExtMcpServer,
  ExtAssistant,
  ExtSkill,
  ExtChannelPlugin,
  ExtWebuiConfig,
  ExtTheme,
  ExtContributes,
  PresetAgentType,
} from './types';
