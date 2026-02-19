/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ACP Adapter Resolver
 * 将扩展的 ExtAcpAdapter 转换为内部 AcpBackendConfig
 *
 * @see RFC-002 Task 5
 */

import path from 'path';
import type { AcpBackendConfig } from '@/types/acpTypes';
import { toAssetUrl } from '../assetProtocol';
import type { ExtAcpAdapter, LoadedExtension } from '../types';

/**
 * Resolve extension ACP adapters into AcpBackendConfig objects.
 */
export function resolveAcpAdapters(extensions: LoadedExtension[]): AcpBackendConfig[] {
  const adapters: AcpBackendConfig[] = [];

  for (const ext of extensions) {
    const declaredAdapters = ext.manifest.contributes.acpAdapters;
    if (!declaredAdapters || declaredAdapters.length === 0) continue;

    for (const adapter of declaredAdapters) {
      adapters.push(convertAcpAdapter(adapter, ext));
    }
  }

  return adapters;
}

function convertAcpAdapter(adapter: ExtAcpAdapter, ext: LoadedExtension): AcpBackendConfig {
  const connectionType = adapter.connectionType ?? 'cli';
  return {
    id: adapter.id,
    name: adapter.name,
    nameI18n: adapter.nameI18n,
    description: adapter.description,
    descriptionI18n: adapter.descriptionI18n,
    cliCommand: adapter.cliCommand,
    // defaultCliPath: explicit config > cliCommand fallback (for CLI agents)
    defaultCliPath: adapter.defaultCliPath || adapter.cliCommand,
    acpArgs: adapter.acpArgs,
    env: adapter.env,
    avatar: adapter.icon ? resolveIconPath(adapter.icon, ext.directory) : undefined,
    authRequired: adapter.authRequired,
    supportsStreaming: adapter.supportsStreaming ?? false,
    connectionType,
    endpoint: adapter.endpoint,
    models: adapter.models,
    isPreset: false,
    isBuiltin: false,
    enabled: true,
    _source: 'extension',
    _extensionName: ext.manifest.name,
  };
}

function resolveIconPath(icon: string, extensionDir: string): string {
  // URLs (http/https) are passed through as-is
  if (icon.startsWith('http://') || icon.startsWith('https://')) return icon;
  // Emoji or short non-path strings — pass through (e.g. "👋", "🔍")
  if (!icon.includes('/') && !icon.includes('\\') && !icon.includes('.')) return icon;
  // Local path: convert to aion-asset:// URL so the renderer can load the image
  // (file:// URLs are blocked when the renderer loads from http://localhost in dev mode)
  const absPath = path.isAbsolute(icon) ? icon : path.resolve(extensionDir, icon);
  return toAssetUrl(absPath);
}
