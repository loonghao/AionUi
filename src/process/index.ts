/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { app } from 'electron';

// Force node-gyp-build to skip build/ directory and use prebuilds/ only in production
// This prevents loading wrong architecture binaries from development environment
// Only apply in packaged app to allow development builds to use build/Release/
if (app.isPackaged) {
  process.env.PREBUILDS_ONLY = '1';
}

export const initializeProcess = async () => {
  // Lazy-import heavy modules to keep main process build graph small.
  // These are loaded at runtime only when initializeProcess is called.
  const { default: initStorage } = await import('./initStorage');
  await initStorage();

  // Initialize IPC bridges (pulls in all 24 bridge modules)
  await import('./initBridge');

  // Initialize i18n for main process
  await import('./i18n');

  // Initialize Channel subsystem
  try {
    const { getChannelManager } = await import('@/channels');
    await getChannelManager().initialize();
  } catch (error) {
    console.error('[Process] Failed to initialize ChannelManager:', error);
    // Don't fail app startup if channel fails to initialize
  }
};
