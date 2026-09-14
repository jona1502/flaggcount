import type { IncomingMessage } from 'node:http';
import { isIP } from 'node:net';

const normalizeAddress = (address: string): string => address.trim().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, '');

/** Loopback and private networks, where the reverse proxies in front of this server run. */
export function isTrustedProxyAddress(address: string): boolean {
  const normalized = normalizeAddress(address);
  if (isIP(normalized) === 0) return false;
  return /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|f[cd][0-9a-f]{2}:|fe[89ab][0-9a-f]:)/i.test(normalized);
}

/**
 * The visitor's address. Forwarded headers are only believed when the connection comes from a proxy in a
 * private network (Caddy, nginx); otherwise anyone could choose the address used for rate limits. Behind
 * such a proxy, Cloudflare's header wins, then the rightmost address in X-Forwarded-For that is not a proxy.
 */
export function clientAddress(request: IncomingMessage): string {
  const peer = normalizeAddress(request.socket.remoteAddress ?? '');
  if (!isTrustedProxyAddress(peer)) {
    return peer || 'unknown';
  }
  const cloudflare = request.headers['cf-connecting-ip'];
  if (typeof cloudflare === 'string' && isIP(normalizeAddress(cloudflare)) !== 0) {
    return normalizeAddress(cloudflare);
  }
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) {
    const addresses = forwarded.split(',').map(normalizeAddress).filter((address) => isIP(address) !== 0);
    const client = [...addresses].reverse().find((address) => !isTrustedProxyAddress(address)) ?? addresses[0];
    if (client) return client;
  }
  return peer;
}
