/**
 * Extension System - Zod Schema Validation Tests
 * Tests all Zod schemas in src/extensions/types.ts
 */

import {
  ExtensionManifestSchema,
  ExtensionMetaSchema,
  ExtAcpAdapterSchema,
  ExtMcpServerSchema,
  ExtMcpTransportSchema,
  ExtAssistantSchema,
  ExtSkillSchema,
  ExtChannelPluginSchema,
  ExtWebuiSchema,
  ExtThemeSchema,
  ExtContributesSchema,
  ExtApiRouteSchema,
  ExtMiddlewareSchema,
  ExtFieldSchema,
} from '@/extensions/types';

// ============================================================
// ExtensionMetaSchema
// ============================================================

describe('ExtensionMetaSchema', () => {
  it('should validate a minimal manifest', () => {
    const result = ExtensionMetaSchema.safeParse({
      name: 'hello-world',
      displayName: 'Hello World',
      version: '1.0.0',
    });
    expect(result.success).toBe(true);
  });

  it('should reject non-kebab-case name', () => {
    const result = ExtensionMetaSchema.safeParse({
      name: 'Hello_World',
      displayName: 'Hello',
      version: '1.0.0',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('name');
    }
  });

  it('should reject uppercase in name', () => {
    const result = ExtensionMetaSchema.safeParse({
      name: 'HelloWorld',
      displayName: 'Hello',
      version: '1.0.0',
    });
    expect(result.success).toBe(false);
  });

  it('should accept valid kebab-case names', () => {
    for (const name of ['ab', 'hello', 'my-ext', 'my-ext-123', '123']) {
      const result = ExtensionMetaSchema.safeParse({
        name,
        displayName: 'Test',
        version: '0.1.0',
      });
      expect(result.success).toBe(true);
    }
  });

  it('should accept optional fields', () => {
    const result = ExtensionMetaSchema.safeParse({
      name: 'full-meta',
      displayName: 'Full Meta',
      displayNameI18n: { 'zh-CN': '完整元数据' },
      version: '2.0.0',
      description: 'A test extension',
      descriptionI18n: { 'zh-CN': '测试扩展' },
      author: 'Test Author',
      icon: 'assets/icon.svg',
      homepage: 'https://example.com',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid homepage URL', () => {
    const result = ExtensionMetaSchema.safeParse({
      name: 'test',
      displayName: 'Test',
      version: '1.0.0',
      homepage: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// ExtAcpAdapterSchema
// ============================================================

describe('ExtAcpAdapterSchema', () => {
  it('should validate a minimal CLI adapter', () => {
    const result = ExtAcpAdapterSchema.safeParse({
      id: 'my-agent',
      name: 'My Agent',
      cliCommand: 'myagent',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.connectionType).toBe('cli');
    }
  });

  it('should validate a WebSocket adapter', () => {
    const result = ExtAcpAdapterSchema.safeParse({
      id: 'ws-agent',
      name: 'WS Agent',
      connectionType: 'websocket',
      endpoint: 'ws://localhost:8080',
    });
    expect(result.success).toBe(true);
  });

  it('should validate a full adapter with all fields', () => {
    const result = ExtAcpAdapterSchema.safeParse({
      id: 'full-agent',
      name: 'Full Agent',
      nameI18n: { 'zh-CN': '完整代理' },
      description: 'A full test agent',
      cliCommand: 'agent',
      defaultCliPath: '/usr/bin/agent',
      acpArgs: ['--acp', '--verbose'],
      env: { AGENT_KEY: 'test' },
      icon: 'icon.svg',
      authRequired: true,
      supportsStreaming: true,
      connectionType: 'cli',
      models: ['gpt-4', 'gpt-3.5'],
      yoloMode: { type: 'session', sessionMode: 'auto' },
      healthCheck: { versionCommand: 'agent --version', timeout: 5000 },
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid connectionType', () => {
    const result = ExtAcpAdapterSchema.safeParse({
      id: 'bad',
      name: 'Bad',
      connectionType: 'grpc',
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// ExtMcpTransportSchema
// ============================================================

describe('ExtMcpTransportSchema', () => {
  it('should validate stdio transport', () => {
    const result = ExtMcpTransportSchema.safeParse({
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem'],
      env: { HOME: '/tmp' },
    });
    expect(result.success).toBe(true);
  });

  it('should validate sse transport', () => {
    const result = ExtMcpTransportSchema.safeParse({
      type: 'sse',
      url: 'http://localhost:3000/sse',
      headers: { Authorization: 'Bearer token' },
    });
    expect(result.success).toBe(true);
  });

  it('should validate http transport', () => {
    const result = ExtMcpTransportSchema.safeParse({
      type: 'http',
      url: 'http://localhost:3000/api',
    });
    expect(result.success).toBe(true);
  });

  it('should validate streamable_http transport', () => {
    const result = ExtMcpTransportSchema.safeParse({
      type: 'streamable_http',
      url: 'http://localhost:3000/mcp',
    });
    expect(result.success).toBe(true);
  });

  it('should reject unknown transport type', () => {
    const result = ExtMcpTransportSchema.safeParse({
      type: 'grpc',
      url: 'localhost:50051',
    });
    expect(result.success).toBe(false);
  });

  it('should reject stdio without command', () => {
    const result = ExtMcpTransportSchema.safeParse({
      type: 'stdio',
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// ExtMcpServerSchema
// ============================================================

describe('ExtMcpServerSchema', () => {
  it('should validate with default enabled=true', () => {
    const result = ExtMcpServerSchema.safeParse({
      name: 'test-server',
      transport: { type: 'stdio', command: 'test' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(true);
    }
  });

  it('should accept enabled=false', () => {
    const result = ExtMcpServerSchema.safeParse({
      name: 'disabled-server',
      transport: { type: 'sse', url: 'http://localhost/sse' },
      enabled: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(false);
    }
  });
});

// ============================================================
// ExtAssistantSchema
// ============================================================

describe('ExtAssistantSchema', () => {
  it('should validate a minimal assistant', () => {
    const result = ExtAssistantSchema.safeParse({
      id: 'greeter',
      name: 'Greeter',
      presetAgentType: 'gemini',
      contextFile: 'assistants/context.md',
    });
    expect(result.success).toBe(true);
  });

  it('should validate a full assistant', () => {
    const result = ExtAssistantSchema.safeParse({
      id: 'full-assistant',
      name: 'Full Assistant',
      nameI18n: { 'zh-CN': '完整助手' },
      description: 'A full assistant',
      avatar: 'assets/avatar.png',
      presetAgentType: 'claude',
      contextFile: 'ctx.md',
      contextFileI18n: { 'zh-CN': 'ctx-zh.md' },
      models: ['claude-4-sonnet'],
      enabledSkills: ['code-review'],
      prompts: ['How are you?'],
      promptsI18n: { 'zh-CN': ['你好'] },
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid presetAgentType', () => {
    const result = ExtAssistantSchema.safeParse({
      id: 'bad',
      name: 'Bad',
      presetAgentType: 'unknown-agent',
      contextFile: 'ctx.md',
    });
    expect(result.success).toBe(false);
  });

  it('should accept all valid presetAgentTypes', () => {
    for (const agentType of ['gemini', 'claude', 'codex', 'codebuddy', 'opencode']) {
      const result = ExtAssistantSchema.safeParse({
        id: `test-${agentType}`,
        name: `Test ${agentType}`,
        presetAgentType: agentType,
        contextFile: 'ctx.md',
      });
      expect(result.success).toBe(true);
    }
  });
});

// ============================================================
// ExtSkillSchema
// ============================================================

describe('ExtSkillSchema', () => {
  it('should validate a skill', () => {
    const result = ExtSkillSchema.safeParse({
      name: 'code-review',
      description: 'Reviews code',
      file: 'skills/code-review/SKILL.md',
    });
    expect(result.success).toBe(true);
  });

  it('should accept skill without description', () => {
    const result = ExtSkillSchema.safeParse({
      name: 'test',
      file: 'skills/test.md',
    });
    expect(result.success).toBe(true);
  });

  it('should reject skill without file', () => {
    const result = ExtSkillSchema.safeParse({
      name: 'no-file',
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// ExtFieldSchema
// ============================================================

describe('ExtFieldSchema', () => {
  it('should validate all field types', () => {
    for (const type of ['text', 'password', 'select', 'number', 'boolean']) {
      const result = ExtFieldSchema.safeParse({
        key: `test_${type}`,
        label: `Test ${type}`,
        type,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should accept select with options', () => {
    const result = ExtFieldSchema.safeParse({
      key: 'mode',
      label: 'Mode',
      type: 'select',
      options: ['fast', 'slow'],
      required: true,
    });
    expect(result.success).toBe(true);
  });

  it('should accept default values of different types', () => {
    expect(
      ExtFieldSchema.safeParse({ key: 'a', label: 'A', type: 'text', default: 'hello' }).success
    ).toBe(true);
    expect(
      ExtFieldSchema.safeParse({ key: 'b', label: 'B', type: 'number', default: 42 }).success
    ).toBe(true);
    expect(
      ExtFieldSchema.safeParse({ key: 'c', label: 'C', type: 'boolean', default: true }).success
    ).toBe(true);
  });
});

// ============================================================
// ExtChannelPluginSchema
// ============================================================

describe('ExtChannelPluginSchema', () => {
  it('should validate a channel plugin', () => {
    const result = ExtChannelPluginSchema.safeParse({
      type: 'slack',
      name: 'Slack Bot',
      entryPoint: 'plugins/slack.js',
      credentialFields: [
        { key: 'token', label: 'Bot Token', type: 'password', required: true },
      ],
      configFields: [{ key: 'channel', label: 'Default Channel', type: 'text' }],
    });
    expect(result.success).toBe(true);
  });

  it('should validate a Telegram channel plugin config', () => {
    const result = ExtChannelPluginSchema.safeParse({
      type: 'telegram',
      name: 'Telegram Bot',
      nameI18n: { 'zh-CN': 'Telegram 机器人' },
      description: 'Telegram Bot integration via Bot API',
      entryPoint: 'plugins/telegram/index.js',
      credentialFields: [
        { key: 'token', label: 'Bot Token', type: 'password', required: true },
      ],
      configFields: [
        { key: 'parseMode', label: 'Parse Mode', type: 'select', options: ['Markdown', 'MarkdownV2', 'HTML'], default: 'MarkdownV2' },
        { key: 'enableWebhook', label: 'Use Webhook', type: 'boolean', default: false },
      ],
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================
// ExtWebuiSchema
// ============================================================

describe('ExtWebuiSchema', () => {
  it('should validate a full webui config', () => {
    const result = ExtWebuiSchema.safeParse({
      apiRoutes: [{ path: '/hello', entryPoint: 'webui/api/hello.js', auth: false }],
      wsHandlers: [{ namespace: 'chat', entryPoint: 'webui/ws/chat.js' }],
      middleware: [
        { entryPoint: 'webui/mw/logger.js', applyTo: '/api/**', order: 'before' },
      ],
      staticAssets: [{ urlPrefix: '/hello-world', directory: 'webui/static' }],
    });
    expect(result.success).toBe(true);
  });

  it('should apply defaults for auth and order', () => {
    const apiRoute = ExtApiRouteSchema.safeParse({
      path: '/test',
      entryPoint: 'test.js',
    });
    expect(apiRoute.success).toBe(true);
    if (apiRoute.success) {
      expect(apiRoute.data.auth).toBe(true);
    }

    const mw = ExtMiddlewareSchema.safeParse({
      entryPoint: 'mw.js',
    });
    expect(mw.success).toBe(true);
    if (mw.success) {
      expect(mw.data.applyTo).toBe('/**');
      expect(mw.data.order).toBe('before');
    }
  });
});

// ============================================================
// ExtThemeSchema
// ============================================================

describe('ExtThemeSchema', () => {
  it('should validate a theme', () => {
    const result = ExtThemeSchema.safeParse({
      id: 'my-light',
      name: 'My Light',
      file: 'themes/light.css',
      cover: 'themes/light-preview.png',
    });
    expect(result.success).toBe(true);
  });

  it('should accept theme without cover', () => {
    const result = ExtThemeSchema.safeParse({
      id: 'minimal',
      name: 'Minimal',
      file: 'themes/minimal.css',
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================
// ExtContributesSchema
// ============================================================

describe('ExtContributesSchema', () => {
  it('should validate empty contributes', () => {
    const result = ExtContributesSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should validate contributes with all types', () => {
    const result = ExtContributesSchema.safeParse({
      acpAdapters: [{ id: 'a', name: 'A', cliCommand: 'test' }],
      mcpServers: [{ name: 's', transport: { type: 'stdio', command: 'cmd' } }],
      assistants: [
        { id: 'b', name: 'B', presetAgentType: 'gemini', contextFile: 'c.md' },
      ],
      skills: [{ name: 'sk', file: 'sk.md' }],
      themes: [{ id: 't', name: 'T', file: 't.css' }],
      channelPlugins: [{ type: 'ch', name: 'Ch', entryPoint: 'ch.js' }],
      webui: { apiRoutes: [{ path: '/x', entryPoint: 'x.js' }] },
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================
// ExtensionManifestSchema (complete)
// ============================================================

describe('ExtensionManifestSchema', () => {
  it('should validate a complete manifest', () => {
    const result = ExtensionManifestSchema.safeParse({
      $schema: 'https://aionui.dev/schemas/aion-extension-v1.json',
      name: 'hello-world',
      displayName: 'Hello World',
      version: '1.0.0',
      contributes: {
        acpAdapters: [{ id: 'test', name: 'Test', cliCommand: 'test' }],
      },
    });
    expect(result.success).toBe(true);
  });

  it('should reject manifest without required fields', () => {
    const result = ExtensionManifestSchema.safeParse({
      name: 'test',
    });
    expect(result.success).toBe(false);
  });

  it('should reject manifest without contributes', () => {
    const result = ExtensionManifestSchema.safeParse({
      name: 'test',
      displayName: 'Test',
      version: '1.0.0',
    });
    expect(result.success).toBe(false);
  });
});
