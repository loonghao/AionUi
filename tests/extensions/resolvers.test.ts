/**
 * Extension System - Resolver Tests
 * Tests AcpAdapterResolver, McpServerResolver, AssistantResolver, SkillResolver, ThemeResolver
 */

import { vi } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import type { LoadedExtension } from '@/extensions/types';

// ============================================================
// Test fixtures
// ============================================================

const FIXTURE_DIR = path.join(__dirname, '__fixtures__', 'resolvers');
const EXT_DIR = path.join(FIXTURE_DIR, 'test-extension');

function makeExtension(overrides: Partial<LoadedExtension['manifest']> = {}): LoadedExtension {
  return {
    manifest: {
      name: 'test-ext',
      displayName: 'Test Extension',
      version: '1.0.0',
      contributes: {},
      ...overrides,
    },
    directory: EXT_DIR,
    source: 'local',
  };
}

// Pre-import all resolvers (static imports)
import { resolveAcpAdapters } from '@/extensions/resolvers/AcpAdapterResolver';
import { resolveMcpServers } from '@/extensions/resolvers/McpServerResolver';
import { resolveAssistants } from '@/extensions/resolvers/AssistantResolver';
import { resolveSkills } from '@/extensions/resolvers/SkillResolver';
import { resolveThemes } from '@/extensions/resolvers/ThemeResolver';

beforeAll(async () => {
  await fs.mkdir(path.join(EXT_DIR, 'assets'), { recursive: true });
  await fs.mkdir(path.join(EXT_DIR, 'themes'), { recursive: true });
  await fs.mkdir(path.join(EXT_DIR, 'skills', 'review'), { recursive: true });
  await fs.mkdir(path.join(EXT_DIR, 'assistants'), { recursive: true });

  await fs.writeFile(path.join(EXT_DIR, 'assets', 'icon.svg'), '<svg></svg>');
  await fs.writeFile(path.join(EXT_DIR, 'themes', 'light.css'), ':root { --color-bg: #fff; }');
  await fs.writeFile(path.join(EXT_DIR, 'themes', 'dark.css'), ':root { --color-bg: #000; }');
  await fs.writeFile(path.join(EXT_DIR, 'themes', 'cover.png'), 'fake-png-data');
  await fs.writeFile(
    path.join(EXT_DIR, 'skills', 'review', 'SKILL.md'),
    '# Code Review\nReview code for best practices.'
  );
  await fs.writeFile(path.join(EXT_DIR, 'assistants', 'context.md'), 'You are a helpful assistant.');
  await fs.writeFile(path.join(EXT_DIR, 'assistants', 'context-zh.md'), '你是一个有帮助的助手。');
});

afterAll(async () => {
  await fs.rm(FIXTURE_DIR, { recursive: true, force: true });
});

// ============================================================
// AcpAdapterResolver
// ============================================================

