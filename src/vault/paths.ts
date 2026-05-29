import { join } from 'node:path';
import { config } from '../config.js';

export const vaultPaths = {
  root: config.vaultPath,
  dbFile: join(config.vaultPath, 'records.db'),
  journalDir: join(config.vaultPath, 'journal'),
  audioDir: join(config.vaultPath, 'audio'),

  /** journal/YYYY/MM/YYYY-MM-DD.md for a given Date */
  journalFileFor(d: Date): string {
    const y = String(d.getFullYear());
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return join(config.vaultPath, 'journal', y, m, `${y}-${m}-${day}.md`);
  },
};
