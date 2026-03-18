import { describe, expect, it } from "vitest";
import { HeuristicLineupOptimizer, LineupNotPossibleError } from "./heuristic-lineup-optimizer";
import type { Formation, Position, ScoredCoach, ScoredPlayer } from "../domain/types";

const makePlayer = (
  id: number,
  position: Position,
  price: number,
  score: number,
): ScoredPlayer => ({
  id,
  name: `P${id}`,
  position,
  clubId: id % 20,
  clubAbbreviation: "CLB",
  opponentClubAbbreviation: "RIV",
  isHome: id % 2 === 0,
  price,
  score,
  justification: "fixture",
});

const makeCoach = (id: number, price: number, score: number): ScoredCoach => ({
  id,
  name: `C${id}`,
  clubId: id % 20,
  clubAbbreviation: "CLB",
  price,
  score,
  justification: "fixture",
});

const slots = (formation: Formation): Record<Position, number> => {
  switch (formation) {
    case "4-3-3":
      return { GOL: 1, LAT: 2, ZAG: 2, MEI: 3, ATA: 3 };
    default:
      return { GOL: 1, LAT: 2, ZAG: 2, MEI: 3, ATA: 3 };
  }
};

const buildBasePlayers = (formation: Formation): ScoredPlayer[] => {
  const req = slots(formation);
  const result: ScoredPlayer[] = [];
  let id = 1;

  for (const [position, count] of Object.entries(req) as [Position, number][]) {
    for (let i = 0; i < count + 2; i += 1) {
      result.push(makePlayer(id, position, 5 + i, 8 - i * 0.2));
      id += 1;
    }
  }

  return result;
};

