import { CoachContext, PlayerContext, RoundContext } from "./round-context";
import { CoachScoreFactor, PlayerScoreFactor, ScoredCoach, ScoredPlayer, ScoreWeights } from "./types";

interface ScoreFactorDescriptor<TFactor extends string> {
  factor: TFactor;
  value: number;
  weight: number;
  positiveLabel: string;
  negativeLabel: string;
}

interface ScoringEnvironment {
  clubStrengthById: Map<number, number>;
}

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  player: {
    lastRound: 0.24,
    average: 0.22,
    value: 0.18,
    opponent: 0.14,
    clubStrength: 0.14,
    home: 0.08,
  },
  coach: {
    value: 0.24,
    opponent: 0.28,
    clubStrength: 0.32,
    home: 0.16,
  },
};

const clamp = (value: number, min = 0, max = 1): number => Math.max(min, Math.min(max, value));

const roundTo2 = (value: number): number => Math.round(value * 100) / 100;

const mergeWeights = (weights?: Partial<ScoreWeights>): ScoreWeights => ({
  player: {
    ...DEFAULT_SCORE_WEIGHTS.player,
    ...weights?.player,
  },
  coach: {
    ...DEFAULT_SCORE_WEIGHTS.coach,
    ...weights?.coach,
  },
});

const getOpponentStrength = (clubId: number | null, env: ScoringEnvironment): number =>
  clubId === null ? 0.5 : env.clubStrengthById.get(clubId) ?? 0.5;

const getClubStrength = (clubId: number, env: ScoringEnvironment): number =>
  env.clubStrengthById.get(clubId) ?? 0.5;

const toOpponentFavorability = (opponentStrength: number): number => clamp(1 - opponentStrength);

const toHomeValue = (isHome: boolean): number => (isHome ? 1 : 0.45);

const toAverageValue = (averageScore: number): number => clamp(averageScore / 10);

const toLastRoundValue = (lastRoundScore: number): number => clamp(lastRoundScore / 12);

const toValueForMoney = (scoreReference: number, price: number): number => {
  const safePrice = Math.max(price, 0.1);
  return clamp((scoreReference / safePrice) * 2);
};

const buildScoringEnvironment = (context: RoundContext): ScoringEnvironment => {
  const clubRawStrength = new Map<number, number[]>();
  for (const player of context.players) {
    const existing = clubRawStrength.get(player.clubId) ?? [];
    existing.push(player.averageScore);
    clubRawStrength.set(player.clubId, existing);
  }

  const averagesByClub = new Map<number, number>();
  for (const [clubId, scores] of clubRawStrength.entries()) {
    const avg = scores.reduce((sum, current) => sum + current, 0) / scores.length;
    averagesByClub.set(clubId, avg);
  }

  const allAverages = [...averagesByClub.values()];
  if (allAverages.length === 0) {
    return { clubStrengthById: new Map<number, number>() };
  }

  const min = Math.min(...allAverages);
  const max = Math.max(...allAverages);
  const denominator = max - min;

  const normalized = new Map<number, number>();
  for (const [clubId, value] of averagesByClub.entries()) {
    const strength = denominator === 0 ? 0.5 : (value - min) / denominator;
    normalized.set(clubId, clamp(strength));
  }

  return { clubStrengthById: normalized };
};

const buildJustification = <TFactor extends string>(
  descriptors: ScoreFactorDescriptor<TFactor>[],
): string => {
  const topFactors = [...descriptors]
    .sort((a, b) => Math.abs((b.value - 0.5) * b.weight) - Math.abs((a.value - 0.5) * a.weight))
    .slice(0, 3)
    .map((factor) => (factor.value >= 0.55 ? factor.positiveLabel : factor.negativeLabel));

  if (topFactors.length === 0) {
    return "Sem fatores relevantes para justificar o score.";
  }

  return `${topFactors.join(", ")}.`;
};

const weightedSum = <TFactor extends string>(descriptors: ScoreFactorDescriptor<TFactor>[]): number =>
  descriptors.reduce((sum, descriptor) => sum + descriptor.value * descriptor.weight, 0);

