import type { Correction } from '../lib/types';
import { charDiff } from '../lib/diff';
import { cn } from '../lib/utils';
import { Button } from './ui/button';

interface Props {
  correction: Correction;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
}

export function DiffCard({ correction, onAccept, onReject }: Props) {
  const parts = charDiff(correction.old, correction.new);

  const cardBg =
    correction.status === 'accepted' ? 'bg-green-50 border-green-300' :
    correction.status === 'rejected' ? 'bg-gray-100 opacity-60 border-gray-300' :
    'bg-white border-gray-300';

  return (
    <div className={cn('border rounded p-2 text-sm space-y-1', cardBg)}>
      <div dir="rtl" className="font-serif">
        {parts.map((p, i) => (
          <span key={i} className={
            p.kind === 'add' ? 'bg-green-200 underline' :
            p.kind === 'del' ? 'bg-red-200 line-through' :
            ''
          }>{p.text}</span>
        ))}
      </div>
      {correction.reason && <div className="text-xs text-gray-600">{correction.reason}</div>}
      {correction.status === 'pending' && (
        <div className="flex gap-1">
          <Button onClick={() => onAccept(correction.id)} className="h-7 text-xs">Accept</Button>
          <Button variant="outline" onClick={() => onReject(correction.id)} className="h-7 text-xs">Reject</Button>
        </div>
      )}
    </div>
  );
}
