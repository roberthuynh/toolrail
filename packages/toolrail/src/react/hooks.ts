import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { useIsomorphicLayoutEffect } from "./isomorphic";
import { createRevisionWaiter, createSerialExecutor, type SerialExecutorOptions } from "../executor";
import { mountSurface, type MountedSurface, type SurfaceBuilder } from "../surface";
import { createTraceStore, type TraceEntry, type TraceStore } from "../trace";
import { getModelContext, type ModelContext, type SurfaceTool } from "../types";

function sameNames(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((name, index) => name === b[index]);
}

export interface UseToolSurfaceOptions {
  /** Defaults to `document.modelContext`; pass a StrictModelContext in tests. */
  readonly modelContext?: ModelContext;
  readonly onError?: (name: string, error: unknown) => void;
}

export interface ToolSurfaceStatus {
  readonly tools: readonly SurfaceTool[];
  readonly registered: readonly string[];
  readonly supported: boolean;
}

/**
 * Keeps the page's WebMCP tool surface in sync with app state. `build` runs on every state change;
 * removed or changed tools are aborted before new ones register. Safe under StrictMode.
 */
export function useToolSurface<S>(state: S, build: SurfaceBuilder<S>, options: UseToolSurfaceOptions = {}): ToolSurfaceStatus {
  const tools = useMemo(() => build(state), [build, state]);
  const toolsRef = useRef(tools);
  useIsomorphicLayoutEffect(() => {
    toolsRef.current = tools;
  }, [tools]);
  const mountedRef = useRef<MountedSurface | null>(null);
  const [registered, setRegistered] = useState<readonly string[]>([]);
  const [supported, setSupported] = useState(false);
  const onErrorRef = useRef(options.onError);
  useIsomorphicLayoutEffect(() => {
    onErrorRef.current = options.onError;
  });
  const { modelContext } = options;

  useEffect(() => {
    const context = modelContext ?? getModelContext();
    const mounted = mountSurface(context, toolsRef.current, {
      onChange: (names) => setRegistered((previous) => (sameNames(previous, names) ? previous : names)),
      onError: (name, error) => onErrorRef.current?.(name, error),
    });
    mountedRef.current = mounted;
    setSupported(mounted.supported);
    return () => {
      mounted.dispose();
      mountedRef.current = null;
    };
  }, [modelContext]);

  useEffect(() => {
    mountedRef.current?.update(tools);
  }, [tools]);

  return { tools, registered, supported };
}

interface Committed<S> {
  readonly state: S;
  readonly revision: number;
}

export type CommittedDispatch<A> = (action: A) => Promise<void>;

/**
 * `useReducer` plus `dispatchAndCommit`, which resolves after React has rendered the state that
 * includes the action. Tool executes await it so the agent's result never precedes the UI.
 */
export function useCommittedDispatch<S, A>(
  reducer: (state: S, action: A) => S,
  initial: S,
): readonly [S, (action: A) => void, CommittedDispatch<A>, number] {
  const [committed, rawDispatch] = useReducer(
    (current: Committed<S>, action: A): Committed<S> => ({ state: reducer(current.state, action), revision: current.revision + 1 }),
    { state: initial, revision: 0 },
  );
  const waiterRef = useRef(createRevisionWaiter(0));
  const dispatchedRef = useRef(0);

  useEffect(() => {
    waiterRef.current.commit(committed.revision);
  }, [committed.revision]);

  useEffect(() => {
    const waiter = waiterRef.current;
    return () => waiter.flush();
  }, []);

  const dispatch = useCallback((action: A) => {
    dispatchedRef.current += 1;
    rawDispatch(action);
  }, []);

  const dispatchAndCommit = useCallback<CommittedDispatch<A>>((action) => {
    dispatchedRef.current += 1;
    const pending = waiterRef.current.waitFor(dispatchedRef.current);
    rawDispatch(action);
    return pending;
  }, []);

  return [committed.state, dispatch, dispatchAndCommit, committed.revision] as const;
}

/** Subscribes to a trace store (newest first). */
export function useCallTrace(store: TraceStore): readonly TraceEntry[] {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export interface UseToolExecutorOptions extends Omit<SerialExecutorOptions, "onTrace"> {
  /** Provide your own store to share it with `<CallTrace>`; one is created otherwise. */
  readonly store?: TraceStore;
  /** Awaited after the entry is stored, e.g. a `dispatchAndCommit` so the trace shows before the result returns. */
  readonly afterTrace?: (entry: TraceEntry) => void | Promise<void>;
}

export interface ToolExecutorHandle {
  readonly run: (name: string, args?: unknown, signal?: AbortSignal) => Promise<unknown>;
  readonly store: TraceStore;
  readonly entries: readonly TraceEntry[];
}

/** A serial, traced executor whose `execute` closure always sees the latest render. */
export function useToolExecutor(options: UseToolExecutorOptions): ToolExecutorHandle {
  const optionsRef = useRef(options);
  useIsomorphicLayoutEffect(() => {
    optionsRef.current = options;
  });
  const [store] = useState(() => options.store ?? createTraceStore());
  const executor = useMemo(
    () =>
      createSerialExecutor({
        execute: (name, args, signal) => optionsRef.current.execute(name, args, signal),
        onTrace: async (entry) => {
          store.push(entry);
          await optionsRef.current.afterTrace?.(entry);
        },
        summarize: options.summarize,
        budget: options.budget,
        now: options.now,
        id: options.id,
      }),
    // The executor is created once per store; later option changes flow through optionsRef.
    [store],
  );
  const entries = useCallTrace(store);
  const run = useCallback((name: string, args?: unknown, signal?: AbortSignal) => executor.run(name, args, signal), [executor]);
  return { run, store, entries };
}
