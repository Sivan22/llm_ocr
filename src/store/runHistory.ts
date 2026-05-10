import type { RunRecord } from '../lib/types';

const STORAGE_KEY = 'llm_ocr_web:runHistory:v1';
export const MAX_RUNS = 20;

export function loadRuns(): RunRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as RunRecord[];
  } catch {
    return [];
  }
}

export function appendRun(record: RunRecord): void {
  const runs = loadRuns();
  runs.unshift(record);
  if (runs.length > MAX_RUNS) runs.length = MAX_RUNS;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
  } catch {
    // ignore quota errors
  }
}

export function clearRuns(): void {
  localStorage.removeItem(STORAGE_KEY);
}
