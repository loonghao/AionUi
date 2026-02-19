/**
 * Extension System - Environment Variable Resolver Tests
 */

import { vi } from 'vitest';
import { resolveEnvTemplates, resolveEnvInObject } from '@/extensions/envResolver';

describe('resolveEnvTemplates', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.TEST_VAR = 'hello';
    process.env.API_KEY = 'sk-12345';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should replace a single env variable', () => {
    expect(resolveEnvTemplates('${env:TEST_VAR}')).toBe('hello');
  });

  it('should replace multiple env variables', () => {
    expect(resolveEnvTemplates('key=${env:API_KEY}&name=${env:TEST_VAR}')).toBe(
      'key=sk-12345&name=hello'
    );
  });

  it('should return empty string for undefined variables', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveEnvTemplates('${env:UNDEFINED_VAR}')).toBe('');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('UNDEFINED_VAR'));
    warnSpy.mockRestore();
  });

  it('should pass through strings without templates', () => {
    expect(resolveEnvTemplates('no templates here')).toBe('no templates here');
    expect(resolveEnvTemplates('')).toBe('');
  });

  it('should not resolve malformed templates', () => {
    expect(resolveEnvTemplates('${envTEST_VAR}')).toBe('${envTEST_VAR}');
    expect(resolveEnvTemplates('$env:TEST_VAR')).toBe('$env:TEST_VAR');
  });
});

describe('resolveEnvInObject', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.MY_VAR = 'resolved';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should resolve env templates in nested objects', () => {
    const input = {
      key: '${env:MY_VAR}',
      nested: {
        deep: '${env:MY_VAR}-value',
      },
    };
    const result = resolveEnvInObject(input);
    expect(result.key).toBe('resolved');
    expect(result.nested.deep).toBe('resolved-value');
  });

  it('should resolve env templates in arrays', () => {
    const result = resolveEnvInObject(['${env:MY_VAR}', 'static']);
    expect(result).toEqual(['resolved', 'static']);
  });

  it('should pass through non-string primitives', () => {
    expect(resolveEnvInObject(42)).toBe(42);
    expect(resolveEnvInObject(true)).toBe(true);
    expect(resolveEnvInObject(null)).toBe(null);
  });

  it('should handle mixed object with non-string values', () => {
    const input = {
      str: '${env:MY_VAR}',
      num: 42,
      bool: true,
      arr: ['${env:MY_VAR}', 1],
    };
    const result = resolveEnvInObject(input);
    expect(result).toEqual({
      str: 'resolved',
      num: 42,
      bool: true,
      arr: ['resolved', 1],
    });
  });
});