describe('AcpAdapterResolver', () => {
  it('should resolve adapters from extensions', () => {
    const ext = makeExtension({
      contributes: {
        acpAdapters: [
          {
            id: 'test-agent',
            name: 'Test Agent',
            cliCommand: 'testagent',
            acpArgs: ['acp'],
            icon: 'assets/icon.svg',
            supportsStreaming: true,
          },
        ],
      },
    });

    const result = resolveAcpAdapters([ext]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('test-agent');
    expect(result[0].name).toBe('Test Agent');
    expect(result[0].cliCommand).toBe('testagent');
    expect(result[0].defaultCliPath).toBe('testagent');
    expect(result[0].acpArgs).toEqual(['acp']);
    expect(result[0].supportsStreaming).toBe(true);
    expect(result[0].isPreset).toBe(false);
    expect(result[0].isBuiltin).toBe(false);
    expect(result[0]._source).toBe('extension');
    expect(result[0]._extensionName).toBe('test-ext');
  });

  it('should resolve local icon path as aion-asset:// URL', () => {
    const ext = makeExtension({
      contributes: {
        acpAdapters: [
          { id: 'icon-test', name: 'Icon Test', icon: 'assets/icon.svg' },
        ],
      },
    });

    const result = resolveAcpAdapters([ext]);
    expect(result[0].avatar).toMatch(/^aion-asset:\/\//);
    expect(result[0].avatar).toContain('assets/icon.svg');
    expect(result[0].avatar).not.toContain('\\');
  });

  it('should pass through URL icons as-is', () => {
    const ext = makeExtension({
      contributes: {
        acpAdapters: [
          { id: 'url-icon', name: 'URL Icon', icon: 'https://example.com/icon.png' },
        ],
      },
    });

    const result = resolveAcpAdapters([ext]);
    expect(result[0].avatar).toBe('https://example.com/icon.png');
  });

  it('should pass through http:// URL icons as-is', () => {
    const ext = makeExtension({
      contributes: {
        acpAdapters: [
          { id: 'http-icon', name: 'HTTP Icon', icon: 'http://cdn.example.com/logo.svg' },
        ],
      },
    });

    const result = resolveAcpAdapters([ext]);
    expect(result[0].avatar).toBe('http://cdn.example.com/logo.svg');
  });

  it('should pass through emoji icons as-is', () => {
    const ext = makeExtension({
      contributes: {
        acpAdapters: [
          { id: 'emoji-icon', name: 'Emoji Icon', icon: '🤖' },
        ],
      },
    });

    const result = resolveAcpAdapters([ext]);
    expect(result[0].avatar).toBe('🤖');
  });

  it('should handle adapter without icon', () => {
    const ext = makeExtension({
      contributes: {
        acpAdapters: [{ id: 'no-icon', name: 'No Icon' }],
      },
    });

    const result = resolveAcpAdapters([ext]);
    expect(result[0].avatar).toBeUndefined();
  });

  it('should use defaultCliPath over cliCommand when both provided', () => {
    const ext = makeExtension({
      contributes: {
        acpAdapters: [
          {
            id: 'path-test',
            name: 'Path Test',
            cliCommand: 'agent',
            defaultCliPath: '/usr/local/bin/agent',
          },
        ],
      },
    });

    const result = resolveAcpAdapters([ext]);
    expect(result[0].defaultCliPath).toBe('/usr/local/bin/agent');
  });

  it('should return empty array for extensions without adapters', () => {
    const ext = makeExtension({ contributes: {} });
    expect(resolveAcpAdapters([ext])).toEqual([]);
  });

  it('should handle multiple extensions', () => {
    const ext1 = makeExtension({
      contributes: { acpAdapters: [{ id: 'a', name: 'A' }] },
    });
    const ext2 = makeExtension({
      name: 'ext-2',
      contributes: { acpAdapters: [{ id: 'b', name: 'B' }] },
    });

    const result = resolveAcpAdapters([ext1, ext2]);
    expect(result).toHaveLength(2);
    expect(result.map((a: any) => a.id)).toEqual(['a', 'b']);
  });
});

// ============================================================
// McpServerResolver
// ============================================================

describe('McpServerResolver', () => {
  it('should resolve MCP servers from extensions', () => {
    const ext = makeExtension({
      contributes: {
        mcpServers: [
          {
            name: 'test-mcp',
            description: 'A test MCP server',
            transport: { type: 'stdio', command: 'npx', args: ['-y', 'test-server'] },
            enabled: true,
          },
        ],
      },
    });

    const result = resolveMcpServers([ext]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('ext-test-ext-test-mcp');
    expect(result[0].name).toBe('test-mcp');
    expect(result[0].transport.type).toBe('stdio');
    expect(result[0]._source).toBe('extension');
  });

  it('should return empty array for extensions without MCP servers', () => {
    const ext = makeExtension({ contributes: {} });
    expect(resolveMcpServers([ext])).toEqual([]);
  });
});

// ============================================================
// AssistantResolver
// ============================================================

describe('AssistantResolver', () => {
  it('should resolve assistants with context file content', async () => {
    const ext = makeExtension({
      contributes: {
        assistants: [
          {
            id: 'greeter',
            name: 'Greeter',
            presetAgentType: 'claude',
            contextFile: 'assistants/context.md',
            contextFileI18n: { 'zh-CN': 'assistants/context-zh.md' },
          },
        ],
      },
    });

    const result = await resolveAssistants([ext]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('ext-greeter');
    expect(result[0].context).toBe('You are a helpful assistant.');
    expect(result[0].contextI18n?.['zh-CN']).toBe('你是一个有帮助的助手。');
    expect(result[0].isPreset).toBe(true);
    expect(result[0].isBuiltin).toBe(false);
    expect(result[0]._source).toBe('extension');
  });

  it('should resolve local file avatar as aion-asset:// URL', async () => {
    const ext = makeExtension({
      contributes: {
        assistants: [
          {
            id: 'avatar-test',
            name: 'Avatar Test',
            presetAgentType: 'gemini',
            contextFile: 'assistants/context.md',
            avatar: 'assets/icon.svg',
          },
        ],
      },
    });

    const result = await resolveAssistants([ext]);
    expect(result[0].avatar).toMatch(/^aion-asset:\/\//);
    expect(result[0].avatar).toContain('assets/icon.svg');
  });

  it('should pass through URL avatar as-is', async () => {
    const ext = makeExtension({
      contributes: {
        assistants: [
          {
            id: 'url-avatar',
            name: 'URL Avatar',
            presetAgentType: 'gemini',
            contextFile: 'assistants/context.md',
            avatar: 'https://example.com/avatar.png',
          },
        ],
      },
    });

    const result = await resolveAssistants([ext]);
    expect(result[0].avatar).toBe('https://example.com/avatar.png');
  });

  it('should pass through emoji avatar as-is', async () => {
    const ext = makeExtension({
      contributes: {
        assistants: [
          {
            id: 'emoji-avatar',
            name: 'Emoji Avatar',
            presetAgentType: 'gemini',
            contextFile: 'assistants/context.md',
            avatar: '👋',
          },
        ],
      },
    });

    const result = await resolveAssistants([ext]);
    expect(result[0].avatar).toBe('👋');
  });

  it('should handle missing context file gracefully', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ext = makeExtension({
      contributes: {
        assistants: [
          {
            id: 'missing-ctx',
            name: 'Missing',
            presetAgentType: 'gemini',
            contextFile: 'nonexistent.md',
          },
        ],
      },
    });

    const result = await resolveAssistants([ext]);
    expect(result).toHaveLength(1);
    expect(result[0].context).toBe('');
    warnSpy.mockRestore();
  });
});

// ============================================================
// SkillResolver
// ============================================================

describe('SkillResolver', () => {
  it('should resolve skills from extensions', () => {
    const ext = makeExtension({
      contributes: {
        skills: [
          {
            name: 'code-review',
            description: 'Reviews code',
            file: 'skills/review/SKILL.md',
          },
        ],
      },
    });

    const result = resolveSkills([ext]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('code-review');
    expect(result[0].description).toBe('Reviews code');
    expect(result[0].location).toBe(path.resolve(EXT_DIR, 'skills/review/SKILL.md'));
  });

  it('should skip skills with non-existent files', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ext = makeExtension({
      contributes: {
        skills: [{ name: 'missing', file: 'nonexistent.md' }],
      },
    });

    const result = resolveSkills([ext]);
    expect(result).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Skill file not found'));
    warnSpy.mockRestore();
  });

  it('should detect path traversal in skill files', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ext = makeExtension({
      contributes: {
        skills: [{ name: 'evil', file: '../../etc/passwd' }],
      },
    });

    const result = resolveSkills([ext]);
    expect(result).toHaveLength(0);
    warnSpy.mockRestore();
  });

  it('should provide default description if none given', () => {
    const ext = makeExtension({
      contributes: {
        skills: [{ name: 'no-desc', file: 'skills/review/SKILL.md' }],
      },
    });

    const result = resolveSkills([ext]);
    expect(result[0].description).toContain('test-ext');
  });
});

// ============================================================
// ThemeResolver
// ============================================================

describe('ThemeResolver', () => {
  it('should resolve themes with CSS content', () => {
    const ext = makeExtension({
      contributes: {
        themes: [
          { id: 'light', name: 'Light Theme', file: 'themes/light.css' },
          { id: 'dark', name: 'Dark Theme', file: 'themes/dark.css' },
        ],
      },
    });

    const result = resolveThemes([ext]);
    expect(result).toHaveLength(2);

    expect(result[0].id).toBe('ext-test-ext-light');
    expect(result[0].name).toContain('Light Theme');
    expect(result[0].name).toContain('Test Extension');
    expect(result[0].css).toBe(':root { --color-bg: #fff; }');
    expect(result[0].isPreset).toBe(true);

    expect(result[1].id).toBe('ext-test-ext-dark');
    expect(result[1].css).toBe(':root { --color-bg: #000; }');
  });

  it('should resolve cover image as aion-asset:// URL', () => {
    const ext = makeExtension({
      contributes: {
        themes: [
          {
            id: 'with-cover',
            name: 'Cover Theme',
            file: 'themes/light.css',
            cover: 'themes/cover.png',
          },
        ],
      },
    });

    const result = resolveThemes([ext]);
    expect(result[0].cover).toMatch(/^aion-asset:\/\//);
    expect(result[0].cover).toContain('themes/cover.png');
    expect(result[0].cover).not.toContain('\\');
  });

  it('should skip themes with missing CSS file', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ext = makeExtension({
      contributes: {
        themes: [{ id: 'missing', name: 'Missing', file: 'nonexistent.css' }],
      },
    });

    const result = resolveThemes([ext]);
    expect(result).toHaveLength(0);
    warnSpy.mockRestore();
  });

  it('should detect path traversal in theme files', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ext = makeExtension({
      contributes: {
        themes: [{ id: 'evil', name: 'Evil', file: '../../etc/passwd' }],
      },
    });

    const result = resolveThemes([ext]);
    expect(result).toHaveLength(0);
    warnSpy.mockRestore();
  });
});
