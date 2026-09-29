"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { assertObjectArgs, enumArg, ensureModelContext, type ModelContext, type SurfaceTool } from "toolrail";
import {
  CallTrace,
  ToolConfirmProvider,
  ToolRail,
  useCommittedDispatch,
  useToolConfirm,
  useToolExecutor,
  useToolSurface,
} from "toolrail/react";

const PLANS = ["starter", "pro", "team"] as const;
type Plan = (typeof PLANS)[number];
type Step = 1 | 2 | 3;
const STEP_NAMES: Record<Step, string> = { 1: "Contact", 2: "Plan", 3: "Review" };

interface State {
  readonly step: Step;
  readonly name: string;
  readonly email: string;
  readonly plan: Plan | null;
  readonly seats: number;
  readonly submitted: boolean;
  readonly submissions: number;
}

type Action =
  | { readonly type: "setContact"; readonly name?: string; readonly email?: string }
  | { readonly type: "setPlan"; readonly plan: Plan }
  | { readonly type: "setSeats"; readonly seats: number }
  | { readonly type: "goTo"; readonly step: Step }
  | { readonly type: "submit" }
  | { readonly type: "reset" };

const initial: State = { step: 1, name: "", email: "", plan: null, seats: 1, submitted: false, submissions: 0 };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "setContact":
      return { ...state, name: action.name ?? state.name, email: action.email ?? state.email };
    case "setPlan":
      return { ...state, plan: action.plan, seats: action.plan === "team" ? Math.max(state.seats, 2) : 1 };
    case "setSeats":
      return { ...state, seats: action.seats };
    case "goTo":
      return { ...state, step: action.step };
    case "submit":
      return { ...state, submitted: true, submissions: state.submissions + 1 };
    case "reset":
      return { ...initial, submissions: state.submissions };
    default:
      return state;
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function missingForStep(state: State, step: Step): string[] {
  if (step === 1) {
    const missing: string[] = [];
    if (!state.name.trim()) missing.push("name");
    if (!EMAIL.test(state.email)) missing.push("email");
    return missing;
  }
  if (step === 2) {
    if (!state.plan) return ["plan"];
    if (state.plan === "team" && (state.seats < 2 || state.seats > 50)) return ["seats"];
    return [];
  }
  return [...missingForStep(state, 1), ...missingForStep(state, 2)];
}

function reachableSteps(state: State): Step[] {
  if (state.submitted) return [];
  const steps: Step[] = [];
  if (state.step !== 1) steps.push(1);
  if (state.step !== 2 && missingForStep(state, 1).length === 0) steps.push(2);
  if (state.step !== 3 && missingForStep(state, 3).length === 0) steps.push(3);
  return steps;
}

function describe(state: State) {
  const missing = missingForStep(state, state.step);
  return {
    step: state.step,
    stepName: STEP_NAMES[state.step],
    submitted: state.submitted,
    fields: { name: state.name || null, email: state.email || null, plan: state.plan, seats: state.plan === "team" ? state.seats : null },
    missingOnThisStep: missing,
    reachableSteps: reachableSteps(state),
    hint: state.submitted
      ? "The form was submitted. reset_form starts over (it asks the person first)."
      : missing.length > 0
        ? `Fill ${missing.join(" and ")} on this step, then use go_to_step.`
        : state.step === 3
          ? "Everything is filled. submit_form asks the person to confirm."
          : "This step is complete; go_to_step can move on.",
  };
}

type Handler = (args: unknown, signal?: AbortSignal) => Promise<unknown>;

