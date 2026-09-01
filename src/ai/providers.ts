import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createGateway, type LanguageModel } from 'ai';
import type { Settings } from '../lib/types';

export { isRouteModelValid, resolveModelId, modelsForRoute } from '../../shared/ai/models';
import { resolveModelId } from '../../shared/ai/models';

/**
 * Browser-direct only: is there a pasted key for the selected route?
 *
 * `claude-cli` has no browser-pasteable key — it only ever runs as a server-side
 * subprocess — so browser-direct can never satisfy it. Callers gating the Run
 * button must use `runBlocker`/`canRun` (src/ai/canRun.ts), which consults the
 * server status first and falls back to this only in browser-direct mode.
 */
export function hasApiKey(settings: Settings): boolean {
  if (settings.route === 'claude-cli') return false;
  return settings.apiKeys[settings.route].trim().length > 0;
}

export function createModel(settings: Settings): LanguageModel {
  const id = resolveModelId(settings.route, settings.model);
  switch (settings.route) {
    case 'anthropic': {
      const key = settings.apiKeys.anthropic;
      if (!key) throw new Error('Anthropic API key is required.');
      const provider = createAnthropic({
        apiKey: key,
        headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
      });
      return provider(id);
    }
    case 'google': {
      const key = settings.apiKeys.google;
      if (!key) throw new Error('Google API key is required.');
      return createGoogleGenerativeAI({ apiKey: key })(id);
    }
    case 'openai': {
      const key = settings.apiKeys.openai;
      if (!key) throw new Error('OpenAI API key is required.');
      return createOpenAI({ apiKey: key })(id);
    }
    case 'gateway': {
      const key = settings.apiKeys.gateway;
      if (!key) throw new Error('Gateway API key is required.');
      return createGateway({ apiKey: key })(id);
    }
    case 'claude-cli':
      throw new Error('The Claude CLI route runs on the server. Set VITE_API_URL to use it.');
  }
}
