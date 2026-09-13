import type { ServerResponse } from 'node:http';

export const BASE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};

export function send(
  response: ServerResponse,
  status: number,
  contentType: string,
  body: string | Buffer,
  headers: Record<string, string> = {}
): void {
  response.writeHead(status, { ...BASE_HEADERS, 'Content-Type': contentType, ...headers });
  response.end(body);
}

export function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): void {
  send(response, status, 'application/json; charset=utf-8', JSON.stringify(body), headers);
}

/** Starts a Server-Sent Events response. Reverse proxies like nginx must not buffer it. */
export function openEventStream(response: ServerResponse): void {
  response.writeHead(200, {
    ...BASE_HEADERS,
    'Content-Type': 'text/event-stream; charset=utf-8',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  response.write('retry: 2000\n\n');
}

export function writeEvent(response: ServerResponse, event: string, data: unknown): void {
  response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Sends comment lines so idle streams are not closed by proxies; returns a stop function. */
export function keepAlive(response: ServerResponse, heartbeatMs: number): () => void {
  const heartbeat = setInterval(() => response.write(': ping\n\n'), heartbeatMs);
  return () => clearInterval(heartbeat);
}
