import { useEffect, useMemo, useState } from 'react';
import { useSettings } from '../store/SettingsContext';
import { useServerStatus } from '../store/ServerStatusContext';
import { useI18n } from '../i18n/I18nContext';
import { modelsForRoute, isRouteModelValid } from '../ai/providers';
import { API_BASE } from '../lib/api';
import type { Route, Model, ApiKeys } from '../lib/types';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select } from './ui/select';
import { Slider } from './ui/slider';

const BROWSER_ROUTES: Route[] = ['anthropic', 'google', 'openai', 'gateway'];

const KEY_FIELD: Record<Route, keyof ApiKeys | null> = {
  anthropic: 'anthropic',
  google: 'google',
  openai: 'openai',
  gateway: 'gateway',
  'claude-cli': null,
};

const KEY_URLS: Partial<Record<Route, string>> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  google: 'https://aistudio.google.com/apikey',
  openai: 'https://platform.openai.com/api-keys',
  gateway: 'https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai-gateway%3FshowCreateKeyModal%26utm_source%3Dai_gateway_landing_page&title=Get+an+API+Key',
};

export const PROVIDER_BATCH_DEFAULTS: Record<Route, number> = {
  google: 5,
  anthropic: 10,
  openai: 10,
  gateway: 50,
  'claude-cli': 2,
};

export function SettingsPanel() {
  const { settings, update, updateApiKeys, reset } = useSettings();
  const { status, probing, refresh } = useServerStatus();
  const { t } = useI18n();
  // The route we switched *to* after finding the saved one unavailable. Data,
  // not the rendered string — computed into text at render time below, so it
  // re-translates live if the language changes while it's on screen.
  const [switchedToRoute, setSwitchedToRoute] = useState<Route | null>(null);

  // Memoized so a fresh array identity doesn't re-fire the fallback effect below
  // on every render.
  const routes = useMemo<Route[]>(() => {
    const served = status.available
      ? [...status.routes, ...(status.claudeCli ? (['claude-cli'] as Route[]) : [])]
      : [];
    // Never empty. A server that serves nothing used to leave this list empty,
    // which made the heal effect below bail and strand the picker on a route
    // nothing can run — one of the two ways into the 400-retry storm. Falling
    // back to the browser routes is right in that state: with the server unable
    // to serve anything, a pasted key is the only way to run at all.
    return served.length > 0 ? served : BROWSER_ROUTES;
  }, [status.available, status.claudeCli, status.routes]);

  // Guard against a persisted route or model the current server can't serve —
  // without this, resolveModelId throws mid-run. Both cases are handled in
  // one effect so they can't race or loop each other: whichever branch
  // applies, the patch it writes is internally consistent (a fallback route
  // is always paired with one of its own valid models), so the next render
  // finds nothing left to fix and the effect goes quiet.
  useEffect(() => {
    if (probing) return;
    if (!routes.includes(settings.route)) {
      const fallback = routes[0];
      const fallbackModels = modelsForRoute(fallback);
      setSwitchedToRoute(fallback);
      update({
        route: fallback,
        model: fallbackModels[0] as Model,
        batchSize: PROVIDER_BATCH_DEFAULTS[fallback],
      });
      return;
    }
    if (!isRouteModelValid(settings.route, settings.model)) {
      const validModels = modelsForRoute(settings.route);
      update({ model: validModels[0] as Model });
    }
  }, [probing, routes, settings.route, settings.model, update]);

  const models = modelsForRoute(settings.route);
  const modelValue = isRouteModelValid(settings.route, settings.model) ? settings.model : (models[0] as Model);
  const keyField = KEY_FIELD[settings.route];
  const switchedNoticeText = switchedToRoute
    ? t('settings.routeUnavailable', { route: t(`route.${switchedToRoute}`) })
    : null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>{t('settings.provider')}</Label>
          <Select
            value={settings.route}
            onChange={(e) => {
              const newRoute = e.target.value as Route;
              const validModels = modelsForRoute(newRoute);
              const nextModel = validModels.includes(settings.model) ? settings.model : (validModels[0] as Model);
              setSwitchedToRoute(null);
              update({
                route: newRoute,
                model: nextModel,
                batchSize: PROVIDER_BATCH_DEFAULTS[newRoute],
              });
            }}
          >
            {routes.map((r) => (
              <option key={r} value={r}>{t(`route.${r}`)}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>{t('settings.model')}</Label>
          <Select
            value={modelValue}
            onChange={(e) => update({ model: e.target.value as Model })}
          >
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </div>
      </div>

      {status.available ? (
        <p className="text-xs text-gray-500">{t('settings.serverManaged', { url: API_BASE })}</p>
      ) : keyField ? (
        <div>
          <div className="flex items-center justify-between gap-2">
            <Label>{t('settings.apiKey', { provider: t(`route.${settings.route}`) })}</Label>
            <a
              href={KEY_URLS[settings.route] ?? '#'}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-blue-600 underline-offset-2 hover:underline"
            >
              {t('settings.getKey')}
            </a>
          </div>
          <Input
            type="password"
            value={settings.apiKeys[keyField]}
            onChange={(e) => updateApiKeys({ [keyField]: e.target.value })}
            placeholder={t('settings.apiKeyPlaceholder')}
          />
          <p className="text-xs text-gray-500 mt-1">
            {t('settings.apiKeyNote')}
          </p>
        </div>
      ) : null}

      {/* The probe runs once, at mount. If the server dies mid-session `status`
          stays stale-true, so the retry link has to be reachable whenever a
          server is configured — not only while we believe it is down. */}
      {API_BASE && !probing && (
        <p className={status.available ? 'text-xs text-gray-500' : 'text-xs text-amber-700'}>
          {!status.available && (
            <>
              {status.reachable
                ? t('settings.serverNoProviders', { url: API_BASE })
                : t('settings.serverOffline', { url: API_BASE })}{' '}
            </>
          )}
          <button type="button" className="underline" onClick={refresh}>
            {t('settings.serverRetry')}
          </button>
        </p>
      )}

      {switchedNoticeText && (
        <p className="text-xs text-amber-700">{switchedNoticeText}</p>
      )}

      <div>
        <Label>{t('settings.batchSize', { n: settings.batchSize })}</Label>
        <Slider
          min={1} max={200} step={1}
          value={settings.batchSize}
          onChange={(e) => update({ batchSize: Number(e.target.value) })}
        />
      </div>

      <button onClick={reset} className="text-sm text-red-600 underline">{t('settings.reset')}</button>
    </div>
  );
}
