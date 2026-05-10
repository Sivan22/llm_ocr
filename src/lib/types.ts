export type Route = 'anthropic' | 'google' | 'openai' | 'gateway';

export type Model =
  | 'claude-opus-4-7'
  | 'claude-sonnet-4-6'
  | 'gemini-3.1-pro'
  | 'gpt-4o'
  | 'gpt-4o-mini';

export type Status = 'pending' | 'running' | 'ok' | 'error' | 'edited';

export type FixMode = 'general' | 'headers' | 'punctuation' | 'custom';

export interface PageResult {
  pageNum: number;        // 0-indexed
  text: string;
  status: Status;
  error?: string;
  tokensIn?: number;
  tokensOut?: number;
}

export interface Correction {
  id: string;
  old: string;
  new: string;
  reason: string;
  status: 'pending' | 'accepted' | 'rejected';
}

export interface ApiKeys {
  anthropic: string;
  google: string;
  openai: string;
  gateway: string;
}

export interface Settings {
  version: 1;
  route: Route;
  model: Model;
  apiKeys: ApiKeys;
  batchSize: number;
  prompts: {
    ocr: string;
    general: string;
    headers: string;
    punctuation: string;
    custom: string;
  };
}

export interface RunRecord {
  id: string;
  ts: number;
  fileName: string;
  pagesOk: number;
  pagesFailed: number;
  route: Route;
  model: Model;
  costUsd?: number;
}
