import { useProject } from '../store/ProjectContext';
import { useSettings } from '../store/SettingsContext';
import { estimateCost } from '../ai/pricing';

export function CostSummary() {
  const { pages } = useProject();
  const { settings } = useSettings();
  const totalIn = pages.reduce((n, p) => n + (p.tokensIn ?? 0), 0);
  const totalOut = pages.reduce((n, p) => n + (p.tokensOut ?? 0), 0);
  let cost = 0;
  try { cost = estimateCost(settings.model, { tokensIn: totalIn, tokensOut: totalOut }); }
  catch { cost = 0; }
  return (
    <div className="text-xs text-gray-600 border rounded p-2 inline-block">
      Estimated: {totalIn.toLocaleString()} in / {totalOut.toLocaleString()} out tokens
      {' — '}<strong>${cost.toFixed(4)}</strong>
    </div>
  );
}
