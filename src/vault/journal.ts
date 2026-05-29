import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { vaultPaths } from './paths.js';

/**
 * Append a capture to today's journal markdown, verbatim. The journal is the
 * append-only source of truth; records are derived from it.
 * Returns the journal file path the capture landed in.
 */
export function appendToJournal(text: string, when: Date, kind: 'text' | 'voice'): string {
  const file = vaultPaths.journalFileFor(when);
  mkdirSync(dirname(file), { recursive: true });
  const time = when.toTimeString().slice(0, 5);
  const tag = kind === 'voice' ? ' (voice)' : '';
  appendFileSync(file, `- **${time}**${tag} ${text.trim()}\n`, 'utf8');
  return file;
}
