import { isIP } from 'node:net';
import type { Request, RequestHandler } from 'express';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

export type ClientIpResolver = (req: Request) => string;

const readHeader = (req: Request, name: string): string | undefined => {
  const raw = req.headers[name];
  return Array.isArray(raw) ? raw[0] : raw;
};

/**
 * Builds the resolver that names "this client" for guest quotas and rate limits.
 *
 * With `clientIpHeader` set (e.g. `cf-connecting-ip` on Render, which sits behind
 * Cloudflare), that header wins when it holds a valid IP. Otherwise it falls back to
 * `req.ip`, which Express derives from X-Forwarded-For using `trust proxy`.
 *
 * Why the header: on Render the hop count in front of the app is undocumented, and a
 * live probe showed `req.ip` (TRUST_PROXY=1) alternating between rotating proxy
 * addresses for one client, so guest quota windows split per request (LIVE-BUG-H2).
 * Cloudflare sets CF-Connecting-IP to the address that connected to its edge. It is
 * not a security boundary (a Cloudflare Worker can set it), but it is a sound key
 * for quotas and rate limits, which only need to group one client's requests.
 */
export const createClientIpResolver = (clientIpHeader?: string): ClientIpResolver => {
  const headerName = clientIpHeader?.trim().toLowerCase() || undefined;

  return (req) => {
    if (headerName) {
      // Take the first entry in case a hop appended to the header.
      const candidate = readHeader(req, headerName)?.split(',')[0]?.trim();
      if (candidate && isIP(candidate)) {
        return candidate;
      }
    }
    return req.ip || req.socket.remoteAddress || 'unknown';
  };
};

/** The resolver configured for this process (CLIENT_IP_HEADER). */
export const getClientIp: ClientIpResolver = createClientIpResolver(env.CLIENT_IP_HEADER);

const DIAGNOSTIC_HEADERS = [
  'x-forwarded-for',
  'cf-connecting-ip',
  'true-client-ip',
  'x-real-ip',
] as const;

/**
 * Opt-in (LOG_CLIENT_IP_DIAGNOSTICS=true) logger for the first `maxRequests` requests,
 * showing how the proxy chain reaches the app so CLIENT_IP_HEADER / TRUST_PROXY can be
 * confirmed in production. It logs client IPs, so leave it off outside that check.
 */
export const createClientIpDiagnostics = (
  resolver: ClientIpResolver,
  maxRequests = 20
): RequestHandler => {
  let logged = 0;
  return (req, _res, next) => {
    if (logged < maxRequests) {
      logged += 1;
      logger.info(
        {
          clientIpDiagnostics: {
            resolved: resolver(req),
            reqIp: req.ip,
            reqIps: req.ips,
            remoteAddress: req.socket.remoteAddress,
            headers: Object.fromEntries(
              DIAGNOSTIC_HEADERS.map((name) => [name, readHeader(req, name) ?? null])
            ),
          },
        },
        `Client IP diagnostics ${logged}/${maxRequests}`
      );
    }
    next();
  };
};
