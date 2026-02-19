/**
 * Extension System - ExtensionLoader Tests
 */

import { vi } from 'vitest';
import path from 'path';
import fs from 'fs/promises';

// Mock the constants module to control scan directories.
// Must include ALL exports that are transitively imported (e.g. envResolver.ts imports AIONUI_STRICT_ENV_ENV).
// Cannot use importOriginal because the real module imports `app` from 'electron' which is unavailable in tests.
vi.mock('@/extensions/constants', () => ({
  getUserExtensionsDir: () => path.join(__dirname, '__fixtures__', 'loader', 'user'),
  getAppDataExtensionsDir: () => path.join(__dirname, '__fixtures__', 'loader', 'appdata'),
  getEnvExtensionsDirs: () => [path.join(__dirname, '__fixtures__', 'loader', 'env')],
  EXTENSION_MANIFEST_FILE: 'aion-extension.json',
  AIONUI_STRICT_ENV_ENV: 'AIONUI_STRICT_ENV',
  AIONUI_EXTENSIONS_PATH_ENV: 'AIONUI_EXTENSIONS_PATH',
  PATH_SEPARATOR: process.platform === 'win32' ? ';' : ':',
  EXTENSIONS_DIR_NAME: 'extensions',
}));

const FIXTURE_BASE = path.join(__dirname, '__fixtures__', 'loader');

beforeAll(async () => {
  // Create user extensions dir with valid extension
  const userExtDir = path.join(FIXTURE_BASE, 'user', 'valid-ext');
  await fs.mkdir(userExtDir, { recursive: true });
  await fs.writeFile(
    path.join(userExtDir, 'aion-extension.json'),
    JSON.stringify({
      name: 'valid-ext',
      displayName: 'Valid Extension',
      version: '1.0.0',
      contributes: {
        acpAdapters: [{ id: 'test', name: 'Test', cliCommand: 'test' }],
      },
    })
  );

  // Create another extension with $file: reference
  const refExtDir = path.join(FIXTURE_BASE, 'user', 'ref-ext');
  await fs.mkdir(path.join(refExtDir, 'contributes'), { recursive: true });
  await fs.writeFile(
    path.join(refExtDir, 'contributes', 'adapters.json'),
    JSON.stringify([{ id: 'ref-adapter', name: 'Ref Adapter', cliCommand: 'ref' }])
  );
  await fs.writeFile(
    path.join(refExtDir, 'aion-extension.json'),
    JSON.stringify({
      name: 'ref-ext',
      displayName: 'Ref Extension',
      version: '1.0.0',
      contributes: {
        acpAdapters: '$file:contributes/adapters.json',
      },
    })
  );

  // Create invalid extension (bad JSON)
  const badExtDir = path.join(FIXTURE_BASE, 'user', 'bad-json-ext');
  await fs.mkdir(badExtDir, { recursive: true });
  await fs.writeFile(path.join(badExtDir, 'aion-extension.json'), '{ invalid json }');

  // Create extension with invalid schema
  const badSchemaDir = path.join(FIXTURE_BASE, 'user', 'bad-schema-ext');
  await fs.mkdir(badSchemaDir, { recursive: true });
  await fs.writeFile(
    path.join(badSchemaDir, 'aion-extension.json'),
    JSON.stringify({
      name: 'Invalid_Name',
      displayName: 'Bad',
      version: '1.0.0',
      contributes: {},
    })
  );

  // Create duplicate in appdata (should be skipped)
  const dupeDir = path.join(FIXTURE_BASE, 'appdata', 'valid-ext');
  await fs.mkdir(dupeDir, { recursive: true });
  await fs.writeFile(
    path.join(dupeDir, 'aion-extension.json'),
    JSON.stringify({
      name: 'valid-ext',
      displayName: 'Duplicate',
      version: '2.0.0',
      contributes: {},
    })
  );

  // Create env extension
  const envExtDir = path.join(FIXTURE_BASE, 'env', 'env-ext');
  await fs.mkdir(envExtDir, { recursive: true });
  await fs.writeFile(
    path.join(envExtDir, 'aion-extension.json'),
    JSON.stringify({
      name: 'env-ext',
      displayName: 'Env Extension',
      version: '1.0.0',
      contributes: {},
    })
  );

  // Create JSONC extension (with comments)
  const jsoncDir = path.join(FIXTURE_BASE, 'user', 'jsonc-ext');
  await fs.mkdir(jsoncDir, { recursive: true });
  await fs.writeFile(
    path.join(jsoncDir, 'aion-extension.json'),
    `{
      // This is a comment
      "name": "jsonc-ext",
      "displayName": "JSONC Extension",
      "version": "1.0.0",
      "contributes": {}
    }`
  );

  // Create a non-directory file (should be skipped)
  await fs.writeFile(path.join(FIXTURE_BASE, 'user', 'not-a-dir.txt'), 'I am a file');
});

