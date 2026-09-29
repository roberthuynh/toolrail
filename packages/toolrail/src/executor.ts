import { assertOutputBudget, DEFAULT_OUTPUT_BUDGET } from "./budget";
import { summarizeForTrace, type TraceEntry } from "./trace";

export interface SerialExecutorOptions {
  readonly execute: (name: string, args: unknown, signal?: AbortSignal) => unknown | Promise<unknown>;
  /** Awaited before the call resolves, so the UI (or a store commit) reflects the call first. */
  readonly onTrace?: (entry: TraceEntry) => void | Promise<void>;
  readonly summarize?: (value: unknown, isError: boolean) => unknown;
  /** Enforce an output budget on results; `false` disables. Defaults to 1,500 characters. */
  readonly budget?: number | false;
  readonly now?: () => number;
  readonly id?: () => string;
}

export interface SerialExecutor {
  run(name: string, args?: unknown, signal?: AbortSignal): Promise<unknown>;
  readonly pending: number;
}

/**
 * Runs tool calls one at a time, traces each as OK or ERROR, and resolves only after the trace
 * has been handled. Ported from Boardspeak's executeTool queue.
 */
export function createSerialExecutor(options: SerialExecutorOptions): SerialExecutor {
  const now = options.now ?? (() => Date.now());
  let counter = 0;
  const id = options.id ?? (() => `trace-${now()}-${counter++}`);
  const summarize = options.summarize ?? ((value: unknown) => summarizeForTrace(value));
  const budget = options.budget === undefined ? DEFAULT_OUTPUT_BUDGET : options.budget;
  let queue: Promise<unknown> = Promise.resolve();
  let pending = 0;

  async function call(name: string, args: unknown, signal?: AbortSignal): Promise<unknown> {
    const started = now();
    const base = { id: id(), timestamp: new Date(started).toISOString(), name, args: args ?? {} };
    try {
      const result = await options.execute(name, args ?? {}, signal);
      if (budget !== false) assertOutputBudget(name, result, budget);
      await options.onTrace?.({ ...base, result: summarize(result, false), isError: false, durationMs: now() - started });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await options.onTrace?.({ ...base, result: summarize(message, true), isError: true, durationMs: now() - started });
      throw error instanceof Error ? error : new Error(message);
    }
  }

  return {
    run(name, args = {}, signal) {
      pending += 1;
      const task = () => call(name, args, signal);
      const queued = queue.then(task, task);
      queue = queued.then(
        () => {
          pending -= 1;
        },
        () => {
          pending -= 1;
        },
      );
      return queued;
    },
    get pending() {
      return pending;
    },
  };
}

export interface RevisionWaiter {
  /** Resolves once `commit` has been called with a revision >= target. */
  waitFor(target: number): Promise<void>;
  commit(revision: number): void;
  readonly revision: number;
  /** Resolve everything outstanding (unmount). */
  flush(): void;
}

/** Lets a caller await "the state that includes my change has been committed" (React: after render). */
export function createRevisionWaiter(initial = 0): RevisionWaiter {
  let revision = initial;
  let waiters: { target: number; resolve: () => void }[] = [];
  return {
    waitFor(target) {
      if (target <= revision) return Promise.resolve();
      return new Promise((resolve) => waiters.push({ target, resolve }));
    },
    commit(next) {
      revision = next;
      const ready = waiters.filter((waiter) => waiter.target <= revision);
      waiters = waiters.filter((waiter) => waiter.target > revision);
      for (const waiter of ready) waiter.resolve();
    },
    get revision() {
      return revision;
    },
    flush() {
      const all = waiters;
      waiters = [];
      for (const waiter of all) waiter.resolve();
    },
  };
}
