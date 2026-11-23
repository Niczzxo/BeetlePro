import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { validateEnvironment } from '../configure-app';
import { RateLimiter } from './rate-limit';
import { corsAllowlist, securityHeaders } from './security';

/**
 * HTTP-level security checks (Phase 7). The properties under
 * test live in Express middleware and in the bootstrap itself
 * (body limits, parser error shaping, production fail-fast),
 * so they are exercised against the real compiled server:
 * beforeAll builds the API with tsc (the same artifact
 * production runs) and boots dist/main.js as a child process.
 * The pure-function checks (environment validation, CORS
 * allowlist, HSTS, the limiter) run in-process below.
 */

/** Locates the API package root from the working directory,
 * whether the suite runs from the package or the repo root. */
function findApiRoot(): string {
  let dir = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    if (
      existsSync(join(dir, 'tsconfig.build.json')) &&
      existsSync(join(dir, 'src', 'main.ts'))
    ) {
      return dir;
    }
    const nested = join(dir, 'apps', 'api');
    if (existsSync(join(nested, 'tsconfig.build.json'))) return nested;
    dir = dirname(dir);
  }
  throw new Error('could not locate the API package root');
}

const API_ROOT = findApiRoot();

let server: ChildProcess | undefined;
let baseUrl: string;

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (!address || typeof address === 'string') {
        reject(new Error('could not allocate a port'));
        return;
      }
      probe.close(() => resolve(address.port));
    });
  });
}

async function waitForHealth(url: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) return;
    } catch {
      // Not up yet.
    }
    if (Date.now() > deadline) {
      throw new Error(`server at ${url} did not become healthy`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

function cleanEnv(extra: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...process.env, ...extra };
  delete env.ADMIN_SEED_EMAIL;
  delete env.ADMIN_SEED_PASSWORD;
  delete env.AUTH_SECRET;
  return env;
}

beforeAll(async () => {
  execFileSync('node_modules/.bin/tsc', ['-p', 'tsconfig.build.json'], {
    cwd: API_ROOT,
    stdio: 'inherit',
  });
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn('node', ['dist/main.js'], {
    cwd: API_ROOT,
    env: cleanEnv({ API_PORT: String(port) }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await waitForHealth(baseUrl, 60_000);
}, 180_000);

afterAll(async () => {
  if (server) {
    server.kill('SIGTERM');
    await new Promise((resolve) => {
      server?.once('exit', resolve);
      setTimeout(resolve, 5_000);
    });
    server = undefined;
  }
});

function postJson(path: string, body: unknown, raw?: string) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  });
}

describe('HTTP security surface (compiled server)', () => {
  it('answers malformed JSON in the consistent shape, without leaking internals', async () => {
    const response = await postJson(
      '/v1/visitor-events',
      null,
      '{"visitorId": broken-payload-marker',
    );
    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).not.toContain('SyntaxError');
    expect(text).not.toContain('broken-payload-marker');
    expect(text).not.toContain('stack');
    const body = JSON.parse(text) as Record<string, unknown>;
    expect(body['statusCode']).toBe(400);
    expect(body['message']).toBe('Malformed request body');
    expect(body['path']).toBe('/v1/visitor-events');
    expect(typeof body['timestamp']).toBe('string');
    // Even a parser rejection carries the baseline headers,
    // because the headers middleware runs first.
    expect(response.headers.get('x-content-type-options')).toBe(
      'nosniff',
    );
  });

  it('refuses an oversized JSON body with a shaped 413', async () => {
    const response = await postJson('/v1/visitor-events', {
      visitorId: 'visitor-oversize-001',
      sessionId: 'session-oversize-001',
      type: 'page-view',
      path: `/${'x'.repeat(150_000)}`,
    });
    expect(response.status).toBe(413);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body['statusCode']).toBe(413);
    expect(body['message']).toBe('Request body is too large');
  });

  it('shapes unknown routes and auth failures through the same filter', async () => {
    const missing = await fetch(`${baseUrl}/v1/does-not-exist`);
    expect(missing.status).toBe(404);
    const missingBody = (await missing.json()) as Record<
      string,
      unknown
    >;
    expect(missingBody['statusCode']).toBe(404);

    const staff = await fetch(`${baseUrl}/v1/admin/audit-log`);
    expect(staff.status).toBe(401);
    const staffBody = (await staff.json()) as Record<string, unknown>;
    expect(staffBody['statusCode']).toBe(401);
    expect(staffBody['message']).toBe(
      'A valid access token is required for this route',
    );
  });

  it('still accepts a valid visitor event end to end', async () => {
    const response = await postJson('/v1/visitor-events', {
      visitorId: 'visitor-http-test-1',
      sessionId: 'session-http-test-1',
      type: 'page-view',
      path: '/',
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as Record<string, unknown>;
    expect(typeof body['id']).toBe('string');
  });

  it('keeps the webhook raw-body path working (unconfigured secret answers 503, shaped)', async () => {
    const response = await postJson('/v1/webhooks/bkash', {
      eventId: 'evt-http-1',
      status: 'success',
    });
    expect(response.status).toBe(503);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body['statusCode']).toBe(503);
  });

  it(
    'rate limits consent records per IP plus visitor id',
    async () => {
      const payload = {
        visitorId: 'visitor-consent-limit',
        scope: 'marketing',
        status: 'granted',
      };
      for (let attempt = 0; attempt < 60; attempt += 1) {
        const ok = await postJson('/v1/visitors/consent', payload);
        expect(ok.status).toBe(201);
      }
      const blocked = await postJson('/v1/visitors/consent', payload);
      expect(blocked.status).toBe(429);
      const body = (await blocked.json()) as Record<string, unknown>;
      expect(body['statusCode']).toBe(429);
    },
    60_000,
  );

  it(
    'refuses to boot in production without AUTH_SECRET',
    async () => {
      const port = await freePort();
      const child = spawn('node', ['dist/main.js'], {
        cwd: API_ROOT,
        env: cleanEnv({
          API_PORT: String(port),
          NODE_ENV: 'production',
        }),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      child.stdout?.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
      const exitCode = await new Promise<number | null>((resolve) => {
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          resolve(null);
        }, 30_000);
        child.once('exit', (code) => {
          clearTimeout(timer);
          resolve(code);
        });
      });
      expect(exitCode).toBe(1);
      expect(output).toContain('AUTH_SECRET must be set');
    },
    60_000,
  );
});