export function calculatePlayerScore(
  player: PlayerContext,
  context: RoundContext,
  weights?: Partial<ScoreWeights>,
): ScoredPlayer {
  const mergedWeights = mergeWeights(weights);
  const env = buildScoringEnvironment(context);
  const opponentStrength = getOpponentStrength(player.opponentClubId, env);
  const clubStrength = getClubStrength(player.clubId, env);

  const factors: ScoreFactorDescriptor<PlayerScoreFactor>[] = [
    {
      factor: "lastRound",
      value: toLastRoundValue(player.lastRoundScore),
      weight: mergedWeights.player.lastRound,
      positiveLabel: "ultima rodada forte",
      negativeLabel: "ultima rodada fraca",
    },
    {
      factor: "average",
      value: toAverageValue(player.averageScore),
      weight: mergedWeights.player.average,
      positiveLabel: "media consistente",
      negativeLabel: "media baixa",
    },
    {
      factor: "value",
      value: toValueForMoney(player.averageScore, player.price),
      weight: mergedWeights.player.value,
      positiveLabel: "bom custo-beneficio",
      negativeLabel: "custo-beneficio arriscado",
    },
    {
      factor: "opponent",
      value: toOpponentFavorability(opponentStrength),
      weight: mergedWeights.player.opponent,
      positiveLabel: "confronto favoravel",
      negativeLabel: "confronto dificil",
    },
    {
      factor: "clubStrength",
      value: clubStrength,
      weight: mergedWeights.player.clubStrength,
      positiveLabel: "clube em boa fase",
      negativeLabel: "clube em fase instavel",
    },
    {
      factor: "home",
      value: toHomeValue(player.isHome),
      weight: mergedWeights.player.home,
      positiveLabel: "joga em casa",
      negativeLabel: "joga fora",
    },
  ];

  const score = roundTo2(clamp(weightedSum(factors), 0, 1) * 10);

  return {
    id: player.id,
    name: player.name,
    position: player.position,
    clubId: player.clubId,
    clubAbbreviation: player.clubAbbreviation,
    price: player.price,
    score,
    justification: buildJustification(factors),
  };
}

export function calculateCoachScore(
  coach: CoachContext,
  context: RoundContext,
  weights?: Partial<ScoreWeights>,
): ScoredCoach {
  const mergedWeights = mergeWeights(weights);
  const env = buildScoringEnvironment(context);
  const opponentStrength = getOpponentStrength(coach.opponentClubId, env);
  const clubStrength = getClubStrength(coach.clubId, env);

  const clubPlayers = context.players.filter((player) => player.clubId === coach.clubId);
  const clubAverage = clubPlayers.length
    ? clubPlayers.reduce((sum, player) => sum + player.averageScore, 0) / clubPlayers.length
    : 5;

  const factors: ScoreFactorDescriptor<CoachScoreFactor>[] = [
    {
      factor: "value",
      value: toValueForMoney(clubAverage, coach.price),
      weight: mergedWeights.coach.value,
      positiveLabel: "tecnico com bom custo-beneficio",
      negativeLabel: "tecnico caro para o retorno esperado",
    },
    {
      factor: "opponent",
      value: toOpponentFavorability(opponentStrength),
      weight: mergedWeights.coach.opponent,
      positiveLabel: "confronto favoravel para o clube",
      negativeLabel: "confronto dificil para o clube",
    },
    {
      factor: "clubStrength",
      value: clubStrength,
      weight: mergedWeights.coach.clubStrength,
      positiveLabel: "clube em boa fase",
      negativeLabel: "clube em fase instavel",
    },
    {
      factor: "home",
      value: toHomeValue(coach.isHome),
      weight: mergedWeights.coach.home,
      positiveLabel: "mandante na rodada",
      negativeLabel: "joga fora nesta rodada",
    },
  ];

  const score = roundTo2(clamp(weightedSum(factors), 0, 1) * 10);

  return {
    id: coach.id,
    name: coach.name,
    clubId: coach.clubId,
    clubAbbreviation: coach.clubAbbreviation,
    price: coach.price,
    score,
    justification: buildJustification(factors),
  };
}

export function scoreRoundContext(
  context: RoundContext,
  weights?: Partial<ScoreWeights>,
): { players: ScoredPlayer[]; coaches: ScoredCoach[] } {
  return {
    players: context.players.map((player) => calculatePlayerScore(player, context, weights)),
    coaches: context.coaches.map((coach) => calculateCoachScore(coach, context, weights)),
  };
}
