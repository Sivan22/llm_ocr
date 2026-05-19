import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createGateway, type LanguageModel } from 'ai';
import type { Model, Route, Settings } from '../lib/types';

const DIRECT_MODEL_ID: Record<Route, Partial<Record<Model, string>>> = {
  anthropic: {
    'claude-opus-4-7':   'claude-opus-4-7',
    'claude-sonnet-4-6': 'claude-sonnet-4-6',
  },
  google: {
    'gemini-3.1-pro':        'gemini-3.1-pro-preview',
    'gemini-3.1-flash-lite': 'gemini-3.1-flash-lite-preview',
    'gemini-2.5-flash':      'gemini-2.5-flash',
  },
  openai: {
    'gpt-4o':      'gpt-4o',
    'gpt-4o-mini': 'gpt-4o-mini',
  },
  gateway: {
    'claude-opus-4-7':   'anthropic/claude-opus-4-7',
    'claude-sonnet-4-6': 'anthropic/claude-sonnet-4-6',
    'gemini-3.1-pro':    'google/gemini-3.1-pro-preview',
    'gpt-4o':            'openai/gpt-4o',
    'gpt-4o-mini':       'openai/gpt-4o-mini',
  },
};

export function isRouteModelValid(route: Route, model: Model): boolean {
  return DIRECT_MODEL_ID[route]?.[model] !== undefined;
}

export function resolveModelId(route: Route, model: Model): string {
  const id = DIRECT_MODEL_ID[route]?.[model];
  if (!id) throw new Error(`Model "${model}" is not available on route "${route}".`);
  return id;
}

export function modelsForRoute(route: Route): Model[] {
  return Object.keys(DIRECT_MODEL_ID[route] ?? {}) as Model[];
}

export function hasApiKey(settings: Settings): boolean {
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
  }
}
