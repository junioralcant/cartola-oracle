import { describe, expect, it } from "vitest";
import {
  assertGenerateLineupRequest,
  isGenerateLineupRequest,
  isSupportedFormation,
} from "./lineup-contract";

describe("lineup contract guards", () => {
  it("accepts supported formations", () => {
    expect(isSupportedFormation("4-3-3")).toBe(true);
    expect(isSupportedFormation("5-4-1")).toBe(true);
  });

  it("rejects unsupported formations", () => {
    expect(isSupportedFormation("2-6-2")).toBe(false);
    expect(isSupportedFormation(4 as unknown)).toBe(false);
  });

  it("validates a proper lineup request", () => {
    expect(
      isGenerateLineupRequest({
        budget: 120,
        formation: "4-3-3",
      }),
    ).toBe(true);
  });

  it("rejects requests with invalid budgets", () => {
    expect(
      isGenerateLineupRequest({
        budget: -1,
        formation: "4-3-3",
      }),
    ).toBe(false);
    expect(isGenerateLineupRequest({ formation: "4-3-3" })).toBe(false);
  });

  it("rejects requests with unsupported formations", () => {
    expect(
      isGenerateLineupRequest({
        budget: 120,
        formation: "7-1-2" as never,
      }),
    ).toBe(false);
  });

  it("asserts a valid request without throwing", () => {
    expect(() => {
      assertGenerateLineupRequest({ budget: 120, formation: "4-3-3" });
    }).not.toThrow();
  });

  it("throws when asserting an invalid request", () => {
    expect(() => {
      assertGenerateLineupRequest({ formation: "4-3-3" });
    }).toThrow("Invalid lineup request");
  });
});
