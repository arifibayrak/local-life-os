import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from '../config.js';
import { log } from '../logger.js';
import { vaultPaths } from '../vault/paths.js';
import { llmHealthy, chat, LlmUnavailableError, type ChatMessage } from '../llm/client.js';
import { transcribe, TranscriptionUnavailable } from '../scribe/whisper.js';
import { listRecords, setRecordState, addRecord, listByCategory, updateRecord } from '../vault/records.js';
import { addPayment, addPaymentsBulk, listPayments, deletePayment, updatePayment, analytics, listSubscriptions } from '../finance/store.js';
import { parseStatement, sanitizeCategory } from '../finance/import.js';
import { listContacts, addContact, updateContact, deleteContact, logInteraction, getInteractions } from '../network/store.js';
import { listProjects, projectDetail, linkEntity, unlinkEntity, type LinkKind } from '../projects/store.js';
import { isConnected as gcalConnected, googleConfigured } from '../google/auth.js';
import { listEvents as gcalList, createEvent as gcalCreate } from '../google/calendar.js';
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

async function fetchWeather(lat: number, lon: number): Promise<{ temp: number; code: number } | null> {
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`);
    const j = (await r.json()) as { current?: { temperature_2m: number; weather_code: number } };
    return j.current ? { temp: j.current.temperature_2m, code: j.current.weather_code } : null;
  } catch { return null; }
}
let weatherCache: { at: number; london: unknown; istanbul: unknown } | null = null;
async function today(): Promise<{ date: string; london: unknown; istanbul: unknown }> {
  const date = new Date().toISOString();
  if (!weatherCache || Date.now() - weatherCache.at > 900_000) {
    const [london, istanbul] = await Promise.all([fetchWeather(51.5074, -0.1278), fetchWeather(41.0082, 28.9784)]);
    weatherCache = { at: Date.now(), london, istanbul };
  }
  return { date, london: weatherCache.london, istanbul: weatherCache.istanbul };
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
      // Per-category record modules (Todos, Events, Ideas, Learnings, Routines, Feed)
      if (req.method === 'GET' && ['/todos', '/events', '/ideas', '/learnings', '/routines', '/feed'].includes(pathname)) {
        return send(res, 200, readFileSync(join(PUBLIC, `${pathname.slice(1)}.html`), 'utf8'), 'text/html');
      }
      // Local AI chat (talks to Qwen via MLX — stays on device)
      if (req.method === 'POST' && pathname === '/api/chat') {
        const { messages } = await readJson<{ messages?: ChatMessage[] }>(req);
        if (!messages?.length) return send(res, 400, { error: 'messages required' });
        try {
          const reply = await chat(messages, { maxTokens: 800 });
          return send(res, 200, { reply });
        } catch (e) {
          const status = e instanceof LlmUnavailableError ? 503 : 500;
          return send(res, status, { error: String(e instanceof Error ? e.message : e) });
        }
      }
      // Today + weather (the only outbound call: city coordinates to open-meteo, no personal data)
      if (req.method === 'GET' && pathname === '/api/today') {
        return send(res, 200, await today());
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

      // ---- Projects hub ----
      if (req.method === 'GET' && pathname === '/projects') {
        return send(res, 200, readFileSync(join(PUBLIC, 'projects.html'), 'utf8'), 'text/html');
      }
      if (req.method === 'GET' && pathname === '/api/projects') {
        return send(res, 200, { projects: listProjects(db) });
      }
      if (req.method === 'GET' && pathname === '/api/projects/detail') {
        const id = url.searchParams.get('id');
        if (!id) return send(res, 400, { error: 'id required' });
        return send(res, 200, projectDetail(db, id));
      }
      if (req.method === 'POST' && pathname === '/api/projects/link') {
        const { projectId, kind, refId } = await readJson<{ projectId?: string; kind?: LinkKind; refId?: string }>(req);
        if (!projectId || !kind || !refId) return send(res, 400, { error: 'projectId, kind, refId required' });
        return send(res, 200, { ok: linkEntity(db, projectId, kind, refId) });
      }
      if (req.method === 'POST' && pathname === '/api/projects/unlink') {
        const { projectId, kind, refId } = await readJson<{ projectId?: string; kind?: LinkKind; refId?: string }>(req);
        if (!projectId || !kind || !refId) return send(res, 400, { error: 'projectId, kind, refId required' });
        return send(res, 200, { ok: unlinkEntity(db, projectId, kind, refId) });
      }

      // ---- Google Calendar (cloud-connected, opt-in) ----
      if (req.method === 'GET' && pathname === '/calendar') {
        return send(res, 200, readFileSync(join(PUBLIC, 'calendar.html'), 'utf8'), 'text/html');
      }
      if (req.method === 'GET' && pathname === '/api/calendar/status') {
        return send(res, 200, { configured: googleConfigured(), connected: gcalConnected() });
      }
      if (req.method === 'GET' && pathname === '/api/calendar/events') {
        const from = url.searchParams.get('from'); const to = url.searchParams.get('to');
        if (!from || !to) return send(res, 400, { error: 'from and to required' });
        try { return send(res, 200, { events: await gcalList(from, to) }); }
        catch (e) { return send(res, 503, { error: String(e instanceof Error ? e.message : e) }); }
      }
      if (req.method === 'POST' && pathname === '/api/calendar/events') {
        const body = await readJson<{ summary?: string; start?: string }>(req);
        if (!body.summary || !body.start) return send(res, 400, { error: 'summary and start required' });
        try { return send(res, 200, { event: await gcalCreate(body as { summary: string; start: string }) }); }
        catch (e) { return send(res, 503, { error: String(e instanceof Error ? e.message : e) }); }
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
