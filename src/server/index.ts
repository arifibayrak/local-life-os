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
import { listRecords, setRecordState, addRecord, listByCategory, updateRecord } from '../vault/records.js';
import { addPayment, addPaymentsBulk, listPayments, deletePayment, updatePayment, analytics, listSubscriptions } from '../finance/store.js';
import { parseStatement, sanitizeCategory } from '../finance/import.js';
import { listContacts, addContact, updateContact, deleteContact, logInteraction, getInteractions } from '../network/store.js';
import type { DB } from '../vault/db.js';
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

export function startServer(manager: SessionManager, db: DB): void {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${config.host}:${config.port}`);
    const { pathname } = url;
    try {
      // Static assets (css/js) from public/ — name-only, no path traversal.
      const asset = pathname.match(/^\/([\w.-]+)\.(css|js)$/);
      if (req.method === 'GET' && asset) {
        const type = asset[2] === 'css' ? 'text/css' : 'text/javascript';
        try {
          return send(res, 200, readFileSync(join(PUBLIC, `${asset[1]}.${asset[2]}`), 'utf8'), type);
        } catch {
          return send(res, 404, { error: 'not found' });
        }
      }
      if (req.method === 'GET' && pathname === '/') {
        return send(res, 200, readFileSync(join(PUBLIC, 'index.html'), 'utf8'), 'text/html');
      }
      if (req.method === 'GET' && pathname === '/dashboard') {
        return send(res, 200, readFileSync(join(PUBLIC, 'dashboard.html'), 'utf8'), 'text/html');
      }
      if (req.method === 'GET' && pathname === '/api/records') {
        const includeArchived = url.searchParams.get('archived') === '1';
        return send(res, 200, { groups: listRecords(db, { includeArchived }) });
      }
      if (req.method === 'POST' && pathname === '/api/records/state') {
        const { id, state } = await readJson<{ id?: string; state?: string }>(req);
        const allowed = ['active', 'doing', 'done', 'archived', 'snoozed', 'dismissed'];
        if (!id || !state || !allowed.includes(state)) return send(res, 400, { error: 'bad id/state' });
        return send(res, 200, { ok: setRecordState(db, id, state) });
      }
      // Per-category record modules (Todos, Events, Ideas, …)
      if (req.method === 'GET' && (pathname === '/todos' || pathname === '/events' || pathname === '/ideas')) {
        return send(res, 200, readFileSync(join(PUBLIC, `${pathname.slice(1)}.html`), 'utf8'), 'text/html');
      }
      if (req.method === 'GET' && pathname === '/api/records/by') {
        const category = url.searchParams.get('category');
        if (!category) return send(res, 400, { error: 'category required' });
        const includeArchived = url.searchParams.get('archived') === '1';
        return send(res, 200, { records: listByCategory(db, category, { includeArchived }) });
      }
      if (req.method === 'POST' && pathname === '/api/records/add') {
        const body = await readJson<{ category?: string; headline?: string }>(req);
        if (!body.category || !body.headline?.trim()) return send(res, 400, { error: 'category and headline required' });
        return send(res, 200, { id: addRecord(db, body as { category: string; headline: string }) });
      }
      if (req.method === 'POST' && pathname === '/api/records/update') {
        const { id, ...patch } = await readJson<{ id?: string }>(req);
        if (!id) return send(res, 400, { error: 'id required' });
        return send(res, 200, { ok: updateRecord(db, id, patch) });
      }

      // ---- Finance + Subscriptions ----
      if (req.method === 'GET' && pathname === '/finance') {
        return send(res, 200, readFileSync(join(PUBLIC, 'finance.html'), 'utf8'), 'text/html');
      }
      if (req.method === 'GET' && pathname === '/api/finance') {
        const month = url.searchParams.get('month') ?? undefined;
        const category = url.searchParams.get('category') ?? undefined;
        return send(res, 200, { payments: listPayments(db, { month, category }) });
      }
      if (req.method === 'POST' && pathname === '/api/finance') {
        const body = await readJson<{ amount?: number; date?: string }>(req);
        if (!body.amount || !body.date) return send(res, 400, { error: 'amount and date required' });
        return send(res, 200, { payment: addPayment(db, body as { amount: number; date: string }) });
      }
      if (req.method === 'POST' && pathname === '/api/finance/delete') {
        const { id } = await readJson<{ id?: string }>(req);
        if (!id) return send(res, 400, { error: 'id required' });
        return send(res, 200, { ok: deletePayment(db, id) });
      }
      if (req.method === 'POST' && pathname === '/api/finance/update') {
        const { id, ...patch } = await readJson<{ id?: string }>(req);
        if (!id) return send(res, 400, { error: 'id required' });
        const updated = updatePayment(db, id, patch);
        return updated ? send(res, 200, { payment: updated }) : send(res, 404, { error: 'not found' });
      }
      if (req.method === 'GET' && pathname === '/api/finance/analytics') {
        const period = (url.searchParams.get('period') ?? 'month') as 'day' | 'week' | 'month';
        const currency = url.searchParams.get('currency') ?? 'GBP';
        return send(res, 200, analytics(db, period, currency));
      }
      if (req.method === 'GET' && pathname === '/api/finance/subscriptions') {
        return send(res, 200, listSubscriptions(db));
      }
      if (req.method === 'POST' && pathname === '/api/finance/import') {
        const { filename, base64 } = await readJson<{ filename?: string; base64?: string }>(req);
        if (!base64) return send(res, 400, { error: 'no file' });
        const { rows, detected } = parseStatement(Buffer.from(base64, 'base64'), filename ?? 'upload.csv');
        return send(res, 200, { rows, detected, count: rows.length });
      }
      if (req.method === 'POST' && pathname === '/api/finance/import/commit') {
        const { rows } = await readJson<{ rows?: Array<{ amount: number; date: string; category?: string }> }>(req);
        if (!rows?.length) return send(res, 400, { error: 'no rows' });
        const clean = rows.map((r) => ({ ...r, category: sanitizeCategory(r.category) }));
        return send(res, 200, { inserted: addPaymentsBulk(db, clean) });
      }

      // ---- Network ----
      if (req.method === 'GET' && pathname === '/network') {
        return send(res, 200, readFileSync(join(PUBLIC, 'network.html'), 'utf8'), 'text/html');
      }
      if (req.method === 'GET' && pathname === '/api/contacts') {
        return send(res, 200, { groups: listContacts(db) });
      }
      if (req.method === 'GET' && pathname === '/api/contacts/interactions') {
        const id = url.searchParams.get('id');
        if (!id) return send(res, 400, { error: 'id required' });
        return send(res, 200, { interactions: getInteractions(db, id) });
      }
      if (req.method === 'POST' && pathname === '/api/contacts') {
        const body = await readJson<{ name?: string }>(req);
        if (!body.name?.trim()) return send(res, 400, { error: 'name required' });
        return send(res, 200, { contact: addContact(db, body as { name: string }) });
      }
      if (req.method === 'POST' && pathname === '/api/contacts/update') {
        const { id, ...patch } = await readJson<{ id?: string; name?: string }>(req);
        if (!id) return send(res, 400, { error: 'id required' });
        const updated = updateContact(db, id, patch as { name: string });
        return updated ? send(res, 200, { contact: updated }) : send(res, 404, { error: 'not found' });
      }
      if (req.method === 'POST' && pathname === '/api/contacts/delete') {
        const { id } = await readJson<{ id?: string }>(req);
        if (!id) return send(res, 400, { error: 'id required' });
        return send(res, 200, { ok: deleteContact(db, id) });
      }
      if (req.method === 'POST' && pathname === '/api/contacts/interaction') {
        const { id, type, note, date } = await readJson<{ id?: string; type?: string; note?: string; date?: string }>(req);
        if (!id) return send(res, 400, { error: 'id required' });
        return send(res, 200, { ok: logInteraction(db, id, type ?? 'other', note ?? '', date) });
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
