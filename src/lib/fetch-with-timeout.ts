const DEFAULT_TIMEOUT = 120000; // 2 minutes default
const LONG_TIMEOUT = 800000; // ~13 minutes for AI operations

export interface FetchWithTimeoutOptions extends RequestInit {
  timeout?: number;
}

/**
 * Combines a caller-supplied signal with our own timeout controller's signal so
 * neither one silently discards the other. Prefers the standard `AbortSignal.any`;
 * falls back to forwarding the caller's abort onto `controller` for environments
 * that predate it (older browsers — Node 20+ and current browsers have it).
 */
function combineSignals(
  callerSignal: AbortSignal | null | undefined,
  controller: AbortController
): AbortSignal {
  if (!callerSignal) return controller.signal;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([callerSignal, controller.signal]);
  }
  if (callerSignal.aborted) {
    controller.abort();
  } else {
    callerSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return controller.signal;
}

/**
 * Intentionally diverges from Mugah/client/src/lib/fetch-with-timeout.ts, which this
 * file is otherwise a copy of: that version always overwrites any caller-supplied
 * `signal` with its own internal timeout controller's signal, so a caller's abort
 * never reaches `fetch`. Mugah gets away with that because its only cancellable path
 * (pdf-proofread/api/run.ts) calls plain `fetch` directly and never routes a caller
 * signal through this helper. llm_ocr does — a Stop button's AbortController flows
 * through here via ocrPageViaServer/correctPageViaServer — so the two signals are
 * composed instead of one clobbering the other. Do not "fix" this back to match Mugah.
 */
export async function fetchWithTimeout(
  url: string,
  options: FetchWithTimeoutOptions = {}
): Promise<Response> {
  const { timeout = DEFAULT_TIMEOUT, signal: callerSignal, ...fetchOptions } = options;

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeout);

  const signal = combineSignals(callerSignal, controller);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal,
    });
    return response;
  } catch (error) {
    // `fetch`'s abort rejection is a DOMException, not a plain Error — and unlike
    // Node's native fetch, jsdom's DOMException does not extend Error, so checking
    // `instanceof Error` alone misses it under `npm test`. Accept either.
    const isAbort =
      (error instanceof DOMException || error instanceof Error) && error.name === "AbortError";
    // Only our own timeout controller firing gets rewritten into the friendlier
    // "timed out" message. A caller-triggered abort (e.g. a Stop button) must
    // surface as a real abort error, not a fabricated timeout — callers like
    // runBatch's worker loop check `signal?.aborted` to distinguish "stopped" from
    // "failed" and need an authentic AbortError to do that.
    if (isAbort && timedOut) {
      throw new Error(`Request timed out after ${timeout / 1000} seconds`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export { DEFAULT_TIMEOUT, LONG_TIMEOUT };
