const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'dist');
const port = Number(process.env.CUTSYNC_E2E_PORT || 8081);
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const server = http.createServer((request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url || '/', `http://${request.headers.host}`).pathname);
  const relative = requestPath.replace(/^\/+/, '');
  const requestedFile = path.resolve(root, relative);
  const isSafeFile = requestedFile.startsWith(`${root}${path.sep}`) && path.extname(requestedFile);
  const file = isSafeFile && fs.existsSync(requestedFile)
    ? requestedFile
    : path.join(root, 'index.html');

  fs.readFile(file, (error, content) => {
    if (error) {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('CutSync web build is unavailable. Run npm run build:web.');
      return;
    }
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': mimeTypes[path.extname(file)] || 'application/octet-stream',
    });
    response.end(content);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`CutSync test build listening on http://127.0.0.1:${port}`);
});
