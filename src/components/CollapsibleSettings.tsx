// src/components/CollapsibleSettings.tsx
import { useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { useSettings } from '../store/SettingsContext';
import { hasApiKey } from '../ai/providers';
import { SettingsPanel } from './SettingsPanel';

export function CollapsibleSettings() {
  const { t } = useI18n();
  const { settings } = useSettings();
  const [open, setOpen] = useState<boolean>(() => !hasApiKey(settings));

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
