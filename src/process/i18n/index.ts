/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import i18n from 'i18next';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigStorage } from '@/common/storage';

// Load language JSON files at runtime instead of static import.
// This avoids bundling ~350KB of JSON into the main process build.
function loadLocaleResources(): Record<string, { translation: Record<string, unknown> }> {
  const localesDir = path.resolve(__dirname, '../renderer/main_window/src/renderer/i18n/locales');
  // In development, files are in the source tree
  const devLocalesDir = path.resolve(__dirname, '../../src/renderer/i18n/locales');

  const dir = fs.existsSync(localesDir) ? localesDir : devLocalesDir;
  const locales = ['zh-CN', 'en-US', 'ja-JP', 'zh-TW', 'ko-KR'];
  const resources: Record<string, { translation: Record<string, unknown> }> = {};

  for (const locale of locales) {
    try {
      const filePath = path.join(dir, `${locale}.json`);
      if (fs.existsSync(filePath)) {
        resources[locale] = { translation: JSON.parse(fs.readFileSync(filePath, 'utf-8')) };
      }
    } catch {
      // Skip locale if file cannot be read
    }
  }

  return resources;
}

const resources = loadLocaleResources();

// Initialize i18next for main process
i18n
  .init({
    resources,
    fallbackLng: 'en-US',
    debug: false,
    interpolation: {
      escapeValue: false,
    },
  })
  .catch((error) => {
    console.error('[Main Process] Failed to initialize i18n:', error);
  });

// Load language setting from storage and apply
ConfigStorage.get('language')
  .then((language) => {
    if (language) {
      i18n.changeLanguage(language).catch((error) => {
        console.error('[Main Process] Failed to change language:', error);
      });
    }
  })
  .catch((error) => {
    console.error('[Main Process] Failed to load language setting:', error);
  });

/**
 * 切换语言
 * Change language
 *
 * 可以在其他地方调用此函数来切换主进程的语言
 * Can be called from elsewhere to change the main process language
 */
export async function changeLanguage(language: string): Promise<void> {
  await i18n.changeLanguage(language);
}

export default i18n;
