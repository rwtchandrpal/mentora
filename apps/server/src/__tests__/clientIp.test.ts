import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { parseEnv } from '../config/env.js';
import { createClientIpResolver, type ClientIpResolver } from '../utils/clientIp.js';
import { createApiRateLimiter } from '../middlewares/rateLimit.middleware.js';

/** Mirrors production: one trusted hop, so req.ip is the right-most X-Forwarded-For entry. */
const makeIpApp = (resolver: ClientIpResolver): Express => {
  const app = express();
  app.set('trust proxy', 1);
  app.get('/ip', (req, res) => {
    res.json({ ip: resolver(req) });
  });
  return app;
};

describe('LIVE-FIX-003: stable client identity for guest quotas and rate limits', () => {
  describe('createClientIpResolver', () => {
    it('uses the configured header when it holds a valid IP', async () => {
      const app = makeIpApp(createClientIpResolver('CF-Connecting-IP'));
      const res = await request(app)
        .get('/ip')
        .set('CF-Connecting-IP', '198.51.100.23')
        .set('X-Forwarded-For', '198.51.100.23, 172.70.1.9');
      expect(res.body.ip).toBe('198.51.100.23');
    });

    it('accepts IPv6 and takes the first entry of a comma-separated value', async () => {
      const app = makeIpApp(createClientIpResolver('cf-connecting-ip'));
      const v6 = await request(app).get('/ip').set('CF-Connecting-IP', '2001:db8::7');
      expect(v6.body.ip).toBe('2001:db8::7');
      const list = await request(app)
        .get('/ip')
        .set('CF-Connecting-IP', '198.51.100.23, 10.0.0.1');
      expect(list.body.ip).toBe('198.51.100.23');
    });

    it('falls back to req.ip when the header is missing or not an IP', async () => {
      const app = makeIpApp(createClientIpResolver('cf-connecting-ip'));
      const missing = await request(app).get('/ip').set('X-Forwarded-For', '203.0.113.7');
      expect(missing.body.ip).toBe('203.0.113.7');
      const garbage = await request(app)
        .get('/ip')
        .set('CF-Connecting-IP', 'not-an-ip')
        .set('X-Forwarded-For', '203.0.113.7');
      expect(garbage.body.ip).toBe('203.0.113.7');
    });

    it('uses req.ip (trust proxy) when no header is configured', async () => {
      const app = makeIpApp(createClientIpResolver(undefined));
      const res = await request(app)
        .get('/ip')
        .set('CF-Connecting-IP', '198.51.100.23')
        .set('X-Forwarded-For', '6.6.6.6, 203.0.113.7');
      expect(res.body.ip).toBe('203.0.113.7');
    });
  });

  describe('API rate limiter keyed by the resolver', () => {
    const makeLimitedApp = (resolver: ClientIpResolver): Express => {
      const app = express();
      app.set('trust proxy', 1);
      app.use(
        createApiRateLimiter({
          windowMs: 60_000,
          limit: 2,
          skip: () => false,
          clientIp: resolver,
        })
      );
      app.get('/ping', (_req, res) => {
        res.json({ ok: true });
      });
      return app;
    };

    it('counts one client as one key even when the last proxy hop rotates (LIVE-BUG-H2)', async () => {
      // Production symptom: the same browser arrived via alternating edge addresses, so
      // req.ip (TRUST_PROXY=1) changed per request and each address got its own bucket.
      const app = makeLimitedApp(createClientIpResolver('cf-connecting-ip'));
      const client = '198.51.100.23';
      const hops = ['172.70.1.9', '172.70.2.10', '172.70.3.11'];
      const statuses: number[] = [];
      for (const hop of hops) {
        const res = await request(app)
          .get('/ping')
          .set('CF-Connecting-IP', client)
          .set('X-Forwarded-For', `${client}, ${hop}`);
        statuses.push(res.status);
      }
      expect(statuses).toEqual([200, 200, 429]);

      // A different client behind the same edge keeps its own budget.
      const other = await request(app)
        .get('/ping')
        .set('CF-Connecting-IP', '203.0.113.50')
        .set('X-Forwarded-For', '203.0.113.50, 172.70.1.9');
      expect(other.status).toBe(200);
    });

    it('without the header, rotating hops split one client into several keys', async () => {
      // Documents the old behaviour the header avoids.
      const app = makeLimitedApp(createClientIpResolver(undefined));
      const statuses: number[] = [];
      for (const hop of ['172.70.1.9', '172.70.2.10', '172.70.3.11']) {
        const res = await request(app)
          .get('/ping')
          .set('X-Forwarded-For', `198.51.100.23, ${hop}`);
        statuses.push(res.status);
      }
      expect(statuses).toEqual([200, 200, 200]);
    });
  });

  describe('env parsing', () => {
    const baseEnv = {
      MONGODB_URI: 'mongodb://127.0.0.1:27017/x',
      JWT_SECRET: 'x'.repeat(32),
      CLIENT_ORIGIN: 'http://localhost:5173',
      GEMINI_API_KEY: 'k',
    };

    it('CLIENT_IP_HEADER is optional, lower-cased, and empty means unset', () => {
      expect(parseEnv(baseEnv).CLIENT_IP_HEADER).toBeUndefined();
      expect(parseEnv({ ...baseEnv, CLIENT_IP_HEADER: '' }).CLIENT_IP_HEADER).toBeUndefined();
      expect(parseEnv({ ...baseEnv, CLIENT_IP_HEADER: ' CF-Connecting-IP ' }).CLIENT_IP_HEADER).toBe(
        'cf-connecting-ip'
      );
      expect(() => parseEnv({ ...baseEnv, CLIENT_IP_HEADER: 'bad header!' })).toThrow();
    });

    it('LOG_CLIENT_IP_DIAGNOSTICS defaults to off and parses "true"', () => {
      expect(parseEnv(baseEnv).LOG_CLIENT_IP_DIAGNOSTICS).toBe(false);
      expect(parseEnv({ ...baseEnv, LOG_CLIENT_IP_DIAGNOSTICS: 'true' }).LOG_CLIENT_IP_DIAGNOSTICS).toBe(
        true
      );
    });
  });
});
