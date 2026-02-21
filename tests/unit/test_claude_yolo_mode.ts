/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { AcpConnection } from '../../src/agent/acp/AcpConnection';
import { AcpAgent } from '../../src/agent/acp';
import type { AcpResponse } from '../../src/types/acpTypes';
import { CLAUDE_YOLO_SESSION_MODE } from '../../src/agent/acp/constants';

describe('Claude YOLO mode', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets ACP session mode to bypassPermissions when enabled', async () => {
    vi.spyOn(AcpConnection.prototype, 'connect').mockResolvedValue(undefined);
    vi.spyOn(AcpConnection.prototype, 'getInitializeResponse').mockReturnValue(null);
    vi.spyOn(AcpConnection.prototype, 'hasActiveSession', 'get').mockReturnValue(true);
    const setSessionModeSpy = vi.spyOn(AcpConnection.prototype, 'setSessionMode').mockResolvedValue({ jsonrpc: '2.0', id: 1 } as AcpResponse);

    const workspace = process.cwd();
    const agent = new AcpAgent({
      id: 'conv-1',
      backend: 'claude',
      workingDir: workspace,
      onStreamEvent: () => {},
      extra: {
        backend: 'claude',
        workspace,
        yoloMode: true,
      },
    });

    await agent.start();

    expect(setSessionModeSpy).toHaveBeenCalledWith(CLAUDE_YOLO_SESSION_MODE);
  });

  it('fails to start when YOLO mode is enabled but bypassPermissions cannot be set', async () => {
    vi.spyOn(AcpConnection.prototype, 'connect').mockResolvedValue(undefined);
    vi.spyOn(AcpConnection.prototype, 'getInitializeResponse').mockReturnValue(null);
    vi.spyOn(AcpConnection.prototype, 'hasActiveSession', 'get').mockReturnValue(true);
    vi.spyOn(AcpConnection.prototype, 'setSessionMode').mockRejectedValue(new Error('session/set_mode failed'));

    const workspace = process.cwd();
    const agent = new AcpAgent({
      id: 'conv-1',
      backend: 'claude',
      workingDir: workspace,
      onStreamEvent: () => {},
      extra: {
        backend: 'claude',
        workspace,
        yoloMode: true,
      },
    });

    await expect(agent.start()).rejects.toThrow('[ACP] Failed to enable Claude YOLO mode (bypassPermissions):');
  });
});