describe('environment validation and production hardening', () => {
  it('fails fast in production without a real AUTH_SECRET', () => {
    expect(() =>
      validateEnvironment({ NODE_ENV: 'production' }),
    ).toThrow(/AUTH_SECRET must be set/);
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        AUTH_SECRET: 'too-short',
      }),
    ).toThrow(/AUTH_SECRET must be set/);
  });

  it('accepts production with a proper secret and development without one', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        AUTH_SECRET: 'a-production-grade-secret',
      }),
    ).not.toThrow();
    expect(() => validateEnvironment({})).not.toThrow();
    expect(() =>
      validateEnvironment({ NODE_ENV: 'development' }),
    ).not.toThrow();
  });

  it('tightens the CORS allowlist to the configured origins in production', () => {
    const saved = { ...process.env };
    try {
      process.env.NODE_ENV = 'production';
      process.env.STOREFRONT_URL = 'https://www.dostelo.com';
      process.env.ADMIN_URL = 'https://admin.dostelo.com';
      const origins = corsAllowlist();
      expect(origins).toContain('https://www.dostelo.com');
      expect(origins).toContain('https://admin.dostelo.com');
      expect(
        origins.some((origin) => origin.includes('localhost')),
      ).toBe(false);
    } finally {
      process.env = saved;
    }
  });

  it('keeps local dev origins in the allowlist outside production', () => {
    const saved = { ...process.env };
    try {
      delete process.env.NODE_ENV;
      expect(corsAllowlist()).toContain('http://localhost:3000');
      expect(corsAllowlist()).toContain('http://localhost:3001');
    } finally {
      process.env = saved;
    }
  });

  it('sends HSTS only in production', () => {
    const saved = process.env.NODE_ENV;
    try {
      const run = (nodeEnv: string | undefined) => {
        if (nodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = nodeEnv;
        const headers = new Map<string, string>();
        securityHeaders(
          {} as never,
          {
            setHeader: (name: string, value: string) =>
              headers.set(name.toLowerCase(), value),
          } as never,
          (() => undefined) as never,
        );
        return headers;
      };
      expect(run('production').get('strict-transport-security')).toBe(
        'max-age=31536000; includeSubDomains',
      );
      expect(run(undefined).has('strict-transport-security')).toBe(
        false,
      );
      expect(run('production').get('x-frame-options')).toBe('DENY');
    } finally {
      if (saved === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = saved;
    }
  });
});

describe('rate limiter', () => {
  it('allows up to the limit, then refuses until reset', () => {
    const limiter = new RateLimiter();
    const options = { limit: 3, windowMs: 60_000 };
    expect(limiter.hit('key-a', options)).toBe(true);
    expect(limiter.hit('key-a', options)).toBe(true);
    expect(limiter.hit('key-a', options)).toBe(true);
    expect(limiter.hit('key-a', options)).toBe(false);
    expect(limiter.hit('key-b', options)).toBe(true);
    limiter.reset('key-a');
    expect(limiter.hit('key-a', options)).toBe(true);
  });
});
