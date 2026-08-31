export type Route = 'anthropic' | 'google' | 'openai' | 'gateway' | 'claude-cli';

export type Model =
  | 'claude-fable-5'
  | 'claude-opus-4-8'
  | 'claude-sonnet-5'
  | 'gemini-3.1-pro'
  | 'gemini-3.1-flash-lite'
  | 'gemini-3.5-flash'
  | 'gemini-2.5-flash'
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'cli-opus'
  | 'cli-sonnet'
  | 'cli-haiku'
  | 'cli-fable';

export interface Correction {
  id: string;
  old: string;
  new: string;
  reason: string;
  status: 'pending' | 'accepted' | 'rejected';
}
