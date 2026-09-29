import { act, fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { beforeAll, describe, expect, it } from "vitest";
import { ToolConfirmProvider, useToolConfirm } from "../src/react";

beforeAll(() => {
  // jsdom lacks <dialog> methods; keep the open attribute in sync so the provider's checks hold.
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void; close?: (value?: string) => void };
  proto.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.close = function close(this: HTMLDialogElement, value?: string) {
    if (value !== undefined) this.returnValue = value;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

function Harness({ onResult }: { onResult: (value: boolean) => void }) {
  const confirm = useToolConfirm();
  const [controller] = useState(() => new AbortController());
  return (
    <div>
      <button onClick={() => void confirm("Resign the game?").then(onResult)}>ask</button>
      <button onClick={() => void confirm("Abortable?", controller.signal).then(onResult)}>ask-abortable</button>
      <button onClick={() => controller.abort()}>abort</button>
    </div>
  );
}

describe("ToolConfirmProvider", () => {
  it("resolves true on confirm and false on cancel", async () => {
    const results: boolean[] = [];
    const view = render(
      <ToolConfirmProvider>
        <Harness onResult={(value) => results.push(value)} />
      </ToolConfirmProvider>,
    );
    await act(async () => {
      fireEvent.click(view.getByText("ask"));
    });
    const dialog = view.container.querySelector("dialog") as HTMLDialogElement;
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(view.getByText("Resign the game?")).toBeTruthy();
    await act(async () => {
      dialog.close("confirm");
    });
    expect(results).toEqual([true]);

    await act(async () => {
      fireEvent.click(view.getByText("ask"));
    });
    await act(async () => {
      dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    });
    expect(results).toEqual([true, false]);
  });

  it("resolves false when the tool call's signal aborts while the dialog is open", async () => {
    const results: boolean[] = [];
    const view = render(
      <ToolConfirmProvider>
        <Harness onResult={(value) => results.push(value)} />
      </ToolConfirmProvider>,
    );
    await act(async () => {
      fireEvent.click(view.getByText("ask-abortable"));
    });
    await act(async () => {
      fireEvent.click(view.getByText("abort"));
    });
    expect(results).toEqual([false]);
    const dialog = view.container.querySelector("dialog") as HTMLDialogElement;
    expect(dialog.hasAttribute("open")).toBe(false);
  });
});
