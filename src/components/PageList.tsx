import { useProject } from '../store/ProjectContext';
import type { Status } from '../lib/types';
import { cn } from '../lib/utils';

const STATUS_BG: Record<Status, string> = {
  pending: 'bg-gray-200 text-gray-700',
  running: 'bg-blue-200 text-blue-900 animate-pulse',
  ok:      'bg-green-200 text-green-900',
  error:   'bg-red-200 text-red-900',
  edited:  'bg-amber-200 text-amber-900',
};

export function PageList() {
  const { pages, currentPageNum, selectedPages, togglePageSelected } = useProject();
  if (pages.length === 0) return null;
  return (
    <div className="border rounded p-2 max-h-96 overflow-auto">
      <div className="text-xs text-gray-500 mb-1">
        Click a chip to add/remove it from the run selection.
      </div>
      <div className="grid grid-cols-10 gap-1">
        {pages.map((p) => {
          const isSelected = selectedPages.has(p.pageNum);
          const isViewing = currentPageNum === p.pageNum;
          return (
            <button
              key={p.pageNum}
              onClick={() => togglePageSelected(p.pageNum)}
              title={p.error ?? p.status}
              className={cn(
                'text-xs rounded px-1 py-0.5 font-mono',
                STATUS_BG[p.status],
                isSelected && 'ring-2 ring-blue-600 font-bold',
                isViewing && !isSelected && 'ring-1 ring-gray-400',
              )}
            >
              {p.pageNum + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}
