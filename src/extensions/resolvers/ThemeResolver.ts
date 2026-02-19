/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Theme Resolver
 * 将扩展的 ExtTheme 转换为内部 ICssTheme 格式，读取 CSS 文件内容
 *
 * @see RFC-001 §6.4
 */

import path from 'path';
import { existsSync, readFileSync } from 'fs';
import type { ICssTheme } from '@/common/storage';
import type { ExtTheme, LoadedExtension } from '../types';
import { toAssetUrl } from '../assetProtocol';

/**
 * Resolve extension themes into ICssTheme objects.
 * Reads CSS file content and converts to the internal theme format.
 */
export function resolveThemes(extensions: LoadedExtension[]): ICssTheme[] {
  const themes: ICssTheme[] = [];

  for (const ext of extensions) {
    const declaredThemes = ext.manifest.contributes.themes;
    if (!declaredThemes || declaredThemes.length === 0) continue;

    for (const theme of declaredThemes) {
      const resolved = convertTheme(theme, ext);
      if (resolved) {
        themes.push(resolved);
      }
    }
  }

  return themes;
}

function convertTheme(theme: ExtTheme, ext: LoadedExtension): ICssTheme | null {
  const absolutePath = path.resolve(ext.directory, theme.file);

  // Security: ensure path is within extension directory
  if (!absolutePath.startsWith(ext.directory)) {
    console.warn(`[Extensions] Theme file path traversal attempt: ${theme.file} in ${ext.manifest.name}`);
    return null;
  }

  if (!existsSync(absolutePath)) {
    console.warn(`[Extensions] Theme file not found: ${absolutePath} (extension: ${ext.manifest.name})`);
    return null;
  }

  try {
    const css = readFileSync(absolutePath, 'utf-8');
    const now = Date.now();

    // Resolve cover image path if provided
    let cover: string | undefined;
    if (theme.cover) {
      const coverPath = path.resolve(ext.directory, theme.cover);
      if (coverPath.startsWith(ext.directory) && existsSync(coverPath)) {
        // Use aion-asset:// URL for local images
        // (file:// URLs are blocked when the renderer loads from http://localhost in dev mode)
        cover = toAssetUrl(coverPath);
      }
    }

    return {
      // Prefix with extension name to avoid ID conflicts
      id: `ext-${ext.manifest.name}-${theme.id}`,
      name: `${theme.name} (${ext.manifest.displayName || ext.manifest.name})`,
      css,
      cover,
      isPreset: true,
      createdAt: now,
      updatedAt: now,
    };
  } catch (error) {
    console.warn(
      `[Extensions] Failed to read theme file ${absolutePath}:`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}
