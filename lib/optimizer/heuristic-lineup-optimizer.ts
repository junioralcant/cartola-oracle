import { FORMATION_SLOTS, GeneratedLineup, Position, ScoredCoach, ScoredPlayer } from "../domain/types";
import { GenerateLineupInput, LineupOptimizer } from "./contracts";

const EPSILON = 1e-6;

interface CandidatePlayer extends ScoredPlayer {
  costCents: number;
}

interface CandidateCoach extends ScoredCoach {
  costCents: number;
}

interface WorkingLineup {
  players: CandidatePlayer[];
  coach: CandidateCoach;
}

interface CandidateChange {
  kind: "player" | "coach";
  currentId: number;
  replacementId: number;
  scoreGain: number;
  costIncrease: number;
}

const hasPlayerInLineup = (lineup: WorkingLineup, playerId: number): boolean =>
  lineup.players.some((player) => player.id === playerId);

const toCents = (value: number): number => Math.round(value * 100);

const fromCents = (value: number): number => Math.round(value) / 100;

const roundTo2 = (value: number): number => Math.round(value * 100) / 100;

const compareByScorePriceId = <T extends { score: number; price: number; id: number }>(a: T, b: T): number => {
  if (a.score !== b.score) {
    return b.score - a.score;
  }
  if (a.price !== b.price) {
    return a.price - b.price;
  }
  return a.id - b.id;
};

const isValidCandidate = (item: { price: number; score: number }): boolean =>
  Number.isFinite(item.price) && item.price > 0 && Number.isFinite(item.score);

const withCost = (player: ScoredPlayer): CandidatePlayer => ({ ...player, costCents: toCents(player.price) });

const withCoachCost = (coach: ScoredCoach): CandidateCoach => ({ ...coach, costCents: toCents(coach.price) });

const sortPlayers = (players: ScoredPlayer[]): CandidatePlayer[] =>
  players.filter(isValidCandidate).map(withCost).sort(compareByScorePriceId);

const sortCoaches = (coaches: ScoredCoach[]): CandidateCoach[] =>
  coaches.filter(isValidCandidate).map(withCoachCost).sort(compareByScorePriceId);

const totalCostCents = (lineup: WorkingLineup): number =>
  lineup.coach.costCents + lineup.players.reduce((sum, player) => sum + player.costCents, 0);

const totalScore = (lineup: WorkingLineup): number =>
  lineup.coach.score + lineup.players.reduce((sum, player) => sum + player.score, 0);

const isBetterLineup = (candidate: WorkingLineup, current: WorkingLineup): boolean => {
  const scoreDelta = totalScore(candidate) - totalScore(current);
  if (Math.abs(scoreDelta) > EPSILON) {
    return scoreDelta > 0;
  }

  const costDelta = totalCostCents(candidate) - totalCostCents(current);
  return costDelta > 0;
};

const lineupKey = (lineup: WorkingLineup): string => {
  const playerIds = lineup.players
    .map((player) => player.id)
    .sort((a, b) => a - b)
    .join(",");
  return `${playerIds}|${lineup.coach.id}`;
};

export class LineupNotPossibleError extends Error {
  readonly code = "LINEUP_NOT_POSSIBLE";

  constructor(
    message = "Nao foi possivel montar um time valido com esse orçamento e formação.",
  ) {
    super(message);
    this.name = "LineupNotPossibleError";
  }
}

