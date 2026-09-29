# toolrail

State-driven [WebMCP](https://github.com/webmachinelearning/webmcp) tool surfaces for web apps, extracted from [Boardspeak](https://boardspeak.vercel.app).

WebMCP lets a page register typed tools on `document.modelContext` so browser agents (ChatGPT's desktop browser, Codex, Chrome) can drive it. Most libraries stop at "register a tool". toolrail covers what happens next:

- **A surface that follows your state.** Describe the tools that exist *right now* as a function of state. toolrail diffs, aborts removed or changed tools *before* registering new ones (the spec has no unregister), and keeps `execute` closures current without re-registering.
- **Output budgets.** Agents receive tool results as strings. `assertOutputBudget` and `fitToBudget` keep results inside a character budget deterministically, with a `truncated` flag.
- **Commit-before-resolve.** A serial executor traces every call and resolves only after your UI has committed the change, so the agent never sees a result the person can't.
- **Confirm-gated writes.** A native `<dialog>` queue tied to the tool call's `AbortSignal`.
- **A visible rail and call trace.** `<ToolRail>` shows what the agent can do right now; `<CallTrace>` shows what it did, on the page, without DevTools.
- **A strict test double.** `StrictModelContext` throws on duplicate names and drops tools on abort, like Chrome.

It does not lint (see [webmcp-lint](https://www.npmjs.com/package/webmcp-lint)) or run evals (see Google's [webmcp-evals](https://github.com/GoogleChromeLabs/webmcp-tools)).

## Install

```sh
pnpm add toolrail
```

React 18.2+ or 19 is an optional peer dependency, needed only for `toolrail/react`.

## Core

```ts
import { defineSurface, mountSurface, getModelContext, fitToBudget, enumArg } from "toolrail";

const surface = defineSurface((state: Wizard) => [
  { name: "describe_form", mode: "READ", description: "Current step and what is still missing.", execute: () => describe(state) },
  ...(state.step === 2
    ? [{
        name: "choose_plan",
        mode: "ACT",
        detail: `${state.plans.length} plans`,
        description: "Pick one of the plans currently offered.",
        inputSchema: { type: "object", properties: { plan: { type: "string", enum: state.plans } }, required: ["plan"], additionalProperties: false },
        execute: (input) => choosePlan(enumArg(input, { tool: "choose_plan", key: "plan", allowed: state.plans })),
      }]
    : []),
]);

const mounted = mountSurface(getModelContext(), surface(state));
// later, on every state change:
mounted.update(surface(nextState));
// on teardown:
mounted.dispose();
```

`fitToBudget(items, { max: 1500, wrap: (included, meta) => ({ ...meta, items: included }) })` returns the largest prefix whose *wrapped* output fits, plus `{ total, returned, truncated }`.

## React

```tsx
"use client";
import { useToolSurface, useCommittedDispatch, useToolExecutor, ToolConfirmProvider, useToolConfirm, ToolRail, CallTrace } from "toolrail/react";

function Wizard() {
  const [state, dispatch, dispatchAndCommit] = useCommittedDispatch(reducer, initial);
  const confirm = useToolConfirm();
  const { run, entries } = useToolExecutor({ execute: (name, args, signal) => handlers.current[name](args, signal) });
  const { tools, registered, supported } = useToolSurface(state, build);
  return (
    <>
      <Form state={state} dispatch={dispatch} />
      <ToolRail tools={tools} />
      <CallTrace entries={entries} />
    </>
  );
}
```

Wrap the tree in `<ToolConfirmProvider>`; inside a tool, `await confirm("Submit the order?", signal)` resolves `false` if the agent cancels the call.

## Testing

```ts
import { StrictModelContext, mountSurface } from "toolrail";
const context = new StrictModelContext();
mountSurface(context, surface(state));
expect(context.names()).toEqual(["describe_form", "choose_plan"]);
await context.execute("describe_form");
```

## Browsers without WebMCP

`ensureModelContext({ polyfillSrc: "/webmcp-polyfill.js" })` resolves with `{ native: true }` when the browser has `document.modelContext`, and otherwise injects the given polyfill once (for example the one in GoogleChromeLabs/webmcp-tools). Never inject when you want to know whether a real client can see your tools.

## Status

Early. The spec is in a Chrome origin trial and ChatGPT's site tools are gated to its desktop app. Expect the API surface here to move with them. A hosted checker that loads your URL in a WebMCP-enabled Chrome and reports what an agent sees lives at https://webmcp.huynhrobert.com.

MIT © Robert Huynh
