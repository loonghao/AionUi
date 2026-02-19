/**
 * Extension System - WebuiResolver Helper Function Tests
 * Tests the pure helper functions: ensureApiExtPrefix, ensureExtWsPrefix,
 * ensureExtStaticPrefix, validateMiddlewareScope
 */

describe('WebuiResolver: ensureApiExtPrefix logic', () => {
  function ensureApiExtPrefix(routePath: string): string {
    if (routePath.startsWith('/api/ext/') || routePath.startsWith('/api/ext')) return routePath;
    const clean = routePath.startsWith('/') ? routePath.slice(1) : routePath;
    return `/api/ext/${clean}`;
  }

  it('should pass through paths already under /api/ext/', () => {
    expect(ensureApiExtPrefix('/api/ext/hello')).toBe('/api/ext/hello');
    expect(ensureApiExtPrefix('/api/ext/')).toBe('/api/ext/');
  });

  it('should prefix bare paths', () => {
    expect(ensureApiExtPrefix('/hello')).toBe('/api/ext/hello');
    expect(ensureApiExtPrefix('hello')).toBe('/api/ext/hello');
  });

  it('should handle root path', () => {
    expect(ensureApiExtPrefix('/')).toBe('/api/ext/');
  });
});

describe('WebuiResolver: ensureExtWsPrefix logic', () => {
  function ensureExtWsPrefix(namespace: string): string {
    return namespace.startsWith('ext:') ? namespace : `ext:${namespace}`;
  }

  it('should pass through namespaces already prefixed', () => {
    expect(ensureExtWsPrefix('ext:chat')).toBe('ext:chat');
  });

  it('should prefix bare namespaces', () => {
    expect(ensureExtWsPrefix('chat')).toBe('ext:chat');
    expect(ensureExtWsPrefix('my-ns')).toBe('ext:my-ns');
  });
});

describe('WebuiResolver: ensureExtStaticPrefix logic', () => {
  function ensureExtStaticPrefix(urlPrefix: string): string {
    if (urlPrefix.startsWith('/ext/')) return urlPrefix;
    return `/ext${urlPrefix.startsWith('/') ? '' : '/'}${urlPrefix}`;
  }

  it('should pass through paths already under /ext/', () => {
    expect(ensureExtStaticPrefix('/ext/hello')).toBe('/ext/hello');
  });

  it('should prefix absolute paths', () => {
    expect(ensureExtStaticPrefix('/hello')).toBe('/ext/hello');
  });

  it('should prefix relative paths', () => {
    expect(ensureExtStaticPrefix('hello')).toBe('/ext/hello');
  });
});

describe('WebuiResolver: validateMiddlewareScope logic', () => {
  function validateMiddlewareScope(applyTo: string): string {
    const allowed = ['/api/', '/ext/'];
    if (allowed.some((prefix) => applyTo.startsWith(prefix))) {
      return applyTo;
    }
    return '/api/ext/**';
  }

  it('should allow /api/ scoped middleware', () => {
    expect(validateMiddlewareScope('/api/v1/**')).toBe('/api/v1/**');
    expect(validateMiddlewareScope('/api/ext/hello')).toBe('/api/ext/hello');
  });

  it('should allow /ext/ scoped middleware', () => {
    expect(validateMiddlewareScope('/ext/hello/**')).toBe('/ext/hello/**');
  });

  it('should restrict other scopes to /api/ext/**', () => {
    expect(validateMiddlewareScope('/**')).toBe('/api/ext/**');
    expect(validateMiddlewareScope('/admin/**')).toBe('/api/ext/**');
    expect(validateMiddlewareScope('/static/**')).toBe('/api/ext/**');
  });
});