export class HeuristicLineupOptimizer implements LineupOptimizer {
  generateLineup(input: GenerateLineupInput): GeneratedLineup {
    const budgetCents = toCents(input.budget);
    if (!Number.isFinite(input.budget) || input.budget <= 0) {
      throw new LineupNotPossibleError();
    }

    const slots = FORMATION_SLOTS[input.formation];
    if (!slots) {
      throw new LineupNotPossibleError();
    }

    const playersByPosition = this.groupPlayersByPosition(input.players);
    const coaches = sortCoaches(input.coaches);

    let lineup = this.buildInitialLineup(slots, playersByPosition, coaches);

    if (totalCostCents(lineup) > budgetCents) {
      lineup = this.fitBudget(lineup, budgetCents, playersByPosition, coaches);
    }

    if (totalCostCents(lineup) > budgetCents) {
      throw new LineupNotPossibleError();
    }

    lineup = this.improveLocally(lineup, budgetCents, playersByPosition, coaches);

    const finalCostCents = totalCostCents(lineup);
    return {
      formation: input.formation,
      players: lineup.players.map((player) => ({
        id: player.id,
        name: player.name,
        position: player.position,
        clubId: player.clubId,
        clubAbbreviation: player.clubAbbreviation,
        clubShieldUrl: player.clubShieldUrl,
        opponentClubAbbreviation: player.opponentClubAbbreviation,
        opponentClubShieldUrl: player.opponentClubShieldUrl,
        isHome: player.isHome,
        price: player.price,
        score: player.score,
        justification: player.justification,
      })),
      coach: {
        id: lineup.coach.id,
        name: lineup.coach.name,
        clubId: lineup.coach.clubId,
        clubAbbreviation: lineup.coach.clubAbbreviation,
        clubShieldUrl: lineup.coach.clubShieldUrl,
        price: lineup.coach.price,
        score: lineup.coach.score,
        justification: lineup.coach.justification,
      },
      totalCost: fromCents(finalCostCents),
      totalScore: roundTo2(totalScore(lineup)),
      remainingBudget: fromCents(budgetCents - finalCostCents),
    };
  }

  private groupPlayersByPosition(players: ScoredPlayer[]): Map<Position, CandidatePlayer[]> {
    const grouped = new Map<Position, CandidatePlayer[]>();
    for (const player of sortPlayers(players)) {
      const list = grouped.get(player.position) ?? [];
      list.push(player);
      grouped.set(player.position, list);
    }
    return grouped;
  }

  private buildInitialLineup(
    slots: Record<Position, number>,
    playersByPosition: Map<Position, CandidatePlayer[]>,
    coaches: CandidateCoach[],
  ): WorkingLineup {
    const selected: CandidatePlayer[] = [];

    for (const [position, count] of Object.entries(slots) as [Position, number][]) {
      const candidates = playersByPosition.get(position) ?? [];
      if (candidates.length < count) {
        throw new LineupNotPossibleError();
      }
      selected.push(...candidates.slice(0, count));
    }

    const bestCoach = coaches[0];
    if (!bestCoach) {
      throw new LineupNotPossibleError();
    }

    return { players: selected, coach: bestCoach };
  }

  private fitBudget(
    initial: WorkingLineup,
    budgetCents: number,
    playersByPosition: Map<Position, CandidatePlayer[]>,
    coaches: CandidateCoach[],
  ): WorkingLineup {
    let current = { ...initial, players: [...initial.players] };

    while (totalCostCents(current) > budgetCents) {
      const downgrade = this.pickBestDowngrade(current, playersByPosition, coaches);
      if (!downgrade) {
        break;
      }
      current = this.applyChange(current, downgrade, playersByPosition, coaches);
    }

    return current;
  }

