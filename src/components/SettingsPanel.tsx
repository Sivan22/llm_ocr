import { useSettings } from '../store/SettingsContext';
import { useI18n } from '../i18n/I18nContext';
import { modelsForRoute } from '../ai/providers';
import type { Route, Model, ApiKeys } from '../lib/types';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select } from './ui/select';
import { Slider } from './ui/slider';
import { PromptEditor } from './PromptEditor';

const ROUTES: Route[] = ['anthropic', 'google', 'openai', 'gateway'];

const KEY_FIELD: Record<Route, keyof ApiKeys> = {
  anthropic: 'anthropic',
  google: 'google',
  openai: 'openai',
  gateway: 'gateway',
};

export function SettingsPanel() {
  const { settings, update, updateApiKeys, updatePrompts, reset } = useSettings();
  const { t } = useI18n();
  const models = modelsForRoute(settings.route);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>{t('settings.provider')}</Label>
          <Select
            value={settings.route}
            onChange={(e) => {
              const newRoute = e.target.value as Route;
              const validModels = modelsForRoute(newRoute);
              const nextModel = validModels.includes(settings.model) ? settings.model : (validModels[0] as Model);
              update({ route: newRoute, model: nextModel });
            }}
          >
            {ROUTES.map((r) => (
              <option key={r} value={r}>{t(`route.${r}`)}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>{t('settings.model')}</Label>
          <Select
            value={settings.model}
            onChange={(e) => update({ model: e.target.value as Model })}
          >
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </div>
      </div>

      <div>
        <Label>{t('settings.apiKey', { provider: t(`route.${settings.route}`) })}</Label>
        <Input
          type="password"
          value={settings.apiKeys[KEY_FIELD[settings.route]]}
          onChange={(e) => updateApiKeys({ [KEY_FIELD[settings.route]]: e.target.value })}
          placeholder={t('settings.apiKeyPlaceholder')}
        />
        <p className="text-xs text-gray-500 mt-1">
          {t('settings.apiKeyNote')}
        </p>
      </div>

      <div>
        <Label>{t('settings.batchSize', { n: settings.batchSize })}</Label>
        <Slider
          min={1} max={50} step={1}
          value={settings.batchSize}
          onChange={(e) => update({ batchSize: Number(e.target.value) })}
        />
      </div>

      <PromptEditor label={t('settings.ocrPrompt')} value={settings.prompts.ocr} onChange={(v) => updatePrompts({ ocr: v })} rows={5} />

      <p className="text-xs text-gray-500">
        {t('settings.correctionNote')}
      </p>

      <button onClick={reset} className="text-sm text-red-600 underline">{t('settings.reset')}</button>
    </div>
  );
}
