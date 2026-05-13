import { useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { useBatchRunner } from '../hooks/useBatchRunner';

export function RunLog() {
  const { t } = useI18n();
  const { log } = useBatchRunner();
  const [show, setShow] = useState(false);
  return (
    <div className="text-xs">
      <button className="text-blue-600 underline" onClick={() => setShow((s) => !s)}>
        {show ? t('batch.hideLog', { n: log.length }) : t('batch.showLog', { n: log.length })}
      </button>
      {show && (
        <pre className="bg-gray-50 border p-2 max-h-48 overflow-auto whitespace-pre-wrap mt-1">
          {log.join('\n')}
        </pre>
      )}
    </div>
  );
}
