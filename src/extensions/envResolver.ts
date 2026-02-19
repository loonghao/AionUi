/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Environment Variable Template Resolver
 * 解析 ${env:VAR_NAME} 模板，替换为对应环境变量值
 *
 * @see RFC-001 §6.3
 *
 * ## Strict Mode (P0 Security Fix)
 * When strict mode is enabled (via AIONUI_STRICT_ENV=1), undefined environment
 * variables will throw an error instead of silently replacing with empty string.
 * This prevents misconfiguration that could lead to security issues.
 *
 * To enable strict mode:
 *   - Set environment variable: AIONUI_STRICT_ENV=1
 *   - Or pass strictMode: true to resolveEnvTemplates
 */

import { AIONUI_STRICT_ENV_ENV } from './constants';

const ENV_TEMPLATE_REGEX = /\$\{env:([^}]+)\}/g;

/** Cached strict mode setting from environment */
let _globalStrictMode: boolean | undefined;

/**
 * Check if strict mode is enabled globally via AIONUI_STRICT_ENV environment variable.
 * Strict mode causes undefined environment variables to throw errors.
 */
export function isGlobalStrictMode(): boolean {
  if (_globalStrictMode === undefined) {
    _globalStrictMode = process.env[AIONUI_STRICT_ENV_ENV] === '1' || process.env[AIONUI_STRICT_ENV_ENV] === 'true';
  }
  return _globalStrictMode;
}

/**
 * Clear cached strict mode setting (for testing).
 */
export function clearStrictModeCache(): void {
  _globalStrictMode = undefined;
}

/**
 * Error thrown when an environment variable is not defined in strict mode.
 */
export class UndefinedEnvVariableError extends Error {
  constructor(
    public readonly varName: string,
    message: string
  ) {
    super(message);
    this.name = 'UndefinedEnvVariableError';
  }
}

export interface EnvResolveOptions {
  /**
   * If true, throw an error when an environment variable is undefined.
   * Defaults to the value of AIONUI_STRICT_ENV environment variable.
   */
  strictMode?: boolean;
}

/**
 * Resolve ${env:VAR_NAME} templates in a single string.
 *
 * @param value - String containing ${env:VAR_NAME} templates
 * @param options - Resolution options
 * @returns String with templates replaced by environment variable values
 * @throws UndefinedEnvVariableError if strict mode is enabled and a variable is undefined
 */
export function resolveEnvTemplates(value: string, options?: EnvResolveOptions): string {
  const strictMode = options?.strictMode ?? isGlobalStrictMode();
  const undefinedVars: string[] = [];

  const result = value.replace(ENV_TEMPLATE_REGEX, (_match, varName: string) => {
    const envValue = process.env[varName];
    if (envValue === undefined) {
      undefinedVars.push(varName);
      if (strictMode) {
        throw new UndefinedEnvVariableError(
          varName,
          `[Extensions] Strict mode: Required environment variable "${varName}" is not defined. ` +
            `Set the variable or disable strict mode (AIONUI_STRICT_ENV=0).`
        );
      }
      console.warn(`[Extensions] Environment variable not defined: ${varName}`);
      return '';
    }
    return envValue;
  });

  // In non-strict mode, log a summary of undefined variables if there were any
  if (!strictMode && undefinedVars.length > 0) {
    console.warn(
      `[Extensions] ${undefinedVars.length} undefined environment variable(s): ${undefinedVars.join(', ')}. ` +
        `Enable strict mode (AIONUI_STRICT_ENV=1) to catch these errors early.`
    );
  }

  return result;
}

/**
 * Recursively resolve ${env:VAR_NAME} templates in all string values of an object.
 * Non-string values (number, boolean, null) are passed through unchanged.
 *
 * @param obj - Object to process
 * @param options - Resolution options (passed to resolveEnvTemplates)
 * @returns Object with all string values having templates resolved
 */
export function resolveEnvInObject<T>(obj: T, options?: EnvResolveOptions): T {
  if (typeof obj === 'string') {
    return resolveEnvTemplates(obj, options) as T;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => resolveEnvInObject(item, options)) as T;
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [k, resolveEnvInObject(v, options)])
    ) as T;
  }
  return obj;
}
