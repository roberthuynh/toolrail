import { getModelContext, type ModelContext } from "./types";

export interface EnsureModelContextOptions {
  /** URL of a WebMCP polyfill script (for example the one in GoogleChromeLabs/webmcp-tools). */
  readonly polyfillSrc: string;
  readonly doc?: Document;
}

export interface EnsureModelContextResult {
  readonly native: boolean;
  readonly modelContext: ModelContext | undefined;
}

const MARK = "data-toolrail-polyfill";

/**
 * Resolves with the native `document.modelContext` when present; otherwise injects the polyfill once
 * and resolves after it loads. Never injects when native support exists.
 */
export function ensureModelContext(options: EnsureModelContextOptions): Promise<EnsureModelContextResult> {
  const doc = options.doc ?? document;
  const native = getModelContext(doc);
  if (native) return Promise.resolve({ native: true, modelContext: native });

  return new Promise((resolve) => {
    const finish = () => resolve({ native: false, modelContext: getModelContext(doc) });
    const existing = doc.querySelector<HTMLScriptElement>(`script[${MARK}]`);
    if (existing) {
      if (existing.dataset.loaded === "true") finish();
      else {
        existing.addEventListener("load", finish, { once: true });
        existing.addEventListener("error", finish, { once: true });
      }
      return;
    }
    const script = doc.createElement("script");
    script.src = options.polyfillSrc;
    script.async = true;
    script.setAttribute(MARK, "true");
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        finish();
      },
      { once: true },
    );
    script.addEventListener("error", finish, { once: true });
    doc.head.appendChild(script);
  });
}
