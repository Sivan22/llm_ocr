export type Route = 'anthropic' | 'google' | 'openai' | 'gateway' | 'claude-cli';

/**
 * Page-image types both the client and the server accept, shared so the two
 * cannot drift apart. All four are accepted as image parts by Anthropic, Google
 * and OpenAI — and DropStrip takes `image/*` and passes the File's own type
 * through verbatim, so a dropped .webp really does arrive as
 * `data:image/webp;base64,...` and browser-direct mode already handles it.
 */
export const IMAGE_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

export type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number];

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
