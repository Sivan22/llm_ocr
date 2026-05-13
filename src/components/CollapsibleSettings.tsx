// src/components/CollapsibleSettings.tsx
import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { SettingsPanel } from './SettingsPanel';

const STORAGE_KEY = 'llm_ocr_web:ocrSettingsOpen:v1';

export function CollapsibleSettings() {
  const { t } = useI18n();
  const [open, setOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, open ? '1' : '0'); } catch { /* ignore */ }
  }, [open]);

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