afterAll(async () => {
  await fs.rm(FIXTURE_BASE, { recursive: true, force: true });
});

describe('ExtensionLoader', () => {
  let ExtensionLoader: any;

  beforeEach(async () => {
    const mod = await import('@/extensions/ExtensionLoader');
    ExtensionLoader = mod.ExtensionLoader;
  });

  it('should load valid extensions', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loader = new ExtensionLoader();
    const extensions = await loader.loadAll();

    const names = extensions.map((e: any) => e.manifest.name);
    expect(names).toContain('valid-ext');
    expect(names).toContain('ref-ext');
    expect(names).toContain('jsonc-ext');
    expect(names).toContain('env-ext');

    warnSpy.mockRestore();
  });

  it('should skip invalid JSON', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loader = new ExtensionLoader();
    const extensions = await loader.loadAll();

    const names = extensions.map((e: any) => e.manifest.name);
    expect(names).not.toContain('bad-json-ext');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid JSON'),
      expect.anything()
    );

    warnSpy.mockRestore();
  });

  it('should skip invalid schema (non-kebab-case name)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loader = new ExtensionLoader();
    const extensions = await loader.loadAll();

    const names = extensions.map((e: any) => e.manifest.name);
    expect(names).not.toContain('Invalid_Name');

    warnSpy.mockRestore();
  });

  it('should deduplicate by name (higher priority wins)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loader = new ExtensionLoader();
    const extensions = await loader.loadAll();

    const validExts = extensions.filter((e: any) => e.manifest.name === 'valid-ext');
    expect(validExts).toHaveLength(1);
    expect(validExts[0].source).toBe('local');
    expect(validExts[0].manifest.version).toBe('1.0.0');

    warnSpy.mockRestore();
  });

  it('should resolve $file: references in manifests', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loader = new ExtensionLoader();
    const extensions = await loader.loadAll();

    const refExt = extensions.find((e: any) => e.manifest.name === 'ref-ext');
    expect(refExt).toBeDefined();
    expect(refExt!.manifest.contributes.acpAdapters).toMatchObject([
      { id: 'ref-adapter', name: 'Ref Adapter' },
    ]);

    warnSpy.mockRestore();
  });

  it('should set correct source for each extension', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loader = new ExtensionLoader();
    const extensions = await loader.loadAll();

    const envExt = extensions.find((e: any) => e.manifest.name === 'env-ext');
    expect(envExt?.source).toBe('env');

    const userExt = extensions.find((e: any) => e.manifest.name === 'valid-ext');
    expect(userExt?.source).toBe('local');

    warnSpy.mockRestore();
  });

  it('should handle JSONC (comments) in manifest', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loader = new ExtensionLoader();
    const extensions = await loader.loadAll();

    const jsoncExt = extensions.find((e: any) => e.manifest.name === 'jsonc-ext');
    expect(jsoncExt).toBeDefined();
    expect(jsoncExt!.manifest.displayName).toBe('JSONC Extension');

    warnSpy.mockRestore();
  });

  it('should return empty array for nonexistent directories', async () => {
    const loader = new ExtensionLoader();
    const extensions = await loader.loadAll();
    expect(Array.isArray(extensions)).toBe(true);
  });
});
