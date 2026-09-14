// Local development: one origin for Next.js and the backend, like the Caddy proxy in production.
//   npm run dev:next                                   (Next.js on 3001)
//   PORT=3010 npm run start:web                        (backend on 3010, after npm run build:server)
//   npm run dev:proxy                                  (http://localhost:3000)
import { createServer, request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import { pathToFileURL } from 'node:url';
import { routeTarget } from './web-routes.mjs';

const pathOf = (url) => new URL(url ?? '/', 'http://localhost').pathname;

function forwardedHeaders(request) {
  const previous = request.headers['x-forwarded-for'];
  const address = request.socket.remoteAddress ?? '';
  return {
    ...request.headers,
    'x-forwarded-for': previous ? `${previous}, ${address}` : address,
    'x-forwarded-proto': 'http',
    'x-forwarded-host': request.headers.host ?? ''
  };
}

/** A streaming reverse proxy: responses are piped as they arrive, so event streams are never buffered. */
export function createDevProxy(targets) {
  const server = createServer((request, response) => {
    const target = targets[routeTarget(pathOf(request.url))];
    const upstream = httpRequest(
      { hostname: target.hostname, port: target.port, method: request.method, path: request.url, headers: forwardedHeaders(request) },
      (reply) => {
        response.writeHead(reply.statusCode ?? 502, reply.headers);
        response.flushHeaders();
        reply.pipe(response);
      }
    );
    upstream.on('error', () => {
      if (!response.headersSent) response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Upstream unavailable');
    });
    response.on('close', () => upstream.destroy());
    request.pipe(upstream);
  });

  // WebSocket upgrades, e.g. hot reloading of `next dev`.
  server.on('upgrade', (request, socket, head) => {
    const target = targets[routeTarget(pathOf(request.url))];
    const upstream = connect(Number(target.port), target.hostname, () => {
      const headers = Object.entries(forwardedHeaders(request)).map(([name, value]) => `${name}: ${Array.isArray(value) ? value.join(', ') : value}`);
      upstream.write(`${request.method} ${request.url} HTTP/${request.httpVersion}\r\n${headers.join('\r\n')}\r\n\r\n`);
      upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
  });

  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const port = Number(process.env.DEV_PROXY_PORT ?? 3000);
  const targets = {
    web: new URL(process.env.DEV_WEB_URL ?? 'http://127.0.0.1:3001'),
    backend: new URL(process.env.DEV_BACKEND_URL ?? 'http://127.0.0.1:3010')
  };
  createDevProxy(targets).listen(port, '127.0.0.1', () => {
    console.log(`FlagCount dev proxy on http://localhost:${port} -> web ${targets.web.origin}, backend ${targets.backend.origin}`);
  });
}
