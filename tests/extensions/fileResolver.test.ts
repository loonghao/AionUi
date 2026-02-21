/**
 * Extension System - File Reference Resolver Tests
 */

import { vi } from 'vitest';
import { resolveFileRefs } from '@/extensions/fileResolver';
import path from 'path';
import fs from 'fs/promises';

const TEST_EXT_DIR = path.join(__dirname, '__fixtures__', 'file-resolver');

beforeAll(async () => {
  await fs.mkdir(path.join(TEST_EXT_DIR, 'sub'), { recursive: true });

  await fs.writeFile(
    path.join(TEST_EXT_DIR, 'config.json'),
    JSON.stringify({ key: 'value', nested: { a: 1 } })
  );
  await fs.writeFile(path.join(TEST_EXT_DIR, 'prompt.md'), 'Hello, I am a prompt.\n');
  await fs.writeFile(
    path.join(TEST_EXT_DIR, 'with-comments.jsonc'),
    '{\n  // This is a comment\n  "key": "val"\n}\n'
  );
  await fs.writeFile(
    path.join(TEST_EXT_DIR, 'nested-ref.json'),
    JSON.stringify({ inner: '$file:config.json' })
  );
  await fs.writeFile(
    path.join(TEST_EXT_DIR, 'circular-a.json'),
    JSON.stringify({ ref: '$file:circular-b.json' })
  );
  await fs.writeFile(
    path.join(TEST_EXT_DIR, 'circular-b.json'),
    JSON.stringify({ ref: '$file:circular-a.json' })
  );
  await fs.writeFile(path.join(TEST_EXT_DIR, 'sub', 'deep.json'), JSON.stringify({ deep: true }));
});

afterAll(async () => {
  await fs.rm(TEST_EXT_DIR, { recursive: true, force: true });
});

describe('resolveFileRefs', () => {
  it('should resolve a $file: reference to a JSON file', async () => {
    const result = await resolveFileRefs('$file:config.json', TEST_EXT_DIR);
    expect(result).toEqual({ key: 'value', nested: { a: 1 } });
  });

  it('should resolve a $file: reference to a markdown file as string', async () => {
    const result = await resolveFileRefs('$file:prompt.md', TEST_EXT_DIR);
    expect(result).toBe('Hello, I am a prompt.');
  });

  it('should resolve $file: references inside objects', async () => {
    const input = {
      data: '$file:config.json',
      text: '$file:prompt.md',
      plain: 'no-ref',
    };
    const result = await resolveFileRefs(input, TEST_EXT_DIR);
    expect(result).toEqual({
      data: { key: 'value', nested: { a: 1 } },
      text: 'Hello, I am a prompt.',
      plain: 'no-ref',
    });
  });

  it('should resolve $file: references inside arrays', async () => {
    const input = ['$file:config.json', 'static'];
    const result = await resolveFileRefs(input, TEST_EXT_DIR);
    expect(result).toEqual([{ key: 'value', nested: { a: 1 } }, 'static']);
  });

  it('should handle JSONC files (strip comments)', async () => {
    const result = await resolveFileRefs('$file:with-comments.jsonc', TEST_EXT_DIR);
    expect(result).toEqual({ key: 'val' });
  });

  it('should resolve nested $file: references recursively', async () => {
    const result = await resolveFileRefs('$file:nested-ref.json', TEST_EXT_DIR);
    expect(result).toEqual({
      inner: { key: 'value', nested: { a: 1 } },
    });
  });

  it('should detect circular references and return raw ref', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await resolveFileRefs('$file:circular-a.json', TEST_EXT_DIR);
    expect(result).toEqual({
      ref: { ref: '$file:circular-a.json' },
    });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Circular'));
    warnSpy.mockRestore();
  });

  it('should return raw ref for non-existent files', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await resolveFileRefs('$file:nonexistent.json', TEST_EXT_DIR);
    expect(result).toBe('$file:nonexistent.json');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('should pass through non-ref values unchanged', async () => {
    expect(await resolveFileRefs('just a string', TEST_EXT_DIR)).toBe('just a string');
    expect(await resolveFileRefs(42, TEST_EXT_DIR)).toBe(42);
    expect(await resolveFileRefs(true, TEST_EXT_DIR)).toBe(true);
    expect(await resolveFileRefs(null, TEST_EXT_DIR)).toBe(null);
  });

  it('should resolve subdirectory references', async () => {
    const result = await resolveFileRefs('$file:sub/deep.json', TEST_EXT_DIR);
    expect(result).toEqual({ deep: true });
  });
});
