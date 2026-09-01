// src/components/CollapsibleSettings.tsx
import { useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { useCanRun } from '../hooks/useCanRun';
import { SettingsPanel } from './SettingsPanel';

export function CollapsibleSettings() {
  const { t } = useI18n();
  // Open on load exactly when a run is impossible — the same gate the Run button
  // uses, so "Settings is open" always means "there is something to fix here".
  const { canRun } = useCanRun();
  const [open, setOpen] = useState<boolean>(() => !canRun);

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="border rounded-md"
    >
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
        {t('settings.toggle')}
      </summary>
      <div className="px-3 py-4 border-t">
        <SettingsPanel />
      </div>
    </details>
  );
}
