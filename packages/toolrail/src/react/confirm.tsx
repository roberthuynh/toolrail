import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useIsomorphicLayoutEffect } from "./isomorphic";

export type ToolConfirm = (message: string, signal?: AbortSignal) => Promise<boolean>;

interface ConfirmRequest {
  id: number;
  message: string;
  signal?: AbortSignal;
  opener: HTMLElement | null;
  resolve: (confirmed: boolean) => void;
  onAbort?: () => void;
}

const ConfirmContext = createContext<ToolConfirm | null>(null);

/** Ask the person before a consequential tool call commits. Resolves false when the call's signal aborts. */
export function useToolConfirm(): ToolConfirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useToolConfirm must be used inside <ToolConfirmProvider>.");
  return confirm;
}

export interface ToolConfirmProviderProps {
  readonly children: ReactNode;
  readonly title?: ReactNode;
  readonly kicker?: ReactNode;
  readonly confirmLabel?: ReactNode;
  readonly cancelLabel?: ReactNode;
  readonly className?: string;
}

/**
 * A native `<dialog>` confirmation queue. Requests are FIFO, Escape cancels, focus returns to the
 * opener, and an aborted request resolves false without ever opening. Ported from Boardspeak.
 */
export function ToolConfirmProvider({
  children,
  title = "Please confirm",
  kicker,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  className = "toolrail-confirm",
}: ToolConfirmProviderProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const queueRef = useRef<ConfirmRequest[]>([]);
  const activeRef = useRef<ConfirmRequest | null>(null);
  const nextIdRef = useRef(0);
  const finishRef = useRef<(confirmed: boolean) => void>(() => undefined);
  const [active, setActive] = useState<ConfirmRequest | null>(null);
  const titleId = useId();

  const activateNext = useCallback(() => {
    if (activeRef.current) return;
    let next = queueRef.current.shift();
    while (next?.signal?.aborted) {
      if (next.onAbort) next.signal.removeEventListener("abort", next.onAbort);
      next.resolve(false);
      next = queueRef.current.shift();
    }
    if (!next) return;
    activeRef.current = next;
    setActive(next);
  }, []);

  const finish = useCallback(
    (confirmed: boolean) => {
      const request = activeRef.current;
      if (!request) return;
      activeRef.current = null;
      if (request.signal && request.onAbort) request.signal.removeEventListener("abort", request.onAbort);
      const dialog = dialogRef.current;
      if (dialog?.open) dialog.close();
      setActive(null);
      request.resolve(confirmed);
      if (request.opener?.isConnected) request.opener.focus();
      queueMicrotask(activateNext);
    },
    [activateNext],
  );
  useIsomorphicLayoutEffect(() => {
    finishRef.current = finish;
  }, [finish]);

  const confirm = useCallback<ToolConfirm>(
    (message, signal) => {
      if (signal?.aborted) return Promise.resolve(false);
      return new Promise<boolean>((resolve) => {
        const request: ConfirmRequest = {
          id: nextIdRef.current++,
          message,
          signal,
          opener: typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null,
          resolve,
        };
        request.onAbort = () => {
          if (activeRef.current?.id === request.id) {
            finishRef.current(false);
            return;
          }
          const index = queueRef.current.findIndex((queued) => queued.id === request.id);
          if (index >= 0) {
            queueRef.current.splice(index, 1);
            if (request.onAbort) request.signal?.removeEventListener("abort", request.onAbort);
            request.resolve(false);
          }
        };
        signal?.addEventListener("abort", request.onAbort, { once: true });
        queueRef.current.push(request);
        activateNext();
      });
    },
    [activateNext],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (active && dialog && !dialog.open && typeof dialog.showModal === "function") dialog.showModal();
  }, [active]);

  useEffect(
    () => () => {
      const pending = [activeRef.current, ...queueRef.current].filter((request): request is ConfirmRequest => Boolean(request));
      activeRef.current = null;
      queueRef.current = [];
      for (const request of pending) {
        if (request.signal && request.onAbort) request.signal.removeEventListener("abort", request.onAbort);
        request.resolve(false);
      }
    },
    [],
  );

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <dialog
        aria-labelledby={titleId}
        className={className}
        data-toolrail="confirm"
        onCancel={(event) => {
          event.preventDefault();
          finish(false);
        }}
        onClose={() => {
          if (activeRef.current) finish(dialogRef.current?.returnValue === "confirm");
        }}
        ref={dialogRef}
      >
        <form method="dialog">
          {kicker ? <p className={`${className}-kicker`}>{kicker}</p> : null}
          <h2 id={titleId}>{title}</h2>
          <p className={`${className}-message`}>{active?.message}</p>
          <div className={`${className}-actions`}>
            <button autoFocus type="submit" value="cancel">
              {cancelLabel}
            </button>
            <button className={`${className}-primary`} type="submit" value="confirm">
              {confirmLabel}
            </button>
          </div>
        </form>
      </dialog>
    </ConfirmContext.Provider>
  );
}
