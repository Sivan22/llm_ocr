import type { Model } from './types';

export interface Rate {
  inputPerMillion: number;
  outputPerMillion: number;
}

const RATES: Record<Model, Rate> = {
  'claude-fable-5':    { inputPerMillion: 10.0, outputPerMillion: 50.0 },
  'claude-opus-4-8':   { inputPerMillion: 5.0,  outputPerMillion: 25.0 },
  'claude-sonnet-5':   { inputPerMillion: 3.0,  outputPerMillion: 15.0 },
  'gemini-3.1-pro':        { inputPerMillion: 2.0,  outputPerMillion: 12.0 },
  'gemini-3.1-flash-lite': { inputPerMillion: 0.25, outputPerMillion: 1.5 },
  'gemini-3.5-flash':      { inputPerMillion: 1.5,  outputPerMillion: 9.0 },
  'gemini-2.5-flash':      { inputPerMillion: 0.3,  outputPerMillion: 2.5 },
  'gpt-4o':            { inputPerMillion: 2.5,  outputPerMillion: 10.0 },
  'gpt-4o-mini':       { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  'cli-opus':   { inputPerMillion: 0, outputPerMillion: 0 },
  'cli-sonnet': { inputPerMillion: 0, outputPerMillion: 0 },
  'cli-haiku':  { inputPerMillion: 0, outputPerMillion: 0 },
  'cli-fable':  { inputPerMillion: 0, outputPerMillion: 0 },
};

export function rateFor(model: Model): Rate {
  const r = RATES[model];
  if (!r) throw new Error(`No pricing for model "${model}"`);
  return r;
}

export function estimateCost(model: Model, usage: { tokensIn: number; tokensOut: number }): number {
  const r = rateFor(model);
  return (usage.tokensIn / 1_000_000) * r.inputPerMillion +
         (usage.tokensOut / 1_000_000) * r.outputPerMillion;
}
