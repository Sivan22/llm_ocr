import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createGateway, type LanguageModel } from 'ai';
import type { Model, Route } from '../../../shared/ai/types.js';
import { resolveModelId } from '../../../shared/ai/models.js';
import { claudeCliEnv, getClaudeCodeProvider } from './claude-cli.js';

function requireKey(name: string): string {
  const key = (process.env[name] ?? '').trim();
  if (!key) throw new Error(`${name} is not set on the server.`);
  return key;
}

export async function createServerModel(route: Route, model: Model): Promise<LanguageModel> {
  const id = resolveModelId(route, model);
  switch (route) {
    case 'anthropic':
      return createAnthropic({ apiKey: requireKey('ANTHROPIC_API_KEY') })(id);
    case 'google':
      return createGoogleGenerativeAI({ apiKey: requireKey('GOOGLE_GENERATIVE_AI_API_KEY') })(id);
    case 'openai':
      return createOpenAI({ apiKey: requireKey('OPENAI_API_KEY') })(id);
    case 'gateway':
      return createGateway({ apiKey: requireKey('AI_GATEWAY_API_KEY') })(id);
    case 'claude-cli': {
      const claudeCode = await getClaudeCodeProvider();
      return claudeCode(id, {
        effort: 'high',
        tools: [],
        streamingInput: 'always',
        env: claudeCliEnv(),
      });
    }
  }
}
