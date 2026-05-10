import { generateText, type LanguageModel } from 'ai';

export interface OcrResult {
  text: string;
  tokensIn?: number;
  tokensOut?: number;
}

export async function ocrPage(
  model: LanguageModel,
  imageDataUrl: string,
  prompt: string,
  signal?: AbortSignal,
): Promise<OcrResult> {
  const res = await generateText({
    model,
    abortSignal: signal,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', image: imageDataUrl },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });
  return {
    text: res.text ?? '',
    tokensIn: res.usage?.inputTokens,
    tokensOut: res.usage?.outputTokens,
  };
}
