import http from 'node:http';
import { readFile } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { analyzeFile } from './file-operations.js';
import { add, divide, multiply, subtract } from './math.js';
import { runBlockingDemo } from './blocking.js';
import { runNonBlockingDemo } from './non-blocking.js';

const port = 3000;
const sampleFile = fileURLToPath(new URL('./sample.txt', import.meta.url));

function send(response, statusCode, body, contentType = 'text/html') {
  response.writeHead(statusCode, { 'Content-Type': `${contentType}; charset=utf-8` });
  response.end(body);
}

function page(title, content) {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>${title}</title></head>
  <body><h1>${title}</h1>${content}<p><a href="/">Back to demo index</a></p></body>
</html>`;
}

const server = http.createServer((request, response) => {
  const route = new URL(request.url, `http://${request.headers.host}`).pathname;

  if (route === '/') {
    send(response, 200, page('Node.js demonstrations', `
      <p>This response was created with the native <code>http</code> module.</p>
      <ul>
        <li><a href="/about">Basic HTML route</a></li>
        <li><a href="/api/student">JSON route</a></li>
        <li><a href="/file">View file content</a></li>
        <li><a href="/file-info">Check file details</a></li>
        <li><a href="/math">Use a custom math module</a></li>
        <li><a href="/blocking">Blocking example</a></li>
        <li><a href="/non-blocking">Non-blocking example</a></li>
      </ul>`));
    return;
  }

  if (route === '/about') {
    send(response, 200, page('About route', '<p>This is a second HTML route selected by the request URL.</p>'));
    return;
  }

  if (route === '/api/student') {
    send(response, 200, JSON.stringify({ name: 'Node.js practical', topic: 'Basic routing', status: 'complete' }), 'application/json');
    return;
  }

  if (route === '/file') {
    readFile(sampleFile, 'utf8', (error, content) => {
      if (error) {
        send(response, 500, page('File error', `<p>${error.message}</p>`));
        return;
      }

      send(response, 200, page('File content', `<pre>${content}</pre>`));
    });
    return;
  }

  if (route === '/file-info') {
    analyzeFile(sampleFile, (error, details) => {
      if (error) {
        send(response, 500, JSON.stringify({ error: error.message }), 'application/json');
        return;
      }

      send(response, 200, JSON.stringify(details, null, 2), 'application/json');
    });
    return;
  }

  if (route === '/math') {
    send(response, 200, JSON.stringify({ add: add(8, 2), subtract: subtract(8, 2), multiply: multiply(8, 2), divide: divide(8, 2) }, null, 2), 'application/json');
    return;
  }

  if (route === '/blocking') {
    send(response, 200, JSON.stringify(runBlockingDemo(sampleFile), null, 2), 'application/json');
    return;
  }

  if (route === '/non-blocking') {
    runNonBlockingDemo(sampleFile, (error, result) => {
      if (error) {
        send(response, 500, JSON.stringify({ error: error.message }), 'application/json');
        return;
      }

      send(response, 200, JSON.stringify(result, null, 2), 'application/json');
    });
    return;
  }

  send(response, 404, page('404 - Route not found', `<p>No route exists for <code>${route}</code>.</p>`));
});

server.listen(port, () => {
  console.log(`Node demo server running at http://localhost:${port}`);
});
