import { describe, expect, it } from "vitest";
import { calculateCoachScore, calculatePlayerScore, scoreRoundContext } from "./score-engine";
import type { RoundContext } from "./round-context";

const baseContext = (): RoundContext => ({
  marketRound: 5,
  marketStatus: "open",
  lastRound: 4,
  players: [
    {
      id: 123,
      name: "Pedro",
      position: "ATA",
      clubId: 10,
      clubAbbreviation: "FLA",
      opponentClubAbbreviation: "INT",
      price: 12.5,
      averageScore: 6.3,
      lastRoundScore: 8.2,
      scout: { G: 1 },
      isHome: true,
      opponentClubId: 20,
    },
    {
      id: 200,
      name: "Rival",
      position: "ZAG",
      clubId: 20,
      clubAbbreviation: "INT",
      opponentClubAbbreviation: "FLA",
      price: 8.5,
      averageScore: 4.2,
      lastRoundScore: 3.5,
      scout: {},
      isHome: false,
      opponentClubId: 10,
    },
    {
      id: 300,
      name: "Meia Bom",
      position: "MEI",
      clubId: 30,
      clubAbbreviation: "PAL",
      opponentClubAbbreviation: "FOR",
      price: 10.5,
      averageScore: 5.5,
      lastRoundScore: 6.1,
      scout: {},
      isHome: false,
      opponentClubId: 40,
    },
  ],
  coaches: [
    {
      id: 999,
      name: "Tecnico X",
      clubId: 10,
      clubAbbreviation: "FLA",
      price: 8,
      isHome: true,
      opponentClubId: 20,
    },
  ],
  warnings: [],
});

describe("score-engine", () => {
  it("calculates player score in 0-10 scale with default balanced weights", () => {
    const context = baseContext();
    const player = context.players[0];

    const scored = calculatePlayerScore(player, context);

    expect(scored.score).toBeCloseTo(8.43, 2);
    expect(scored.justification).toContain("confronto favoravel");
    expect(scored.justification).toContain("bom custo-beneficio");
    expect(scored.justification.endsWith(".")).toBe(true);
  });

  it("calculates coach score using club context and confrontation", () => {
    const context = baseContext();
    const coach = context.coaches[0];

    const scored = calculateCoachScore(coach, context);

    expect(scored.score).toBeCloseTo(10, 2);
    expect(scored.justification).toContain("confronto favoravel para o clube");
  });

  it("falls back to neutral opponent strength when opponent is missing", () => {
    const context = baseContext();
    const playerWithoutOpponent = {
      ...context.players[0],
      opponentClubId: null,
      isHome: false,
    };

    const scored = calculatePlayerScore(playerWithoutOpponent, context);

    expect(scored.score).toBeGreaterThanOrEqual(0);
    expect(scored.score).toBeLessThanOrEqual(10);
    expect(scored.justification.length).toBeGreaterThan(10);
  });

  it("scores all eligible players and coaches from round context", () => {
    const context = baseContext();

    const scored = scoreRoundContext(context);

    expect(scored.players).toHaveLength(context.players.length);
    expect(scored.coaches).toHaveLength(context.coaches.length);
    for (const player of scored.players) {
      expect(player.score).toBeGreaterThanOrEqual(0);
      expect(player.score).toBeLessThanOrEqual(10);
    }
    for (const coach of scored.coaches) {
      expect(coach.score).toBeGreaterThanOrEqual(0);
      expect(coach.score).toBeLessThanOrEqual(10);
    }
  });
});
