import { describe, expect, it, vi } from "vitest";
import { buildRoundContext } from "./round-context";
import type { CartolaApiClient, ApiResult, NormalizedMarketAthletes, NormalizedMarketStatus, NormalizedLastRoundScore, NormalizedMatch, NormalizedClub } from "../cartola-api/types";

const createClient = (overrides: Partial<CartolaApiClient> = {}): CartolaApiClient => ({
  getMarketAthletes: vi.fn().mockResolvedValue({
    data: {
      athletes: [],
      coaches: [],
      clubsById: {},
    },
    warnings: [],
  } as ApiResult<NormalizedMarketAthletes>),
  getMarketStatus: vi.fn().mockResolvedValue({
    marketRound: 1,
    marketStatus: "open",
    defaultFormationId: 4,
  } as NormalizedMarketStatus),
  getMatches: vi.fn().mockResolvedValue({ data: [], warnings: [] } as ApiResult<NormalizedMatch[]>),
  getClubs: vi.fn().mockResolvedValue({ data: {}, warnings: [] } as ApiResult<Record<number, NormalizedClub>>),
  getLastRoundScores: vi.fn().mockResolvedValue({ data: [], warnings: [] } as ApiResult<NormalizedLastRoundScore[]>),
  ...overrides,
});

const mockAthleteResult = (): ApiResult<NormalizedMarketAthletes> => ({
  data: {
    athletes: [
      {
        id: 123,
        name: "Pedro",
        positionId: 5,
        clubId: 10,
        price: 12.5,
        averageScore: 6.3,
        lastKnownScore: 7,
        scout: { G: 1 },
      },
    ],
    coaches: [
      {
        id: 999,
        name: "Tecnico X",
        clubId: 10,
        price: 8,
      },
    ],
    clubsById: {
      10: { id: 10, name: "Flamengo", abbreviation: "FLA" },
    },
  },
  warnings: [],
});

const mockMatchesResult = (): ApiResult<NormalizedMatch[]> => ({
  data: [
    {
      homeClubId: 10,
      awayClubId: 20,
      matchDate: "2026-04-01",
      local: "Maracana",
    },
  ],
  warnings: [],
});

const mockClubsResult = (): ApiResult<Record<number, NormalizedClub>> => ({
  data: {
    10: { id: 10, name: "Flamengo", abbreviation: "FLA" },
    20: { id: 20, name: "Internacional", abbreviation: "INT" },
  },
  warnings: [],
});

const mockLastRoundScores = (): ApiResult<NormalizedLastRoundScore[]> => ({
  data: [
    { athleteId: 123, score: 8.2, scout: { G: 1 } },
  ],
  warnings: [],
});

describe("buildRoundContext", () => {
  it("builds a full context when data is available", async () => {
    const client = createClient({
      getMarketStatus: vi.fn().mockResolvedValue({ marketRound: 5, marketStatus: "open", defaultFormationId: 4 }),
      getMarketAthletes: vi.fn().mockResolvedValue(mockAthleteResult()),
      getMatches: vi.fn().mockResolvedValue(mockMatchesResult()),
      getClubs: vi.fn().mockResolvedValue(mockClubsResult()),
      getLastRoundScores: vi.fn().mockResolvedValue(mockLastRoundScores()),
    });

    const context = await buildRoundContext(client);

    expect(context.marketRound).toBe(5);
    expect(context.lastRound).toBe(4);
    expect(context.players[0].lastRoundScore).toBe(8.2);
    expect(context.players[0].isHome).toBe(true);
    expect(context.players[0].opponentClubId).toBe(20);
    expect(context.players[0].opponentClubAbbreviation).toBe("INT");
    expect(context.coaches[0].clubAbbreviation).toBe("FLA");
    expect(context.warnings).not.toContain("market-status: status open");
  });

  it("adds a warning when market is closed", async () => {
    const client = createClient({
      getMarketStatus: vi.fn().mockResolvedValue({ marketRound: 3, marketStatus: "closed", defaultFormationId: 4 }),
      getMarketAthletes: vi.fn().mockResolvedValue(mockAthleteResult()),
      getMatches: vi.fn().mockResolvedValue(mockMatchesResult()),
      getClubs: vi.fn().mockResolvedValue(mockClubsResult()),
      getLastRoundScores: vi.fn().mockResolvedValue(mockLastRoundScores()),
    });

    const context = await buildRoundContext(client);

    expect(context.marketStatus).toBe("closed");
    expect(context.warnings).toContain("market-status: status closed");
  });

  it("skips last-round call when market round is 1", async () => {
    const lastRoundSpy = vi.fn().mockResolvedValue(mockLastRoundScores());
    const client = createClient({
      getMarketStatus: vi.fn().mockResolvedValue({ marketRound: 1, marketStatus: "open", defaultFormationId: 4 }),
      getMarketAthletes: vi.fn().mockResolvedValue(mockAthleteResult()),
      getMatches: vi.fn().mockResolvedValue(mockMatchesResult()),
      getClubs: vi.fn().mockResolvedValue(mockClubsResult()),
      getLastRoundScores: lastRoundSpy,
    });

    const context = await buildRoundContext(client);

    expect(context.lastRound).toBeNull();
    expect(lastRoundSpy).not.toHaveBeenCalled();
    expect(context.warnings).toContain("last-round-scores: rodada 1 não possui histórico anterior");
});

  it("aggregates last-round warnings instead of one entry per athlete", async () => {
    const client = createClient({
      getMarketStatus: vi.fn().mockResolvedValue({ marketRound: 5, marketStatus: "open", defaultFormationId: 4 }),
      getMarketAthletes: vi.fn().mockResolvedValueOnce({
        data: {
          athletes: [
            {
              id: 101,
              name: "Goleiro",
              positionId: 1,
              clubId: 10,
              price: 12.5,
              averageScore: 6.3,
              lastKnownScore: 8.2,
              scout: {},
            },
            {
              id: 202,
              name: "Atacante",
              positionId: 5,
              clubId: 20,
              price: 10,
              averageScore: 5,
              lastKnownScore: 7,
              scout: {},
            },
          ],
          coaches: [],
          clubsById: {
            10: { id: 10, name: "Flamengo", abbreviation: "FLA" },
            20: { id: 20, name: "Internacional", abbreviation: "INT" },
          },
        },
        warnings: [],
      } as ApiResult<NormalizedMarketAthletes>),
      getMatches: vi.fn().mockResolvedValue(mockMatchesResult()),
      getClubs: vi.fn().mockResolvedValue(mockClubsResult()),
      getLastRoundScores: vi.fn().mockResolvedValue({ data: [], warnings: [] }),
    });

    const context = await buildRoundContext(client);

    expect(context.warnings).toContain("last-round-scores: missing entries for 2 athletes");
  });
});
