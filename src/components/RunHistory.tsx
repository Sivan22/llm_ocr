import { useEffect, useState } from 'react';
import { loadRuns } from '../store/runHistory';
import { useI18n } from '../i18n/I18nContext';
import type { RunRecord } from '../lib/types';

export function RunHistory() {
  const { t } = useI18n();
  const [runs, setRuns] = useState<RunRecord[]>([]);
  useEffect(() => { setRuns(loadRuns()); }, []);
  if (runs.length === 0) return <p className="text-sm text-gray-500">{t('history.empty')}</p>;
  return (
    <table className="text-sm w-full">
      <thead className="text-left text-xs text-gray-600">
        <tr>
          <th>{t('history.when')}</th>
          <th>{t('history.file')}</th>
          <th>{t('history.model')}</th>
          <th>{t('history.okFail')}</th>
          <th>{t('history.cost')}</th>
        </tr>
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
