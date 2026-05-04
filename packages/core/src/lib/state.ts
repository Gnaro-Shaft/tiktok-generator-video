import fs from 'node:fs';
import path from 'node:path';
import { NICHES_DIR } from './config.js';

export interface HistoryEntry {
  ts: string;
  niche: string;
  slot: string;
  date: string;
  topic?: string;
  outFile?: string;
  error?: string;
  action: 'started' | 'success' | 'error';
}

const historyFile = (nicheId: string) =>
  path.join(NICHES_DIR, nicheId, 'state', 'history.jsonl');

export function appendHistory(entry: HistoryEntry): void {
  const file = historyFile(entry.niche);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(entry) + '\n');
}

export function alreadyDoneToday(
  nicheId: string,
  date: string,
  slot: string
): boolean {
  const file = historyFile(nicheId);
  if (!fs.existsSync(file)) return false;
  const lines = fs.readFileSync(file, 'utf-8').trim().split('\n').filter(Boolean);
  return lines.some((l) => {
    try {
      const e = JSON.parse(l) as HistoryEntry;
      return e.date === date && e.slot === slot && e.action === 'success';
    } catch {
      return false;
    }
  });
}

export function todayParis(): string {
  const fmt = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
