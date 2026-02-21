/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * WebuiResolver
 * Resolves WebUI extension contributions: API routes, WS handlers, middleware, and static assets.
 * Enforces security isolation (prefix constraints, path traversal checks).
 *
 * @see RFC-004 §4
 *
 * ## ⚠️ Security Warning (P0 Fix)
 *
 * This module dynamically loads and executes JavaScript code from external extensions.
 * Extension code runs in the same Node.js process as the main application with FULL access to:
 * - File system (read/write any file the app can access)
 * - Network (make any HTTP request, open any port)
 * - Child processes (execute any command)
 * - Environment variables and process memory
 * - Express middleware can intercept ALL HTTP requests
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
import express from 'express';
import type { Express, Router, RequestHandler } from 'express';
import { AuthMiddleware } from '@/webserver/auth';
import type { ExtWebuiConfig } from '../types';
import type { WebSocketManager, WsNamespaceHandler } from '@/webserver/websocket/WebSocketManager';

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

// ============================================================
// API Routes
// ============================================================

/**
 * Load and register extension API routes onto the Express app.
 * Each entryPoint must export an Express Router.
 * All routes are forced under `/api/ext/` prefix.
 */
export function resolveApiRoutes(
  config: ExtWebuiConfig,
  extensionDir: string,
  app: Express
): void {
  const routes = config.apiRoutes;
  if (!routes || routes.length === 0) return;

  for (const route of routes) {
    const routerPath = path.resolve(extensionDir, route.entryPoint);

    if (!routerPath.startsWith(extensionDir)) {
      console.warn(`[Extension WebUI] Path traversal detected: ${route.entryPoint}`);
      continue;
    }

    if (!fs.existsSync(routerPath)) {
      console.warn(`[Extension WebUI] API route entry not found: ${routerPath}`);
      continue;
    }

    // Security warning before loading external code
    logSecurity(
      `Loading API route "${route.path}" from: ${routerPath}\n` +
        `  ⚠️  This code will run with FULL process privileges.\n` +
        `  ⚠️  Only load extensions from trusted sources.`
    );

    try {
      // Use eval('require') to bypass bundler's module resolution and load external JS files at runtime
      // eslint-disable-next-line @typescript-eslint/no-var-requires, no-eval
      const nativeRequire = eval('require') as NodeRequire;
      const mod = nativeRequire(routerPath);
      const router: Router = mod.default || mod.router || mod;

      if (typeof router !== 'function') {
        console.warn(`[Extension WebUI] ${route.path}: must export an Express Router`);
        continue;
      }

      const safePath = ensureApiExtPrefix(route.path);

      if (route.auth !== false) {
        app.use(safePath, AuthMiddleware.authenticateToken as RequestHandler, router);
      } else {
        app.use(safePath, router);
      }

      console.log(`[Extension WebUI] API route registered: ${safePath}`);
      logSecurity(`API route "${route.path}" registered at ${safePath}`);
    } catch (error) {
      console.error(`[Extension WebUI] Failed to load API route "${route.path}":`, error);
    }
  }
}

// ============================================================
// WebSocket Handlers
// ============================================================

/**
 * Load and register extension WebSocket namespace handlers.
 * Namespaces are forced under `ext:` prefix.
 */
export function resolveWsHandlers(
  config: ExtWebuiConfig,
  extensionDir: string,
  wsManager: WebSocketManager
): void {
  const handlers = config.wsHandlers;
  if (!handlers || handlers.length === 0) return;

  for (const handler of handlers) {
    const handlerPath = path.resolve(extensionDir, handler.entryPoint);

    if (!handlerPath.startsWith(extensionDir)) {
      console.warn(`[Extension WS] Path traversal detected: ${handler.entryPoint}`);
      continue;
    }

    if (!fs.existsSync(handlerPath)) {
      console.warn(`[Extension WS] Handler entry not found: ${handlerPath}`);
      continue;
    }

    // Security warning before loading external code
    logSecurity(
      `Loading WS handler "${handler.namespace}" from: ${handlerPath}\n` +
        `  ⚠️  This code will run with FULL process privileges.\n` +
        `  ⚠️  Only load extensions from trusted sources.`
    );

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, no-eval
      const nativeRequire = eval('require') as NodeRequire;
      const mod = nativeRequire(handlerPath);
      const nsHandler: WsNamespaceHandler = {
        onMessage: mod.onMessage || mod.default?.onMessage,
        onConnect: mod.onConnect || mod.default?.onConnect,
        onDisconnect: mod.onDisconnect || mod.default?.onDisconnect,
      };

      const safeNamespace = ensureExtWsPrefix(handler.namespace);
      wsManager.registerNamespace(safeNamespace, nsHandler);
      logSecurity(`WS handler "${handler.namespace}" registered as ${safeNamespace}`);
    } catch (error) {
      console.error(`[Extension WS] Failed to load handler "${handler.namespace}":`, error);
    }
  }
}

