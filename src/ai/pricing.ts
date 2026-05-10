import type { Model } from '../lib/types';

export interface Rate {
  inputPerMillion: number;
  outputPerMillion: number;
}

const RATES: Record<Model, Rate> = {
  'claude-opus-4-7':   { inputPerMillion: 15.0, outputPerMillion: 75.0 },
  'claude-sonnet-4-6': { inputPerMillion: 3.0,  outputPerMillion: 15.0 },
  'gemini-3.1-pro':    { inputPerMillion: 1.25, outputPerMillion: 10.0 },
  'gpt-4o':            { inputPerMillion: 2.5,  outputPerMillion: 10.0 },
  'gpt-4o-mini':       { inputPerMillion: 0.15, outputPerMillion: 0.6 },
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
