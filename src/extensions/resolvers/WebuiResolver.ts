/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from "path";
import { existsSync } from "fs";
import type { LoadedExtension, ExtWebui } from "../types";

export type WebuiContribution = {
  config: ExtWebui;
  directory: string;
  extensionName: string;
};

export function resolveWebuiContributions(extensions: LoadedExtension[]): WebuiContribution[] {
  const result: WebuiContribution[] = [];
  for (const ext of extensions) {
    const webui = ext.manifest.contributes.webui;
    if (!webui) continue;

    const validated = validateWebuiContribution(webui, ext);
    if (validated) {
      result.push({
        config: validated,
        directory: ext.directory,
        extensionName: ext.manifest.name,
      });
    }
  }
  return result;
}

function validateWebuiContribution(webui: ExtWebui, ext: LoadedExtension): ExtWebui | null {
  const extDir = ext.directory;
  const extName = ext.manifest.name;
  let hasWarning = false;

  // Validate API route entryPoints exist
  if (webui.apiRoutes) {
    for (const route of webui.apiRoutes) {
      const absPath = path.resolve(extDir, route.entryPoint);
      if (!absPath.startsWith(extDir)) {
        console.warn(
          `[Extensions] WebUI API route path traversal attempt: ${route.entryPoint} in ${extName}`,
        );
        hasWarning = true;
      } else if (!existsSync(absPath)) {
        console.warn(
          `[Extensions] WebUI API route entryPoint not found: ${absPath} (extension: ${extName})`,
        );
        hasWarning = true;
      }
    }
  }

  // Validate WebSocket handler entryPoints exist
  if (webui.wsHandlers) {
    for (const handler of webui.wsHandlers) {
      const absPath = path.resolve(extDir, handler.entryPoint);
      if (!absPath.startsWith(extDir)) {
        console.warn(
          `[Extensions] WebUI WS handler path traversal attempt: ${handler.entryPoint} in ${extName}`,
        );
        hasWarning = true;
      } else if (!existsSync(absPath)) {
        console.warn(
          `[Extensions] WebUI WS handler entryPoint not found: ${absPath} (extension: ${extName})`,
        );
        hasWarning = true;
      }
    }
  }

  // Validate middleware entryPoints exist
  if (webui.middleware) {
    for (const mw of webui.middleware) {
      const absPath = path.resolve(extDir, mw.entryPoint);
      if (!absPath.startsWith(extDir)) {
        console.warn(
          `[Extensions] WebUI middleware path traversal attempt: ${mw.entryPoint} in ${extName}`,
        );
        hasWarning = true;
      } else if (!existsSync(absPath)) {
        console.warn(
          `[Extensions] WebUI middleware entryPoint not found: ${absPath} (extension: ${extName})`,
        );
        hasWarning = true;
      }
    }
  }

  // Validate static asset directories exist
  if (webui.staticAssets) {
    for (const asset of webui.staticAssets) {
      const absPath = path.resolve(extDir, asset.directory);
      if (!absPath.startsWith(extDir)) {
        console.warn(
          `[Extensions] WebUI static asset path traversal attempt: ${asset.directory} in ${extName}`,
        );
        hasWarning = true;
      } else if (!existsSync(absPath)) {
        console.warn(
          `[Extensions] WebUI static asset directory not found: ${absPath} (extension: ${extName})`,
        );
        hasWarning = true;
      }
    }
  }

  if (hasWarning) {
    console.warn(
      `[Extensions] WebUI contribution from "${extName}" has validation warnings (loaded with warnings)`,
    );
  }

  return webui;
}
