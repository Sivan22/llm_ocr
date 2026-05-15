import { useEffect, useState } from 'react';
import { listJobs, deleteJob, type JobRecord } from '../store/jobs';
import { reloadJob } from '../store/reloadJob';
import { useProject } from '../store/ProjectContext';
import { useI18n } from '../i18n/I18nContext';
import { Button } from './ui/button';

interface Props {
  onOpened: () => void;
}

export function JobsList({ onOpened }: Props) {
  const { t } = useI18n();
  const { setProject, resetProject, fileHash: openHash } = useProject();
  const [rows, setRows] = useState<JobRecord[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = () => { listJobs().then(setRows); };
  useEffect(() => { refresh(); }, []);

  const onReload = async (hash: string) => {
    setBusy(hash); setErr(null);
    try {
      const out = await reloadJob(hash);
      if (!out) throw new Error('job not found');
      setProject({ doc: out.doc, fileHash: out.fileHash, fileName: out.fileName, restored: out.restored, pageOrder: out.pageOrder });
      onOpened();
    } catch (e) {
      setErr(t('jobs.reloadFailed', { msg: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const onDelete = async (row: JobRecord) => {
    if (!window.confirm(t('jobs.confirmDelete', { name: row.fileName }))) return;
    await deleteJob(row.fileHash);
    if (openHash === row.fileHash) resetProject();
    refresh();
  };

  if (rows.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-gray-500">{t('jobs.privacyNote')}</p>
        <p className="text-sm text-gray-500">{t('jobs.empty')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">{t('jobs.privacyNote')}</p>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="-mx-3 sm:mx-0 overflow-x-auto">
        <table className="text-sm w-full min-w-[480px]">
          <thead className="text-left text-xs text-gray-600">
            <tr>
              <th className="px-3 sm:px-2 py-1">{t('jobs.file')}</th>
              <th className="px-2 py-1">{t('jobs.pages')}</th>
              <th className="px-2 py-1">{t('jobs.lastOpened')}</th>
              <th className="px-3 sm:px-2 py-1">{t('jobs.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.fileHash} className="border-t align-middle">
                <td className="truncate max-w-[180px] sm:max-w-[260px] px-3 sm:px-2 py-1">{r.fileName}</td>
                <td className="px-2 py-1">{r.pageCount}</td>
                <td className="px-2 py-1 whitespace-nowrap">{new Date(r.lastOpenedAt).toLocaleString()}</td>
                <td className="px-3 sm:px-2 py-1">
                  <div className="flex gap-1">
                    <Button
                      className="text-xs h-7"
                      disabled={busy === r.fileHash}
                      onClick={() => onReload(r.fileHash)}
                    >
                      {t('jobs.reload')}
                    </Button>
                    <Button
                      variant="outline"
                      className="text-xs h-7"
                      disabled={busy === r.fileHash}
                      onClick={() => onDelete(r)}
                    >
                      {t('jobs.delete')}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
