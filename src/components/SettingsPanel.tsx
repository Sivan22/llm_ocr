import { useSettings } from '../store/SettingsContext';
import { modelsForRoute } from '../ai/providers';
import type { Route, Model, ApiKeys } from '../lib/types';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select } from './ui/select';
import { Slider } from './ui/slider';
import { PromptEditor } from './PromptEditor';

const ROUTE_LABEL: Record<Route, string> = {
  anthropic: 'Anthropic (direct)',
  google: 'Google (direct)',
  openai: 'OpenAI (direct)',
  gateway: 'Vercel AI Gateway',
};

const KEY_FIELD: Record<Route, keyof ApiKeys> = {
  anthropic: 'anthropic',
  google: 'google',
  openai: 'openai',
  gateway: 'gateway',
};

export function SettingsPanel() {
  const { settings, update, updateApiKeys, updatePrompts, reset } = useSettings();
  const models = modelsForRoute(settings.route);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Provider</Label>
          <Select
            value={settings.route}
            onChange={(e) => {
              const newRoute = e.target.value as Route;
              const validModels = modelsForRoute(newRoute);
              const nextModel = validModels.includes(settings.model) ? settings.model : (validModels[0] as Model);
              update({ route: newRoute, model: nextModel });
            }}
          >
            {(Object.keys(ROUTE_LABEL) as Route[]).map((r) => (
              <option key={r} value={r}>{ROUTE_LABEL[r]}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Model</Label>
          <Select
            value={settings.model}
            onChange={(e) => update({ model: e.target.value as Model })}
          >
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </div>
      </div>

      <div>
        <Label>API Key — {ROUTE_LABEL[settings.route]}</Label>
        <Input
          type="password"
          value={settings.apiKeys[KEY_FIELD[settings.route]]}
          onChange={(e) => updateApiKeys({ [KEY_FIELD[settings.route]]: e.target.value })}
          placeholder="paste your key here"
        />
        <p className="text-xs text-gray-500 mt-1">
          Stored in your browser's localStorage only. Never sent to a server.
        </p>
      </div>

      <div>
        <Label>Batch Size — {settings.batchSize} pages in parallel</Label>
        <Slider
          min={1} max={50} step={1}
          value={settings.batchSize}
          onChange={(e) => update({ batchSize: Number(e.target.value) })}
        />
      </div>

      <PromptEditor label="OCR Prompt" value={settings.prompts.ocr} onChange={(v) => updatePrompts({ ocr: v })} rows={5} />
      <PromptEditor label="Fix: General" value={settings.prompts.general} onChange={(v) => updatePrompts({ general: v })} placeholderHint="{text}" />
      <PromptEditor label="Fix: Headers" value={settings.prompts.headers} onChange={(v) => updatePrompts({ headers: v })} placeholderHint="{text}" />
      <PromptEditor label="Fix: Punctuation" value={settings.prompts.punctuation} onChange={(v) => updatePrompts({ punctuation: v })} placeholderHint="{text}" />
      <PromptEditor label="Fix: Custom" value={settings.prompts.custom} onChange={(v) => updatePrompts({ custom: v })} placeholderHint="{text}" />

      <button onClick={reset} className="text-sm text-red-600 underline">Reset all settings to defaults</button>
    </div>
  );
}
