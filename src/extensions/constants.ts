/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Extension System Constants
 * 扩展系统的环境变量名、目录路径等常量
 *
 * @see RFC-001 §5.1
 */

import path from 'path';
import os from 'os';
import { app } from 'electron';

/** Environment variable for additional extension search paths */
export const AIONUI_EXTENSIONS_PATH_ENV = 'AIONUI_EXTENSIONS_PATH';

/** Environment variable for strict mode (fail on undefined env vars) */
export const AIONUI_STRICT_ENV_ENV = 'AIONUI_STRICT_ENV';

/** Extension manifest filename */
export const EXTENSION_MANIFEST_FILE = 'aion-extension.json';

/** Extensions directory name */
export const EXTENSIONS_DIR_NAME = 'extensions';

/** Path separator for AIONUI_EXTENSIONS_PATH (Windows: ;, Unix: :) */
export const PATH_SEPARATOR = process.platform === 'win32' ? ';' : ':';

/**
 * Get user-level extensions directory: ~/.aionui/extensions/
 */
export function getUserExtensionsDir(): string {
  return path.join(os.homedir(), '.aionui', EXTENSIONS_DIR_NAME);
}

/**
 * Get app-data-level extensions directory: <appData>/AionUI/extensions/
 * Uses Electron's app.getPath('userData') when available.
 */
export function getAppDataExtensionsDir(): string {
  try {
    return path.join(app.getPath('userData'), EXTENSIONS_DIR_NAME);
  } catch {
    // Fallback for non-Electron environments (e.g., tests)
    const appData = process.env.APPDATA || path.join(os.homedir(), '.config');
    return path.join(appData, 'AionUI', EXTENSIONS_DIR_NAME);
  }
}

/**
 * Get all extension search directories from AIONUI_EXTENSIONS_PATH env var.
 * Returns empty array if the env var is not set.
 */
export function getEnvExtensionsDirs(): string[] {
  const envPath = process.env[AIONUI_EXTENSIONS_PATH_ENV];
  if (!envPath) return [];
  return envPath.split(PATH_SEPARATOR).filter(Boolean);
}
