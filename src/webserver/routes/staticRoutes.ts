/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express, Request, Response } from 'express';
import express from 'express';
import http from 'http';
import type { Writable } from 'stream';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { TokenMiddleware } from '@/webserver/auth/middleware/TokenMiddleware';
import { AUTH_CONFIG } from '../config/constants';
import { createRateLimiter } from '../middleware/security';

/**
 * Resolve renderer build output path.
 * Returns the paths if built assets exist on disk, or null if unavailable
 * (e.g. during development when Vite dev server serves assets in-memory).
 */
const resolveRendererPath = (): { indexHtml: string; staticRoot: string } | null => {
  // In dev mode, skip any stale out/renderer/ build when Vite dev server is running.
  // electron-vite sets ELECTRON_RENDERER_URL to the Vite dev server URL in dev mode.
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    return null;
  }

  const appPath = app.getAppPath();
  const baseRoot = path.join(appPath, 'out', 'renderer');
  const indexHtml = path.join(baseRoot, 'index.html');

  if (fs.existsSync(indexHtml)) {
    return { indexHtml, staticRoot: baseRoot } as const;
  }

  // In development mode, Vite dev server serves renderer assets in-memory —
  // the files do not exist on disk. Return null so the caller can degrade gracefully.
  if (!app.isPackaged) {
    return null;
  }

  throw new Error(`Renderer assets not found at ${indexHtml}`);
};

/**
 * Set up a reverse proxy to the Vite dev server for all SPA routes.
 * This allows the Express-hosted WebUI to serve the live React app with
 * correct UnoCSS classes and HMR assets during development.
 *
 * 在开发模式下将 SPA 路由代理到 Vite 开发服务器
 */
function setupViteDevProxy(expressApp: Express, viteUrl: string): void {
  const target = new URL(viteUrl);
  const hostname = target.hostname;
  const port = parseInt(target.port, 10) || 80;

  // Forward all non-API, non-auth requests to the Vite dev server
  expressApp.use(/^\/(?!api\b|auth\b)/, (req: Request, res: Response) => {
    const options: http.RequestOptions = {
      hostname,
      port,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `${hostname}:${port}` },
    };

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
      proxyRes.pipe(res as unknown as Writable, { end: true });
    });

    proxyReq.on('error', () => {
      if (!res.headersSent) {
        res.status(502).send('<h1>502 Dev Server Unavailable</h1><p>Make sure the Vite dev server is running.</p>');
      }
    });

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      req.pipe(proxyReq, { end: true });
    } else {
      proxyReq.end();
    }
  });
}

export function registerStaticRoutes(expressApp: Express): void {
  const resolved = resolveRendererPath();

  // Always register favicon handler
  expressApp.get('/favicon.ico', (_req: Request, res: Response) => {
    res.status(204).end(); // No Content
  });

  if (!resolved) {
    const viteUrl = !app.isPackaged ? process.env['ELECTRON_RENDERER_URL'] : undefined;
    if (viteUrl) {
      console.log(`[WebUI] Dev mode: proxying SPA requests to Vite dev server at ${viteUrl}`);
      setupViteDevProxy(expressApp, viteUrl);
    } else {
      // Development mode: renderer assets are served by Vite dev server (e.g. http://localhost:5173).
      // The embedded WebUI server only needs to provide API routes and WebSocket —
      // skip static file serving and SPA fallback.
      console.log(
        '[WebUI] Development mode: renderer assets served by Vite dev server, static routes skipped'
      );
    }
    return;
  }

  const { staticRoot, indexHtml } = resolved;
  const indexHtmlPath = indexHtml;

  // Create a lenient rate limiter for static page requests to prevent DDoS
  // 为静态页面请求创建宽松的速率限制器以防止 DDoS 攻击
  const pageRateLimiter = createRateLimiter({
    windowMs: 60 * 1000, // 1 minute / 1分钟
    max: 300, // 300 requests per minute (very lenient) / 每分钟300次请求（非常宽松）
    message: 'Too many requests, please try again later',
  });

  const serveApplication = (req: Request, res: Response) => {
    try {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      const token = TokenMiddleware.extractToken(req);
      if (token && !TokenMiddleware.isTokenValid(token)) {
        res.clearCookie(AUTH_CONFIG.COOKIE.NAME);
      }

      const htmlContent = fs.readFileSync(indexHtmlPath, 'utf8');
      res.setHeader('Content-Type', 'text/html');
      res.send(htmlContent);
    } catch (error) {
      console.error('Error serving index.html:', error);
      res.status(500).send('Internal Server Error');
    }
  };

  /**
   * 主页路由
   * Homepage
   * GET /
   */
  expressApp.get('/', pageRateLimiter, serveApplication);

  /**
   * 处理子路径路由 (React Router)
   * Handle SPA sub-routes (React Router)
   * Exclude: api, static, main_window, and asset directories
   * Also exclude files with extensions (.js, .css, .map, etc.)
   */
  expressApp.get(/^\/(?!api|static|main_window|assets)(?!.*\.[a-zA-Z0-9]+$).*/, pageRateLimiter, serveApplication);

  /**
   * 静态资源
   * Static assets
   */
  // 直接挂载编译输出目录，让 vite 在写出文件后即可被访问
  expressApp.use(express.static(staticRoot));

  const mainWindowDir = path.join(staticRoot, 'main_window');
  if (fs.existsSync(mainWindowDir) && fs.statSync(mainWindowDir).isDirectory()) {
    expressApp.use('/main_window', express.static(mainWindowDir));
  }

  const staticDir = path.join(staticRoot, 'static');
  if (fs.existsSync(staticDir) && fs.statSync(staticDir).isDirectory()) {
    expressApp.use('/static', express.static(staticDir));
  }

}

export default registerStaticRoutes;
