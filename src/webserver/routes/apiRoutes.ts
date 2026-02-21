/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { TokenMiddleware } from '@/webserver/auth/middleware/TokenMiddleware';
import { ExtensionRegistry } from '@/extensions/ExtensionRegistry';
import directoryApi from '../directoryApi';
import { apiRateLimiter } from '../middleware/security';

/**
 * 注册 API 路由
 * Register API routes
 */
export function registerApiRoutes(app: Express): void {
  const validateApiAccess = TokenMiddleware.validateToken({ responseType: 'json' });

  /**
   * 目录 API - Directory API
   * /api/directory/*
   */
  app.use('/api/directory', apiRateLimiter, validateApiAccess, directoryApi);

  /**
   * 扩展资源服务端点 - Extension asset serving endpoint
   * GET /api/ext-asset?path={absolutePath}
   * Serves icon/image files from loaded extension directories.
   * Security: only allows paths within registered extension directories.
   *
   * 为 WebUI 浏览器环境提供扩展资源（图标等），替代 aion-asset:// 协议
   */
  app.get('/api/ext-asset', apiRateLimiter, (req: Request, res: Response) => {
    const absPath = req.query['path'] as string;
    if (!absPath) {
      res.status(400).json({ error: 'Missing path parameter' });
      return;
    }

    // Security: only allow paths within registered extension directories
    const extensions = ExtensionRegistry.getInstance().getLoadedExtensions();
    const normalizedPath = path.normalize(absPath);
    const isAllowed = extensions.some((ext) =>
      normalizedPath.startsWith(path.normalize(ext.directory) + path.sep)
    );

    if (!isAllowed) {
      res.status(403).json({ error: 'Path not allowed' });
      return;
    }

    if (!fs.existsSync(normalizedPath)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    res.sendFile(normalizedPath, (err) => {
      if (err && !res.headersSent) {
        res.status(500).json({ error: 'Failed to serve file' });
      }
    });
  });

  /**
   * 通用 API 端点 - Generic API endpoint
   * GET /api
   * NOTE: Must use app.get (exact match) instead of app.use (prefix match),
   * otherwise this catch-all intercepts /api/ext/* extension routes.
   */
  app.get('/api', apiRateLimiter, validateApiAccess, (_req: Request, res: Response) => {
    res.json({ message: 'API endpoint - bridge integration working' });
  });
}

export default registerApiRoutes;
