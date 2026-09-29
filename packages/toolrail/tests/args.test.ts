import { describe, expect, it } from "vitest";
import { assertObjectArgs, enumArg } from "../src";

describe("argument helpers", () => {
  it("rejects non-object arguments with the tool name", () => {
    expect(() => assertObjectArgs(null, "play_move")).toThrow(/play_move expects a JSON object/);
    expect(() => assertObjectArgs([], "play_move")).toThrow();
    expect(assertObjectArgs({ a: 1 }, "play_move")).toEqual({ a: 1 });
  });

  it("accepts a listed value and rejects everything else with a recovery hint", () => {
    const options = { tool: "play_move", key: "move", allowed: ["e7-e6", "e7-e5"], retryHint: "call list_legal_moves and retry" };
    expect(enumArg({ move: "e7-e6" }, options)).toBe("e7-e6");
    expect(() => enumArg({ move: "e7-e4" }, options)).toThrow('"e7-e4" is not allowed right now; call list_legal_moves and retry.');
    expect(() => enumArg({}, options)).toThrow("move is not allowed right now");
    expect(() => enumArg({ move: "e7-e6", extra: 1 }, options)).toThrow("unknown parameter (extra)");
  });
});
