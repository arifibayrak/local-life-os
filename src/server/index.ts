import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from '../config.js';
import { log } from '../logger.js';
import { vaultPaths } from '../vault/paths.js';
import { llmHealthy } from '../llm/client.js';
import { transcribe, TranscriptionUnavailable } from '../scribe/whisper.js';
import type { SessionManager } from '../session/manager.js';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');

function send(res: ServerResponse, status: number, body: unknown, type = 'application/json'): void {
  const payload = type === 'application/json' ? JSON.stringify(body) : (body as string);
  res.writeHead(status, { 'content-type': type });
  res.end(payload);
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as T;
}

export function startServer(manager: SessionManager): void {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${config.host}:${config.port}`);
    const { pathname } = url;
    try {
      if (req.method === 'GET' && pathname === '/') {
        return send(res, 200, readFileSync(join(PUBLIC, 'index.html'), 'utf8'), 'text/html');
      }
      if (req.method === 'GET' && pathname === '/api/health') {
        return send(res, 200, { llm: await llmHealthy() });
      }
      if (req.method === 'GET' && pathname === '/api/state') {
        return send(res, 200, manager.state());
      }
      if (req.method === 'POST' && pathname === '/api/capture') {
        const { text } = await readJson<{ text?: string }>(req);
        if (!text?.trim()) return send(res, 400, { error: 'empty capture' });
        manager.capture(text, 'text');
        return send(res, 200, manager.state());
      }
      if (req.method === 'POST' && pathname === '/api/voice') {
        const { audioBase64, ext } = await readJson<{ audioBase64?: string; ext?: string }>(req);
        if (!audioBase64) return send(res, 400, { error: 'no audio' });
        mkdirSync(vaultPaths.audioDir, { recursive: true });
        const file = join(vaultPaths.audioDir, `${randomUUID()}.${(ext ?? 'webm').replace(/[^a-z0-9]/gi, '')}`);
        writeFileSync(file, Buffer.from(audioBase64, 'base64'));
        try {
          const text = await transcribe(file);
          manager.capture(text, 'voice', file);
          return send(res, 200, { text, state: manager.state() });
        } catch (e) {
          const status = e instanceof TranscriptionUnavailable ? 501 : 500;
          return send(res, status, { error: String(e instanceof Error ? e.message : e) });
        }
      }
      if (req.method === 'POST' && pathname === '/api/close') {
        const pending = await manager.close();
        return send(res, 200, { pending });
      }
      if (req.method === 'POST' && pathname === '/api/validate') {
        const { approve } = await readJson<{ approve?: number[] }>(req);
        const persisted = await manager.validate(approve ?? []);
        return send(res, 200, { persisted, state: manager.state() });
      }
      return send(res, 404, { error: 'not found' });
    } catch (err) {
      log.error(`request ${pathname} failed: ${String(err)}`);
      return send(res, 500, { error: String(err instanceof Error ? err.message : err) });
    }
  });

  server.listen(config.port, config.host, () => {
    log.info(`web UI @ http://${config.host}:${config.port}`);
  });
}