function WizardInner() {
  const [state, dispatch, dispatchAndCommit] = useCommittedDispatch(reducer, initial);
  const confirm = useToolConfirm();
  const [modelContext, setModelContext] = useState<ModelContext | undefined>(undefined);
  const [native, setNative] = useState<boolean | null>(null);
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    void ensureModelContext({ polyfillSrc: "/webmcp-polyfill.js" }).then((result) => {
      if (cancelled) return;
      setNative(result.native);
      setModelContext(result.modelContext);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handlers = useRef<Record<string, Handler>>({});
  const latestHandlers: Record<string, Handler> = {
    describe_form: async () => describe(stateRef.current),
    set_contact: async (args) => {
      const input = assertObjectArgs(args, "set_contact");
      const patch: { name?: string; email?: string } = {};
      for (const key of ["name", "email"] as const) {
        if (key in input) {
          if (typeof input[key] !== "string") throw new Error(`set_contact expects ${key} to be a string; retry with a string value.`);
          patch[key] = (input[key] as string).trim();
        }
      }
      if (Object.keys(patch).length === 0) throw new Error("set_contact needs name and/or email; retry with at least one.");
      if (patch.email !== undefined && !EMAIL.test(patch.email)) throw new Error(`"${patch.email}" does not look like an email; retry with a valid address.`);
      await dispatchAndCommit({ type: "setContact", ...patch });
      return describe(stateRef.current);
    },
    go_to_step: async (args) => {
      const allowed = reachableSteps(stateRef.current).map(String);
      const step = enumArg(args, { tool: "go_to_step", key: "step", allowed, retryHint: "call describe_form and retry with a reachable step" });
      await dispatchAndCommit({ type: "goTo", step: Number(step) as Step });
      return describe(stateRef.current);
    },
    choose_plan: async (args) => {
      const plan = enumArg(args, { tool: "choose_plan", key: "plan", allowed: PLANS }) as Plan;
      await dispatchAndCommit({ type: "setPlan", plan });
      return describe(stateRef.current);
    },
    set_seats: async (args) => {
      const input = assertObjectArgs(args, "set_seats");
      const seats = input.seats;
      if (typeof seats !== "number" || !Number.isInteger(seats) || seats < 2 || seats > 50) {
        throw new Error("set_seats expects an integer seats between 2 and 50; retry with a whole number in range.");
      }
      await dispatchAndCommit({ type: "setSeats", seats });
      return describe(stateRef.current);
    },
    submit_form: async (_args, signal) => {
      const current = stateRef.current;
      const ok = await confirm(`Submit ${current.name}'s ${current.plan} sign-up?`, signal);
      if (!ok) return { submitted: false, reason: "cancelled by the person" };
      await dispatchAndCommit({ type: "submit" });
      return describe(stateRef.current);
    },
    reset_form: async (_args, signal) => {
      const ok = await confirm("Clear the form and start over?", signal);
      if (!ok) return { reset: false, reason: "cancelled by the person" };
      await dispatchAndCommit({ type: "reset" });
      return describe(stateRef.current);
    },
  };

  useLayoutEffect(() => {
    handlers.current = latestHandlers;
  });

  const { run, entries } = useToolExecutor({
    execute: (name, args, signal) => {
      const handler = handlers.current[name];
      if (!handler) throw new Error(`${name} is not available right now; call describe_form to see the current tools.`);
      return handler(args, signal);
    },
  });

  const build = useCallback(
    (s: State): SurfaceTool[] => {
      const tool = (spec: Omit<SurfaceTool, "execute">): SurfaceTool => ({
        ...spec,
        execute: (input, { signal }) => run(spec.name, input, signal),
      });
      const tools: SurfaceTool[] = [
        tool({
          name: "describe_form",
          mode: "READ",
          description: "The current step, the filled fields, what is still missing, and which steps are reachable.",
        }),
      ];
      const reachable = reachableSteps(s);
      if (reachable.length > 0) {
        tools.push(
          tool({
            name: "go_to_step",
            mode: "ACT",
            detail: `${reachable.length} reachable`,
            description: `Move the wizard to a step that is reachable right now (${reachable.map((step) => `${step} ${STEP_NAMES[step]}`).join(", ")}).`,
            inputSchema: {
              type: "object",
              properties: { step: { type: "string", enum: reachable.map(String), description: "Step number to open." } },
              required: ["step"],
              additionalProperties: false,
            },
          }),
        );
      }
      if (!s.submitted && s.step === 1) {
        const missing = missingForStep(s, 1);
        tools.push(
          tool({
            name: "set_contact",
            mode: "ACT",
            detail: missing.length > 0 ? `${missing.length} missing` : "complete",
            description: "Set the person's name and/or email on the contact step. Leave a field out to keep its current value.",
            inputSchema: {
              type: "object",
              properties: { name: { type: "string", description: "Full name." }, email: { type: "string", description: "Email address." } },
              required: [],
              additionalProperties: false,
            },
          }),
        );
      }
      if (!s.submitted && s.step === 2) {
        tools.push(
          tool({
            name: "choose_plan",
            mode: "ACT",
            detail: `${PLANS.length} plans`,
            description: "Choose one of the plans offered right now.",
            inputSchema: {
              type: "object",
              properties: { plan: { type: "string", enum: [...PLANS], description: "Plan id." } },
              required: ["plan"],
              additionalProperties: false,
            },
          }),
        );
        if (s.plan === "team") {
          tools.push(
            tool({
              name: "set_seats",
              mode: "ACT",
              detail: "2 to 50",
              description: "Set how many seats the team plan needs (2 to 50). Only exists while the team plan is selected.",
              inputSchema: {
                type: "object",
                properties: { seats: { type: "integer", minimum: 2, maximum: 50, description: "Number of seats." } },
                required: ["seats"],
                additionalProperties: false,
              },
            }),
          );
        }
      }
      if (!s.submitted && s.step === 3 && missingForStep(s, 3).length === 0) {
        tools.push(
          tool({
            name: "submit_form",
            mode: "ACT",
            detail: "asks first",
            annotations: { consequentialHint: true },
            description: "Submit the completed sign-up. The person is asked to confirm on the page before anything is sent.",
          }),
        );
      }
      if (s.submitted || s.name || s.email || s.plan) {
        tools.push(
          tool({
            name: "reset_form",
            mode: "ACT",
            detail: "asks first",
            annotations: { consequentialHint: true },
            description: "Clear every field and return to step 1. The person is asked to confirm first.",
          }),
        );
      }
      return tools;
    },
    [run],
  );

  const { tools, registered, supported } = useToolSurface(state, build, { modelContext });
  const stepMissing = missingForStep(state, state.step);

  return (
    <div className="demo">
      <section className="panel" aria-labelledby="wizard-heading">
        <p className="kicker">Demo</p>
        <h2 id="wizard-heading">Sign-up wizard, two operators</h2>
        <p className="status">
          WebMCP:{" "}
          <strong>{native === null ? "checking" : native ? "native" : supported ? "polyfill" : "unavailable"}</strong> · tools registered:{" "}
          <strong>{registered.length}</strong> · submissions: <strong>{state.submissions}</strong>
        </p>
        <ol className="steps">
          {([1, 2, 3] as Step[]).map((step) => (
            <li aria-current={state.step === step ? "step" : undefined} key={step}>
              {step}. {STEP_NAMES[step]}
            </li>
          ))}
        </ol>

        {state.submitted ? (
          <div>
            <p>
              Submitted <strong>{state.name}</strong> ({state.email}) on the <strong>{state.plan}</strong> plan
              {state.plan === "team" ? ` with ${state.seats} seats` : ""}. Nothing was actually sent anywhere.
            </p>
            <div className="actions">
              <button onClick={() => dispatch({ type: "reset" })}>Start over</button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (state.step === 3) dispatch({ type: "submit" });
              else if (stepMissing.length === 0) dispatch({ type: "goTo", step: (state.step + 1) as Step });
            }}
          >
            {state.step === 1 ? (
              <>
                <label className="field">
                  <span>Name</span>
                  <input value={state.name} onChange={(event) => dispatch({ type: "setContact", name: event.target.value })} autoComplete="name" />
                </label>
                <label className="field">
                  <span>Email</span>
                  <input value={state.email} onChange={(event) => dispatch({ type: "setContact", email: event.target.value })} autoComplete="email" type="email" />
                </label>
              </>
            ) : null}
            {state.step === 2 ? (
              <>
                <label className="field">
                  <span>Plan</span>
                  <select value={state.plan ?? ""} onChange={(event) => dispatch({ type: "setPlan", plan: event.target.value as Plan })}>
                    <option value="" disabled>
                      Choose a plan
                    </option>
                    {PLANS.map((plan) => (
                      <option key={plan} value={plan}>
                        {plan}
                      </option>
                    ))}
                  </select>
                </label>
                {state.plan === "team" ? (
                  <label className="field">
                    <span>Seats (2 to 50)</span>
                    <input
                      type="number"
                      min={2}
                      max={50}
                      value={state.seats}
                      onChange={(event) => dispatch({ type: "setSeats", seats: Number(event.target.value) })}
                    />
                  </label>
                ) : null}
              </>
            ) : null}
            {state.step === 3 ? (
              <dl>
                <dt>Name</dt>
                <dd>{state.name}</dd>
                <dt>Email</dt>
                <dd>{state.email}</dd>
                <dt>Plan</dt>
                <dd>
                  {state.plan}
                  {state.plan === "team" ? `, ${state.seats} seats` : ""}
                </dd>
              </dl>
            ) : null}
            <div className="actions">
              {state.step > 1 ? (
                <button type="button" onClick={() => dispatch({ type: "goTo", step: (state.step - 1) as Step })}>
                  Back
                </button>
              ) : null}
              <button className="primary" disabled={stepMissing.length > 0} type="submit">
                {state.step === 3 ? "Submit" : "Next"}
              </button>
            </div>
          </form>
        )}
        <p className="status" style={{ marginTop: 16 }}>
          Every tool on the right is a thin wrapper over the same reducer these controls use. Change a step by hand and watch the surface
          change. Open the page in ChatGPT&apos;s desktop browser, Codex, or Chrome with the WebMCP flag to drive it from the other side.
        </p>
      </section>
      <aside className="demo-side">
        <div className="panel">
          <ToolRail tools={tools} />
        </div>
        <div className="panel" style={{ marginTop: 16 }}>
          <CallTrace entries={entries} defaultOpen />
        </div>
      </aside>
    </div>
  );
}

export function DemoWizard() {
  return (
    <ToolConfirmProvider kicker="Your form, your call">
      <WizardInner />
    </ToolConfirmProvider>
  );
}
