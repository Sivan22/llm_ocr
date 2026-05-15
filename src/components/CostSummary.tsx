import { useProject } from '../store/ProjectContext';
import { useSettings } from '../store/SettingsContext';
import { useI18n } from '../i18n/I18nContext';
import { estimateCost } from '../ai/pricing';

export function CostSummary() {
  const { pages } = useProject();
  const { settings } = useSettings();
  const { t } = useI18n();
  const totalIn = pages.reduce((n, p) => n + (p.tokensIn ?? 0), 0);
  const totalOut = pages.reduce((n, p) => n + (p.tokensOut ?? 0), 0);
  let cost = 0;
  try { cost = estimateCost(settings.model, { tokensIn: totalIn, tokensOut: totalOut }); }
  catch { cost = 0; }
  const inStr = totalIn.toLocaleString();
  const outStr = totalOut.toLocaleString();
  const costStr = cost.toFixed(4);
  const fullText = t('cost.estimated', { in: inStr, out: outStr, cost: costStr });
  return (
    <div
      className="text-xs text-gray-600 border rounded px-2 py-1 inline-flex items-center whitespace-nowrap"
      title={fullText}
    >
      <span className="hidden md:inline">{fullText}</span>
      <span className="md:hidden">${costStr}</span>
    </div>
  );
}
