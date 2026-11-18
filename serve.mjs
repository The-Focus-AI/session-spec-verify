import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, join, relative, sep } from 'node:path';

const docs = resolve(process.argv[2] || 'docs');
const port = Number(process.env.DOCS_PORT || 8080);
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
const ollama = new URL(process.env.OLLAMA_URL || 'http://127.0.0.1:11434');
if (!['http:', 'https:'].includes(ollama.protocol) || ollama.username || ollama.password ||
    ollama.search || ollama.hash || ollama.pathname !== '/') {
  throw new Error('OLLAMA_URL must be an HTTP(S) origin, such as http://127.0.0.1:11434, without /api.');
}

async function collect(dir, files) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.')) await collect(path, files);
    if (entry.isFile() && /\.(md|jsonl)$/i.test(entry.name)) {
      files.push({
        path: 'docs/' + relative(docs, path).split(sep).join('/'),
        text: await readFile(path, 'utf8'),
      });
    }
  }
}

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}

createServer(async (req, res) => {
  const host = req.headers.host;
  const origin = req.headers.origin;
  if (!allowedHosts.has(host) || (origin && origin !== `http://${host}`) ||
      req.headers['sec-fetch-site'] === 'cross-site') {
    return send(res, 403, JSON.stringify({ error: 'Open the viewer from this local server.' }));
  }
  try {
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      return send(res, 200, await readFile(new URL('./index.html', import.meta.url)), 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && req.url === '/api/docs') {
      const files = [];
      try {
        await readdir(docs);
      } catch (err) {
        if (err.code === 'ENOENT') return send(res, 404, JSON.stringify({ error: 'No local docs folder.' }));
        throw err;
      }
      await collect(docs, files);
      return send(res, 200, JSON.stringify(files));
    }
    const tags = req.method === 'GET' && req.url === '/api/ollama/tags';
    const chat = req.method === 'POST' && req.url === '/api/ollama/chat';
    if (!tags && !chat) return send(res, 404, '{}');
    let body;
    if (chat) {
      if (!req.headers['content-type']?.startsWith('application/json')) return send(res, 415, '{}');
      const parts = [];
      let length = 0;
      for await (const part of req) {
        length += part.length;
        if (length > 256_000) { send(res, 413, '{}'); return; }
        parts.push(part);
      }
      body = Buffer.concat(parts);
    }
    try {
      const endpoint = new URL(tags ? '/api/tags' : '/api/chat', ollama);
      const upstream = await fetch(endpoint, {
        method: req.method, body, headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(tags ? 5000 : 120_000), redirect: 'error',
      });
      const data = await upstream.text();
      if (tags && upstream.status === 404) {
        return send(res, 502, JSON.stringify({
          error: `The Docs Index server reached ${endpoint.href}, but it returned 404. Check that OLLAMA_URL points to an Ollama server.`,
        }));
      }
      if (tags && upstream.ok) {
        let payload;
        try { payload = JSON.parse(data); } catch {}
        if (!Array.isArray(payload?.models)) {
          return send(res, 502, JSON.stringify({
            error: `${endpoint.href} did not return an Ollama model list. Check OLLAMA_URL.`,
          }));
        }
      }
      return send(res, upstream.status, data);
    } catch {
      return send(res, 502, JSON.stringify({
        error: `This viewer server could not connect to Ollama at ${ollama.origin}. Start Ollama on the same machine or set OLLAMA_URL before running node serve.mjs.`,
      }));
    }
  } catch (err) {
    console.error(err.message);
    return send(res, 500, JSON.stringify({ error: 'Could not read the local workspace.' }));
  }
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port} · reading ${docs}`));
