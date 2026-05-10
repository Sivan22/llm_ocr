import { describe, it, expect, beforeEach } from 'vitest';
import { appendRun, loadRuns, MAX_RUNS } from './runHistory';
import type { RunRecord } from '../lib/types';

const r = (id: string, ts: number): RunRecord => ({
  id, ts, fileName: 'f.pdf', pagesOk: 1, pagesFailed: 0, route: 'gateway', model: 'gemini-3.1-pro',
});

beforeEach(() => localStorage.clear());

describe('runHistory', () => {
  it('starts empty', () => {
    expect(loadRuns()).toEqual([]);
  });

  it('appends and reloads in newest-first order', () => {
    appendRun(r('a', 1000));
    appendRun(r('b', 2000));
    const runs = loadRuns();
    expect(runs.map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('caps at MAX_RUNS', () => {
    for (let i = 0; i < MAX_RUNS + 5; i++) appendRun(r(String(i), i));
    expect(loadRuns()).toHaveLength(MAX_RUNS);
  });
});
