import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { saveRunLog, loadRunLog, deleteRunLog } from './runLogStore';

const A = 'aaaa-log';
const B = 'bbbb-log';

beforeEach(async () => {
  await deleteRunLog(A);
  await deleteRunLog(B);
});

describe('runLogStore', () => {
  it('returns [] when no log was saved', async () => {
    expect(await loadRunLog(A)).toEqual([]);
  });

  it('saves and reloads a log', async () => {
    await saveRunLog(A, ['line 1', 'line 2']);
    expect(await loadRunLog(A)).toEqual(['line 1', 'line 2']);
  });

  it('overwrites on resave', async () => {
    await saveRunLog(A, ['old']);
    await saveRunLog(A, ['new1', 'new2']);
    expect(await loadRunLog(A)).toEqual(['new1', 'new2']);
  });

  it('isolates logs by fileHash', async () => {
    await saveRunLog(A, ['A line']);
    await saveRunLog(B, ['B line']);
    expect(await loadRunLog(A)).toEqual(['A line']);
    expect(await loadRunLog(B)).toEqual(['B line']);
  });

  it('deleteRunLog removes the entry', async () => {
    await saveRunLog(A, ['x']);
    await deleteRunLog(A);
    expect(await loadRunLog(A)).toEqual([]);
  });
});