  private pickBestDowngrade(
    lineup: WorkingLineup,
    playersByPosition: Map<Position, CandidatePlayer[]>,
    coaches: CandidateCoach[],
  ): CandidateChange | null {
    const candidates: CandidateChange[] = [];

    for (const current of lineup.players) {
      const options = playersByPosition.get(current.position) ?? [];
      for (const replacement of options) {
        if (replacement.id === current.id) {
          continue;
        }
        if (hasPlayerInLineup(lineup, replacement.id)) {
          continue;
        }
        const saving = current.costCents - replacement.costCents;
        if (saving <= 0) {
          continue;
        }
        const scoreLoss = current.score - replacement.score;
        candidates.push({
          kind: "player",
          currentId: current.id,
          replacementId: replacement.id,
          scoreGain: -scoreLoss,
          costIncrease: -saving,
        });
        if (scoreLoss <= 0) {
          break;
        }
      }
    }

    for (const replacement of coaches) {
      if (replacement.id === lineup.coach.id) {
        continue;
      }
      const saving = lineup.coach.costCents - replacement.costCents;
      if (saving <= 0) {
        continue;
      }
      const scoreLoss = lineup.coach.score - replacement.score;
      candidates.push({
        kind: "coach",
        currentId: lineup.coach.id,
        replacementId: replacement.id,
        scoreGain: -scoreLoss,
        costIncrease: -saving,
      });
      if (scoreLoss <= 0) {
        break;
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    return candidates.sort((a, b) => {
      const savingA = -a.costIncrease;
      const savingB = -b.costIncrease;
      const lossA = -a.scoreGain;
      const lossB = -b.scoreGain;
      const ratioA = lossA <= EPSILON ? Number.POSITIVE_INFINITY : savingA / lossA;
      const ratioB = lossB <= EPSILON ? Number.POSITIVE_INFINITY : savingB / lossB;

      if (ratioA !== ratioB) {
        return ratioB - ratioA;
      }
      if (savingA !== savingB) {
        return savingB - savingA;
      }
      if (a.scoreGain !== b.scoreGain) {
        return b.scoreGain - a.scoreGain;
      }
      return a.replacementId - b.replacementId;
    })[0];
  }

  private improveLocally(
    initial: WorkingLineup,
    budgetCents: number,
    playersByPosition: Map<Position, CandidatePlayer[]>,
    coaches: CandidateCoach[],
  ): WorkingLineup {
    let current = { ...initial, players: [...initial.players] };
    const seen = new Set<string>();

    while (true) {
      const key = lineupKey(current);
      if (seen.has(key)) {
        return current;
      }
      seen.add(key);

      const improvement = this.pickBestImprovement(current, budgetCents, playersByPosition, coaches);
      if (!improvement) {
        return current;
      }

      const next = this.applyChange(current, improvement, playersByPosition, coaches);
      if (!isBetterLineup(next, current) || totalCostCents(next) > budgetCents) {
        return current;
      }

      current = next;
    }
  }

  private pickBestImprovement(
    lineup: WorkingLineup,
    budgetCents: number,
    playersByPosition: Map<Position, CandidatePlayer[]>,
    coaches: CandidateCoach[],
  ): CandidateChange | null {
    const remaining = budgetCents - totalCostCents(lineup);
    const candidates: CandidateChange[] = [];

    for (const current of lineup.players) {
      const options = playersByPosition.get(current.position) ?? [];
      for (const replacement of options) {
        if (replacement.id === current.id) {
          continue;
        }
        if (hasPlayerInLineup(lineup, replacement.id)) {
          continue;
        }
        const costIncrease = replacement.costCents - current.costCents;
        if (costIncrease > remaining) {
          continue;
        }
        const scoreGain = replacement.score - current.score;
        if (scoreGain < -EPSILON) {
          continue;
        }
        candidates.push({
          kind: "player",
          currentId: current.id,
          replacementId: replacement.id,
          scoreGain,
          costIncrease,
        });
      }
    }

    for (const replacement of coaches) {
      if (replacement.id === lineup.coach.id) {
        continue;
      }
      const costIncrease = replacement.costCents - lineup.coach.costCents;
      if (costIncrease > remaining) {
        continue;
      }
      const scoreGain = replacement.score - lineup.coach.score;
      if (scoreGain < -EPSILON) {
        continue;
      }
      candidates.push({
        kind: "coach",
        currentId: lineup.coach.id,
        replacementId: replacement.id,
        scoreGain,
        costIncrease,
      });
    }

    if (candidates.length === 0) {
      return null;
    }

    return candidates.sort((a, b) => {
      if (Math.abs(a.scoreGain - b.scoreGain) > EPSILON) {
        return b.scoreGain - a.scoreGain;
      }
      if (a.costIncrease !== b.costIncrease) {
        return b.costIncrease - a.costIncrease;
      }
      return a.replacementId - b.replacementId;
    })[0];
  }

  private applyChange(
    lineup: WorkingLineup,
    change: CandidateChange,
    playersByPosition: Map<Position, CandidatePlayer[]>,
    coaches: CandidateCoach[],
  ): WorkingLineup {
    if (change.kind === "coach") {
      const replacement = coaches.find((coach) => coach.id === change.replacementId);
      if (!replacement) {
        return lineup;
      }
      return {
        players: [...lineup.players],
        coach: replacement,
      };
    }

    const currentPlayer = lineup.players.find((player) => player.id === change.currentId);
    if (!currentPlayer) {
      return lineup;
    }

    const pool = playersByPosition.get(currentPlayer.position) ?? [];
    const replacement = pool.find((player) => player.id === change.replacementId);
    if (!replacement) {
      return lineup;
    }

    return {
      coach: lineup.coach,
      players: lineup.players.map((player) =>
        player.id === change.currentId ? replacement : player,
      ),
    };
  }
}
