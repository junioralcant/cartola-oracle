import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAssertGenerateLineupRequest,
  mockBuildRoundContext,
  mockScoreRoundContext,
  mockGenerateLineup,
  mockOptimizerCtor,
  MockLineupNotPossibleError,
} = vi.hoisted(() => {
  class LocalMockLineupNotPossibleError extends Error {
    readonly code = "LINEUP_NOT_POSSIBLE";

    constructor(message = "Nao foi possivel montar um time valido com esse orcamento e formacao.") {
      super(message);
      this.name = "LineupNotPossibleError";
    }
  }

  const generateLineup = vi.fn();
  return {
    mockAssertGenerateLineupRequest: vi.fn(),
    mockBuildRoundContext: vi.fn(),
    mockScoreRoundContext: vi.fn(),
    mockGenerateLineup: generateLineup,
    mockOptimizerCtor: vi.fn(() => ({
      generateLineup,
    })),
    MockLineupNotPossibleError: LocalMockLineupNotPossibleError,
  };
});

vi.mock("@/lib/cartola-api", () => ({
  HttpCartolaApiClient: vi.fn(),
}));

vi.mock("@/lib/domain", async () => {
  const actual = await vi.importActual<typeof import("@/lib/domain")>("@/lib/domain");
  return {
    ...actual,
    assertGenerateLineupRequest: mockAssertGenerateLineupRequest,
    buildRoundContext: mockBuildRoundContext,
    scoreRoundContext: mockScoreRoundContext,
  };
});

vi.mock("@/lib/optimizer", () => ({
  HeuristicLineupOptimizer: mockOptimizerCtor,
  LineupNotPossibleError: MockLineupNotPossibleError,
}));

import { POST } from "./route";

const createRequest = (body: unknown): Request =>
  new Request("http://localhost/api/lineup/generate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

describe("POST /api/lineup/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with lineup, summary, warnings and explanations", async () => {
    mockAssertGenerateLineupRequest.mockImplementation(() => undefined);
    mockBuildRoundContext.mockResolvedValue({
      marketRound: 5,
      marketStatus: "open",
      lastRound: 4,
      players: [],
      coaches: [],
      warnings: ["matches: missing matchup for club 10"],
    });
    mockScoreRoundContext.mockReturnValue({
      players: [{ id: 123, name: "Pedro", position: "ATA", clubId: 10, clubAbbreviation: "FLA", price: 12.5, score: 8.91, justification: "ultima rodada forte." }],
      coaches: [{ id: 999, name: "Tecnico X", clubId: 10, clubAbbreviation: "FLA", price: 8, score: 6.4, justification: "clube em boa fase." }],
    });
    mockGenerateLineup.mockReturnValue({
      formation: "4-3-3",
      players: [{ id: 123, name: "Pedro", position: "ATA", clubId: 10, clubAbbreviation: "FLA", price: 12.5, score: 8.91, justification: "ultima rodada forte." }],
      coach: { id: 999, name: "Tecnico X", clubId: 10, clubAbbreviation: "FLA", price: 8, score: 6.4, justification: "clube em boa fase." },
      totalCost: 118.3,
      totalScore: 79.54,
      remainingBudget: 2.2,
    });

    const response = await POST(createRequest({ budget: 120.5, formation: "4-3-3" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.summary).toEqual({
      formation: "4-3-3",
      totalCost: 118.3,
      remainingBudget: 2.2,
      totalScore: 79.54,
    });
    expect(payload.warnings).toEqual(["matches: missing matchup for club 10"]);
    expect(payload.explanations.length).toBeGreaterThan(0);
  });

  it("returns 400 for invalid request payload", async () => {
    mockAssertGenerateLineupRequest.mockImplementation(() => {
      throw new Error("Invalid lineup request; expected { budget: number, formation: string }");
    });

    const response = await POST(createRequest({ budget: -1, formation: "4-3-3" }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "Invalid lineup request; expected { budget: number, formation: string }",
      },
      warnings: [],
    });
  });

  it("returns 422 when lineup is not possible and keeps context warnings", async () => {
    mockAssertGenerateLineupRequest.mockImplementation(() => undefined);
    mockBuildRoundContext.mockResolvedValue({
      marketRound: 5,
      marketStatus: "open",
      lastRound: 4,
      players: [],
      coaches: [],
      warnings: ["clubs: missing data for club 20"],
    });
    mockScoreRoundContext.mockReturnValue({ players: [], coaches: [] });
    mockGenerateLineup.mockImplementation(() => {
      throw new MockLineupNotPossibleError("Nao foi possivel montar um time valido com esse orcamento e formacao.");
    });

    const response = await POST(createRequest({ budget: 10, formation: "4-3-3" }));
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.error.code).toBe("LINEUP_NOT_POSSIBLE");
    expect(payload.warnings).toEqual(["clubs: missing data for club 20"]);
  });

  it("returns 503 for technical failures", async () => {
    mockAssertGenerateLineupRequest.mockImplementation(() => undefined);
    mockBuildRoundContext.mockRejectedValue(new Error("upstream failed"));

    const response = await POST(createRequest({ budget: 120.5, formation: "4-3-3" }));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "Nao foi possivel gerar o time agora. Tente novamente em instantes.",
      },
      warnings: [],
    });
  });

  it("returns 400 when request body is invalid json", async () => {
    const request = new Request("http://localhost/api/lineup/generate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "{",
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_REQUEST");
  });
});
