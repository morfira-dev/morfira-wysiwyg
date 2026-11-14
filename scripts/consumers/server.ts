import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

/** A loopback-only server for the production consumer assets. */
export const serveConsumer = async (directory: string) => {
  const root = resolve(directory);
  const server = createServer((request, response) => {
    void (async () => {
      try {
        const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
        const path = resolve(root, `.${pathname}`);
        if (!path.startsWith(root + sep)) {
          response.writeHead(404).end();
          return;
        }
        const body = await readFile(path);
        const contentType = ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' } as Record<string, string>)[extname(path)] ?? 'application/octet-stream';
        response.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-store' }).end(body);
      }
      catch {
        response.writeHead(404).end();
      }
    })();
  });
  await new Promise<void>((resolveReady, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveReady);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a loopback server port.');
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolveClosed, reject) => server.close((error) => error ? reject(error) : resolveClosed())),
  };
};
