/// <reference types="node" />
// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...values] = part.split(/\s+/);
        return [name, values.sort()];
      }),
  );
}

const metaCsp = directives(
  /const CSP =\s*"([^"]+)"/.exec(read('vite.config.ts'))?.[1] ?? '',
);
const headers = read('public/_headers');
const headerCsp = directives(
  /Content-Security-Policy:\s*([^\r\n]+)/.exec(headers)?.[1] ?? '',
);

describe('security headers', () => {
  it('keeps the build CSP inside the Cloudflare Pages CSP', () => {
    for (const [name, values] of metaCsp) {
      if (name === 'connect-src') continue; // header must allow the SW precache
      expect(headerCsp.get(name), name).toEqual(values);
    }
    expect(headerCsp.has('frame-ancestors')).toBe(true);
  });

  it('never allows eval, wildcards or plain http', () => {
    for (const policy of [metaCsp, headerCsp]) {
      for (const [name, values] of policy) {
        expect(values, name).not.toContain("'unsafe-eval'");
        expect(values.join(' '), name).not.toContain('*');
        expect(values.join(' '), name).not.toContain('http:');
      }
    }
  });

  it('ships the baseline response headers', () => {
    for (const header of [
      'X-Frame-Options: DENY',
      'X-Content-Type-Options: nosniff',
      'Referrer-Policy: strict-origin-when-cross-origin',
      'Cross-Origin-Opener-Policy: same-origin',
      'Cross-Origin-Resource-Policy: same-origin',
    ]) {
      expect(headers).toContain(header);
    }
  });
});
