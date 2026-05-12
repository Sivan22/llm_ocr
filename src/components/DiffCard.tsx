import type { Correction } from '../lib/types';
import { useI18n } from '../i18n/I18nContext';
import { cn } from '../lib/utils';
import { Button } from './ui/button';

interface Props {
  correction: Correction;
  pageText: string;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onRestore: (id: string) => void;
}

export function DiffCard({ correction, pageText, onAccept, onReject, onRestore }: Props) {
  const { t } = useI18n();

  const cardBg =
    correction.status === 'accepted' ? 'bg-green-50 border-green-300' :
    correction.status === 'rejected' ? 'bg-gray-100 opacity-60 border-gray-300' :
    'bg-white border-gray-300';

  const canRestoreAccepted =
    correction.status !== 'accepted' || pageText.includes(correction.new);

  return (
    <div className={cn('border rounded p-2 text-sm space-y-1', cardBg)}>
      <div dir="rtl" className="font-serif leading-relaxed">
        <span className="bg-red-100 line-through decoration-red-500 px-1 rounded">
          {correction.old}
        </span>
        <span className="mx-1 text-gray-500">⇐</span>
        <span className="bg-green-100 text-green-800 px-1 rounded">
          {correction.new}
        </span>
      </div>
      {correction.reason && <div className="text-xs text-gray-600">{correction.reason}</div>}
      {correction.status === 'pending' && (
        <div className="flex gap-1">
          <Button onClick={() => onAccept(correction.id)} className="h-7 text-xs">{t('fix.accept')}</Button>
          <Button variant="outline" onClick={() => onReject(correction.id)} className="h-7 text-xs">{t('fix.reject')}</Button>
        </div>
      )}
      {correction.status === 'accepted' && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-green-700">{t('fix.accepted')}</span>
          <Button
            variant="outline"
            onClick={() => onRestore(correction.id)}
            className="h-7 text-xs"
            disabled={!canRestoreAccepted}
            title={canRestoreAccepted ? undefined : t('fix.cannotRestore')}
          >
            {t('fix.restore')}
          </Button>
          {!canRestoreAccepted && (
            <span className="text-xs text-gray-500">{t('fix.textChanged')}</span>
          )}
        </div>
      )}
      {correction.status === 'rejected' && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">{t('fix.rejected')}</span>
          <Button
            variant="outline"
            onClick={() => onRestore(correction.id)}
            className="h-7 text-xs"
          >
            {t('fix.restore')}
          </Button>
        </div>
      )}
    </div>
  );
}
