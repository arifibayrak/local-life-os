import { getAccessToken } from './auth.js';

const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export interface CalEvent {
  id: string;
  summary: string;
  start: string | null; // ISO datetime or date
  end: string | null;
  allDay: boolean;
  location: string | null;
  htmlLink: string | null;
}

function mapEvent(e: Record<string, any>): CalEvent {
  const start = e.start?.dateTime ?? e.start?.date ?? null;
  const end = e.end?.dateTime ?? e.end?.date ?? null;
  return {
    id: e.id,
    summary: e.summary ?? '(no title)',
    start, end,
    allDay: !!e.start?.date,
    location: e.location ?? null,
    htmlLink: e.htmlLink ?? null,
  };
}

/** List events between two ISO timestamps (chronological, expanding recurrences). */
export async function listEvents(timeMin: string, timeMax: string): Promise<CalEvent[]> {
  const token = await getAccessToken();
  const url = `${API}?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Calendar list HTTP ${res.status}: ${await res.text().catch(() => '')}`);
  const json = (await res.json()) as { items?: Array<Record<string, any>> };
  return (json.items ?? []).map(mapEvent);
}

export interface NewCalEvent { summary: string; allDay?: boolean; start: string; end?: string; location?: string; description?: string }

/** Create an event. Timed: start/end are ISO datetimes. All-day: start/end are
 *  'YYYY-MM-DD' (end inclusive — Google's end.date is exclusive, handled here). */
export async function createEvent(ev: NewCalEvent): Promise<CalEvent> {
  const token = await getAccessToken();
  let start: Record<string, string>;
  let end: Record<string, string>;
  if (ev.allDay) {
    const startDate = ev.start.slice(0, 10);
    const endIncl = (ev.end || ev.start).slice(0, 10);
    const endExcl = new Date(new Date(`${endIncl}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
    start = { date: startDate };
    end = { date: endExcl };
  } else {
    const startDt = ev.start;
    const endDt = ev.end || new Date(new Date(startDt).getTime() + 3600_000).toISOString();
    start = { dateTime: startDt };
    end = { dateTime: endDt };
  }
  const body = {
    summary: ev.summary,
    location: ev.location || undefined,
    description: ev.description || undefined,
    start,
    end,
  };
  const res = await fetch(API, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Calendar insert HTTP ${res.status}: ${await res.text().catch(() => '')}`);
  return mapEvent((await res.json()) as Record<string, any>);
}
