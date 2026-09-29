export interface TraceEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly name: string;
  readonly args: unknown;
  readonly result: unknown;
  readonly isError: boolean;
  readonly durationMs: number;
}

export interface TraceStore {
  getSnapshot(): readonly TraceEntry[];
  subscribe(listener: () => void): () => void;
  push(entry: TraceEntry): void;
  clear(): void;
}

/** A tiny external store (newest first, capped) that `useSyncExternalStore` can read. */
export function createTraceStore(options: { readonly limit?: number } = {}): TraceStore {
  const limit = options.limit ?? 50;
  let entries: readonly TraceEntry[] = [];
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => entries,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    push(entry) {
      entries = [entry, ...entries].slice(0, limit);
      emit();
    },
    clear() {
      entries = [];
      emit();
    },
  };
}

/** Shortens a result for display the way Boardspeak's trace did (620 characters). */
export function summarizeForTrace(value: unknown, limit = 620): string {
  let text: string;
  if (typeof value === "string") text = value;
  else {
    try {
      text = JSON.stringify(value) ?? String(value);
    } catch {
      text = "[unserializable result]";
    }
  }
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}