describe("HeuristicLineupOptimizer", () => {
  it("builds a valid lineup with 11 players and one coach", () => {
    const optimizer = new HeuristicLineupOptimizer();
    const formation: Formation = "4-3-3";

    const lineup = optimizer.generateLineup({
      budget: 200,
      formation,
      players: buildBasePlayers(formation),
      coaches: [makeCoach(1, 8, 7.5), makeCoach(2, 6, 7.2)],
    });

    expect(lineup.players).toHaveLength(11);
    expect(lineup.coach.id).toBe(1);
    expect(lineup.totalCost).toBeLessThanOrEqual(200);

    const positionCounts = lineup.players.reduce<Record<Position, number>>(
      (acc, player) => {
        acc[player.position] += 1;
        return acc;
      },
      { GOL: 0, LAT: 0, ZAG: 0, MEI: 0, ATA: 0 },
    );

    expect(positionCounts).toEqual(slots(formation));
  });

  it("respects budget by downgrading lineup when needed", () => {
    const optimizer = new HeuristicLineupOptimizer();
    const formation: Formation = "4-3-3";

    const lineup = optimizer.generateLineup({
      budget: 75,
      formation,
      players: buildBasePlayers(formation),
      coaches: [makeCoach(1, 9, 8), makeCoach(2, 5, 6.5)],
    });

    expect(lineup.totalCost).toBeLessThanOrEqual(75);
    expect(lineup.remainingBudget).toBeGreaterThanOrEqual(0);
  });

  it("throws LINEUP_NOT_POSSIBLE when there are not enough players for a required position", () => {
    const optimizer = new HeuristicLineupOptimizer();

    const players = buildBasePlayers("4-3-3").filter((player) => player.position !== "ATA");

    expect(() => {
      optimizer.generateLineup({
        budget: 120,
        formation: "4-3-3",
        players,
        coaches: [makeCoach(1, 8, 7)],
      });
    }).toThrowError(LineupNotPossibleError);

    try {
      optimizer.generateLineup({
        budget: 120,
        formation: "4-3-3",
        players,
        coaches: [makeCoach(1, 8, 7)],
      });
    } catch (error) {
      expect((error as LineupNotPossibleError).code).toBe("LINEUP_NOT_POSSIBLE");
    }
  });

  it("throws LINEUP_NOT_POSSIBLE when cheapest possible lineup is above budget", () => {
    const optimizer = new HeuristicLineupOptimizer();
    const formation: Formation = "4-3-3";

    const expensiveOnly = buildBasePlayers(formation).map((player) => ({
      ...player,
      price: 30,
      score: 8,
    }));

    expect(() => {
      optimizer.generateLineup({
        budget: 80,
        formation,
        players: expensiveOnly,
        coaches: [makeCoach(1, 20, 8)],
      });
    }).toThrowError(LineupNotPossibleError);
  });

  it("uses more budget as tie-break when total score is the same", () => {
    const optimizer = new HeuristicLineupOptimizer();

    const base = buildBasePlayers("4-3-3");
    const tiePlayers = base.map((player) => {
      if (player.position === "ATA") {
        return { ...player, score: 8, price: 6 };
      }
      return player;
    });

    tiePlayers.push(makePlayer(1001, "ATA", 9, 8));

    const lineup = optimizer.generateLineup({
      budget: 120,
      formation: "4-3-3",
      players: tiePlayers,
      coaches: [makeCoach(1, 6, 7)],
    });

    const ataIds = lineup.players.filter((player) => player.position === "ATA").map((p) => p.id);
    expect(ataIds).toContain(1001);
  });

  it("is deterministic for the same input", () => {
    const optimizer = new HeuristicLineupOptimizer();
    const input = {
      budget: 95,
      formation: "4-3-3" as Formation,
      players: buildBasePlayers("4-3-3"),
      coaches: [makeCoach(1, 8, 7.8), makeCoach(2, 7, 7.6)],
    };

    const first = optimizer.generateLineup(input);
    const second = optimizer.generateLineup(input);

    expect(second).toEqual(first);
  });

  it("applies deterministic budget-fitting swaps for constrained lineup", () => {
    const optimizer = new HeuristicLineupOptimizer();

    const fixedPlayers: ScoredPlayer[] = [
      makePlayer(1, "GOL", 8, 6),
      makePlayer(2, "LAT", 8, 6),
      makePlayer(3, "LAT", 8, 6),
      makePlayer(4, "ZAG", 8, 6),
      makePlayer(5, "ZAG", 8, 6),
      makePlayer(6, "MEI", 8, 6),
      makePlayer(7, "MEI", 8, 6),
      makePlayer(8, "MEI", 8, 6),
      makePlayer(9, "ATA", 20, 10),
      makePlayer(10, "ATA", 18, 9),
      makePlayer(11, "ATA", 16, 8),
      makePlayer(12, "ATA", 6, 7),
      makePlayer(13, "ATA", 14, 7.9),
    ];

    const lineup = optimizer.generateLineup({
      budget: 112,
      formation: "4-3-3",
      players: fixedPlayers,
      coaches: [makeCoach(1, 10, 5), makeCoach(2, 6, 4)],
    });

    const ataIds = lineup.players.filter((player) => player.position === "ATA").map((p) => p.id);
    expect(ataIds).toContain(9);
    expect(ataIds).toContain(11);
    expect(ataIds).toContain(12);
    expect(new Set(ataIds).size).toBe(3);
    expect(lineup.totalCost).toBeLessThanOrEqual(112);
  });

  it("handles decimal prices without floating drift in budget", () => {
    const optimizer = new HeuristicLineupOptimizer();
    const players = buildBasePlayers("4-3-3").map((player, index) => ({
      ...player,
      price: 5 + (index % 5) * 0.33,
    }));

    const lineup = optimizer.generateLineup({
      budget: 90.17,
      formation: "4-3-3",
      players,
      coaches: [makeCoach(1, 8.66, 7), makeCoach(2, 7.34, 6.5)],
    });

    expect(lineup.totalCost).toBeLessThanOrEqual(90.17);
    expect(lineup.remainingBudget).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(lineup.remainingBudget)).toBe(true);
  });
});
