import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockBuildRoundContext } = vi.hoisted(() => ({
  mockBuildRoundContext: vi.fn(),
}));

vi.mock("@/lib/cartola-api", () => ({
  HttpCartolaApiClient: vi.fn(),
}));

vi.mock("@/lib/domain", async () => {
  const actual = await vi.importActual<typeof import("@/lib/domain")>("@/lib/domain");
  return {
    ...actual,
    buildRoundContext: mockBuildRoundContext,
  };
});

import { GET, STATUS_UNAVAILABLE_MESSAGE } from "./route";

const createRequest = () => new Request("http://localhost/api/lineup/status");

describe("GET /api/lineup/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the current market round and status", async () => {
    mockBuildRoundContext.mockResolvedValue({
      marketRound: 18,
      marketStatus: "open",
      lastRound: 17,
      players: [],
      coaches: [],
      warnings: [],
    });

    const response = await GET(createRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      marketRound: 18,
      marketStatus: "open",
    });
  });

  it("returns a 503 when the round context cannot be built", async () => {
    mockBuildRoundContext.mockRejectedValue(new Error("upstream failure"));

    const response = await GET(createRequest());
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({
      error: {
        code: "STATUS_UNAVAILABLE",
        message: STATUS_UNAVAILABLE_MESSAGE,
      },
    });
  });
});