// ============================================================
// Middleware
// ============================================================

interface ResolvedMiddleware {
  middleware: RequestHandler;
  applyTo: string;
}

interface ResolvedMiddlewareResult {
  before: ResolvedMiddleware[];
  after: ResolvedMiddleware[];
}

/**
 * Load extension middleware, categorized into before/after groups.
 * Middleware scope is restricted to `/api/**` and `/ext/**`.
 */
export function resolveMiddleware(
  config: ExtWebuiConfig,
  extensionDir: string
): ResolvedMiddlewareResult {
  const result: ResolvedMiddlewareResult = { before: [], after: [] };
  const middlewareList = config.middleware;
  if (!middlewareList || middlewareList.length === 0) return result;

  for (const mw of middlewareList) {
    const mwPath = path.resolve(extensionDir, mw.entryPoint);

    if (!mwPath.startsWith(extensionDir)) {
      console.warn(`[Extension MW] Path traversal detected: ${mw.entryPoint}`);
      continue;
    }

    if (!fs.existsSync(mwPath)) {
      console.warn(`[Extension MW] Middleware entry not found: ${mwPath}`);
      continue;
    }

    // Security warning before loading external code
    logSecurity(
      `Loading middleware "${mw.description || mw.entryPoint}" from: ${mwPath}\n` +
        `  ⚠️  This code will run with FULL process privileges.\n` +
        `  ⚠️  Middleware can intercept ALL HTTP requests in its scope.`
    );

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, no-eval
      const nativeRequire = eval('require') as NodeRequire;
      const mod = nativeRequire(mwPath);
      const middleware = mod.default || mod.middleware || mod;

      if (typeof middleware !== 'function') {
        console.warn(`[Extension MW] ${mw.entryPoint}: must export a middleware function`);
        continue;
      }

      const safeApplyTo = validateMiddlewareScope(mw.applyTo || '/**');
      const order = mw.order || 'before';

      result[order].push({ middleware: middleware as RequestHandler, applyTo: safeApplyTo });
      console.log(`[Extension MW] Registered (${order}): ${mw.description || mw.entryPoint}`);
      logSecurity(`Middleware "${mw.description || mw.entryPoint}" registered (${order}) for ${safeApplyTo}`);
    } catch (error) {
      console.error(`[Extension MW] Failed to load "${mw.entryPoint}":`, error);
    }
  }

  return result;
}

// ============================================================
// Static Assets
// ============================================================

/**
 * Register extension static asset directories.
 * URL prefixes are forced under `/ext/`.
 */
export function resolveStaticAssets(
  config: ExtWebuiConfig,
  extensionDir: string,
  app: Express
): void {
  const assets = config.staticAssets;
  if (!assets || assets.length === 0) return;

  for (const asset of assets) {
    const dir = path.resolve(extensionDir, asset.directory);

    if (!dir.startsWith(extensionDir)) {
      console.warn(`[Extension Static] Path traversal detected: ${asset.directory}`);
      continue;
    }

    if (!fs.existsSync(dir)) {
      console.warn(`[Extension Static] Directory not found: ${dir}`);
      continue;
    }

    const safePrefix = ensureExtStaticPrefix(asset.urlPrefix);
    app.use(safePrefix, express.static(dir));
    console.log(`[Extension Static] ${safePrefix} -> ${dir}`);
  }
}

// ============================================================
// Helper functions
// ============================================================

/** Ensure API route path starts with /api/ext/ */
function ensureApiExtPrefix(routePath: string): string {
  if (routePath.startsWith('/api/ext/') || routePath.startsWith('/api/ext')) return routePath;
  const clean = routePath.startsWith('/') ? routePath.slice(1) : routePath;
  return `/api/ext/${clean}`;
}

/** Ensure WS namespace starts with ext: */
function ensureExtWsPrefix(namespace: string): string {
  return namespace.startsWith('ext:') ? namespace : `ext:${namespace}`;
}

/** Ensure static URL prefix starts with /ext/ */
function ensureExtStaticPrefix(urlPrefix: string): string {
  if (urlPrefix.startsWith('/ext/')) return urlPrefix;
  return `/ext${urlPrefix.startsWith('/') ? '' : '/'}${urlPrefix}`;
}

/** Validate middleware scope — only /api/** and /ext/** are allowed */
function validateMiddlewareScope(applyTo: string): string {
  const allowed = ['/api/', '/ext/'];
  if (allowed.some((prefix) => applyTo.startsWith(prefix))) {
    return applyTo;
  }
  console.warn(`[Extension MW] Scope "${applyTo}" restricted to /api/ext/**`);
  return '/api/ext/**';
}
