import type { Correction } from '../lib/types';
import { useI18n } from '../i18n/I18nContext';
import { useProject } from '../store/ProjectContext';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

interface Props {
  correction: Correction;
  pageText: string;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onRestore: (id: string) => void;
}

export function DiffCard({ correction, pageText, onAccept, onReject, onRestore }: Props) {
  const { t } = useI18n();
  const { selectedCid, selectCorrection } = useProject();
  const isSelected = selectedCid === correction.id;

  const cardBg =
    correction.status === 'accepted' ? 'bg-green-50 border-green-300' :
    correction.status === 'rejected' ? 'bg-gray-100 opacity-60 border-gray-300' :
    'bg-white border-gray-300';

  const canRestoreAccepted =
    correction.status !== 'accepted' || pageText.includes(correction.new);

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      onClick={() => selectCorrection(correction.id)}
      className={cn(
        'border rounded p-2 text-sm space-y-1 cursor-pointer transition',
        cardBg,
        isSelected ? 'ring-2 ring-amber-400 border-amber-400' : 'hover:border-gray-400',
      )}
    >
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
        <div className="flex gap-1" onClick={stop}>
          <Button onClick={() => onAccept(correction.id)} className="h-7 text-xs">{t('fix.accept')}</Button>
          <Button variant="outline" onClick={() => onReject(correction.id)} className="h-7 text-xs">{t('fix.reject')}</Button>
        </div>
      )}
      {correction.status === 'accepted' && (
        <div className="flex items-center gap-2" onClick={stop}>
          <span className="text-xs text-green-700">{t('fix.accepted')}</span>
          {canRestoreAccepted ? (
            <Button
              variant="outline"
              onClick={() => onRestore(correction.id)}
              className="h-7 text-xs"
            >
              {t('fix.restore')}
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="inline-flex">
                  <Button
                    variant="outline"
                    className="h-7 text-xs pointer-events-none"
                    disabled
                  >
                    {t('fix.restore')}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{t('fix.cannotRestore')}</TooltipContent>
            </Tooltip>
          )}
          {!canRestoreAccepted && (
            <span className="text-xs text-gray-500">{t('fix.textChanged')}</span>
          )}
        </div>
      )}
      {correction.status === 'rejected' && (
        <div className="flex items-center gap-2" onClick={stop}>
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
