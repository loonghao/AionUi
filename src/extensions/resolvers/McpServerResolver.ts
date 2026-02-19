/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * MCP Server Resolver
 * 将扩展的 ExtMcpServer 转换为内部 IMcpServer
 *
 * @see RFC-002 Task 6
 */

import type { IMcpServer, IMcpServerTransport } from '@/common/storage';
import type { ExtMcpServer, LoadedExtension } from '../types';

/**
 * Resolve extension MCP servers into IMcpServer objects.
 */
export function resolveMcpServers(extensions: LoadedExtension[]): IMcpServer[] {
  const servers: IMcpServer[] = [];
  const now = Date.now();

  for (const ext of extensions) {
    const declaredServers = ext.manifest.contributes.mcpServers;
    if (!declaredServers || declaredServers.length === 0) continue;

    for (const server of declaredServers) {
      servers.push(convertMcpServer(server, ext, now));
    }
  }

  return servers;
}

function convertMcpServer(server: ExtMcpServer, ext: LoadedExtension, timestamp: number): IMcpServer {
  return {
    id: `ext-${ext.manifest.name}-${server.name}`,
    name: server.name,
    description: server.description,
    enabled: server.enabled,
    transport: server.transport as IMcpServerTransport,
    createdAt: timestamp,
    updatedAt: timestamp,
    originalJson: JSON.stringify(server, null, 2),
    _source: 'extension',
    _extensionName: ext.manifest.name,
  };
}
