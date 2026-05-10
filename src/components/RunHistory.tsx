import { useEffect, useState } from 'react';
import { loadRuns } from '../store/runHistory';
import type { RunRecord } from '../lib/types';

export function RunHistory() {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  useEffect(() => { setRuns(loadRuns()); }, []);
  if (runs.length === 0) return <p className="text-sm text-gray-500">No runs yet.</p>;
  return (
    <table className="text-sm w-full">
      <thead className="text-left text-xs text-gray-600">
        <tr><th>When</th><th>File</th><th>Model</th><th>OK / Fail</th><th>Cost</th></tr>
      </thead>
      <tbody>
        {runs.map((r) => (
          <tr key={r.id} className="border-t">
            <td>{new Date(r.ts).toLocaleString()}</td>
            <td className="truncate max-w-[180px]">{r.fileName}</td>
            <td>{r.model}</td>
            <td>{r.pagesOk}/{r.pagesFailed}</td>
            <td>{r.costUsd ? `$${r.costUsd.toFixed(4)}` : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
