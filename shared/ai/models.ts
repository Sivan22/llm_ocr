import type { Model, Route } from './types';

const DIRECT_MODEL_ID: Record<Route, Partial<Record<Model, string>>> = {
  anthropic: {
    'claude-fable-5':    'claude-fable-5',
    'claude-opus-4-8':   'claude-opus-4-8',
    'claude-sonnet-5':   'claude-sonnet-5',
  },
  google: {
    'gemini-3.1-pro':        'gemini-3.1-pro-preview',
    'gemini-3.1-flash-lite': 'gemini-3.1-flash-lite-preview',
    'gemini-3.5-flash':      'gemini-3.5-flash',
    'gemini-2.5-flash':      'gemini-2.5-flash',
  },
  openai: {
    'gpt-4o':      'gpt-4o',
    'gpt-4o-mini': 'gpt-4o-mini',
  },
  gateway: {
    'claude-fable-5':    'anthropic/claude-fable-5',
    'claude-opus-4-8':   'anthropic/claude-opus-4-8',
    'claude-sonnet-5':   'anthropic/claude-sonnet-5',
    'gemini-3.1-pro':    'google/gemini-3.1-pro-preview',
    'gemini-3.5-flash':  'google/gemini-3.5-flash',
    'gpt-4o':            'openai/gpt-4o',
    'gpt-4o-mini':       'openai/gpt-4o-mini',
  },
  // The CLI provider validates 'opus' | 'sonnet' | 'haiku' against its alias
  // list; 'fable' is accepted as a custom model string, the same way
  // Mugah/server/src/lib/ai-model.ts passes it for high-accuracy runs.
  'claude-cli': {
    'cli-opus':   'opus',
    'cli-sonnet': 'sonnet',
    'cli-haiku':  'haiku',
    'cli-fable':  'fable',
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
