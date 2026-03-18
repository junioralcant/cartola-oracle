import { NextResponse } from "next/server";
import { HttpCartolaApiClient } from "@/lib/cartola-api";
import {
  assertGenerateLineupRequest,
  GenerateLineupRequest,
  buildRoundContext,
  GenerateLineupError,
  GenerateLineupResponse,
  LineupErrorResponse,
  scoreRoundContext,
} from "@/lib/domain";
import { FORMATION_SLOTS, GeneratedLineup, Position, ScoredCoach, ScoredPlayer } from "@/lib/domain/types";
import { HeuristicLineupOptimizer, LineupNotPossibleError } from "@/lib/optimizer";

const INVALID_REQUEST_MESSAGE = "Invalid lineup request; expected { budget: number, formation: string }";
const UPSTREAM_ERROR_MESSAGE = "Nao foi possivel gerar o time agora. Tente novamente em instantes.";
const PARTIAL_WARNING_PREFIX = "lineup-partial:";

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

const formatMissingSlots = (missingSlots: Record<Position, number>): string =>
  (Object.entries(missingSlots) as [Position, number][])
    .filter(([, count]) => count > 0)
    .map(([position, count]) => `${position}:${count}`)
    .join(", ");

const buildPartialLineup = (
  request: GenerateLineupRequest,
  players: ScoredPlayer[],
  coaches: ScoredCoach[],
): { lineup: GeneratedLineup; warnings: string[] } | null => {
  const slots = FORMATION_SLOTS[request.formation];
  const validPlayers = players.filter(isValidCandidate).sort(compareByScorePriceId);
  const playersByPosition = new Map<Position, ScoredPlayer[]>();

  for (const player of validPlayers) {
    const list = playersByPosition.get(player.position) ?? [];
    list.push(player);
    playersByPosition.set(player.position, list);
  }

  const selectedPlayers: ScoredPlayer[] = [];
  const selectedIds = new Set<number>();
  const missingSlots: Record<Position, number> = { GOL: 0, LAT: 0, ZAG: 0, MEI: 0, ATA: 0 };
  let remainingBudgetCents = toCents(request.budget);

  for (const [position, requiredCount] of Object.entries(slots) as [Position, number][]) {
    const candidates = playersByPosition.get(position) ?? [];

    for (let selectedForPosition = 0; selectedForPosition < requiredCount; selectedForPosition += 1) {
      const pick = candidates.find((candidate) => {
        if (selectedIds.has(candidate.id)) {
          return false;
        }

        const priceCents = toCents(candidate.price);
        return priceCents <= remainingBudgetCents;
      });

      if (!pick) {
        missingSlots[position] += 1;
        continue;
      }

      selectedPlayers.push(pick);
      selectedIds.add(pick.id);
      remainingBudgetCents -= toCents(pick.price);
    }
  }

  const affordableCoaches = coaches
    .filter(isValidCandidate)
    .sort(compareByScorePriceId)
    .filter((coach) => toCents(coach.price) <= remainingBudgetCents);
  const coach = affordableCoaches[0];
  if (!coach) {
    return null;
  }

  const totalCostCents =
    selectedPlayers.reduce((sum, player) => sum + toCents(player.price), 0) + toCents(coach.price);
  const totalScore = selectedPlayers.reduce((sum, player) => sum + player.score, coach.score);
  const totalMissing = Object.values(missingSlots).reduce((sum, value) => sum + value, 0);
  const warnings: string[] = [];
  if (totalMissing > 0) {
    warnings.push(
      `${PARTIAL_WARNING_PREFIX} selected ${selectedPlayers.length}/11 players; missing slots ${formatMissingSlots(missingSlots)}`,
    );
  }

  return {
    lineup: {
      formation: request.formation,
      players: selectedPlayers,
      coach,
      totalCost: fromCents(totalCostCents),
      totalScore: roundTo2(totalScore),
      remainingBudget: fromCents(toCents(request.budget) - totalCostCents),
    },
    warnings,
  };
};

const buildExplanations = (response: GenerateLineupResponse): string[] => {
  const topPlayers = [...response.lineup.players]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((player) => player.name);

  const explanations = [
    `Time otimizado na formacao ${response.summary.formation} com foco em score total e uso eficiente do orcamento.`,
  ];

  if (topPlayers.length > 0) {
    explanations.push(`Destaques da escalacao: ${topPlayers.join(", ")}.`);
  }

  if (response.warnings.length > 0) {
    explanations.push("Alguns dados contextuais estavam incompletos e o algoritmo aplicou fallback automatico.");
  }

  if (response.isPartial) {
    explanations.push("Time parcial: nao havia atletas provaveis suficientes para completar todos os slots.");
  }

  return explanations;
};

const invalidRequestResponse = (message: string): NextResponse<LineupErrorResponse> => {
  const error: GenerateLineupError = {
    code: "INVALID_REQUEST",
    message,
  };

  return NextResponse.json({ error, warnings: [] }, { status: 400 });
};

const lineupNotPossibleResponse = (error: LineupNotPossibleError, warnings: string[]): NextResponse<LineupErrorResponse> =>
  NextResponse.json(
    {
      error: {
        code: error.code,
        message: error.message,
      },
      warnings,
    },
    { status: 422 },
  );

const technicalFailureResponse = (): NextResponse<LineupErrorResponse> =>
  NextResponse.json(
    {
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: UPSTREAM_ERROR_MESSAGE,
      },
      warnings: [],
    },
    { status: 503 },
  );

export async function POST(request: Request): Promise<NextResponse<GenerateLineupResponse | LineupErrorResponse>> {
  let payload: unknown;
  let contextWarnings: string[] = [];
  let context: Awaited<ReturnType<typeof buildRoundContext>> | null = null;
  let scored: ReturnType<typeof scoreRoundContext> | null = null;

  try {
    payload = await request.json();
  } catch {
    return invalidRequestResponse(INVALID_REQUEST_MESSAGE);
  }

  try {
    assertGenerateLineupRequest(payload);
  } catch {
    return invalidRequestResponse(INVALID_REQUEST_MESSAGE);
  }

  try {
    const client = new HttpCartolaApiClient();
    context = await buildRoundContext(client);
    contextWarnings = context.warnings;
    scored = scoreRoundContext(context);

    const optimizer = new HeuristicLineupOptimizer();
    const lineup = optimizer.generateLineup({
      budget: payload.budget,
      formation: payload.formation,
      players: scored.players,
      coaches: scored.coaches,
    });

    const response: GenerateLineupResponse = {
      marketRound: context.marketRound,
      marketStatus: context.marketStatus,
      isPartial: false,
      lineup,
      summary: {
        formation: payload.formation,
        totalCost: lineup.totalCost,
        remainingBudget: lineup.remainingBudget,
        totalScore: lineup.totalScore,
      },
      warnings: context.warnings,
      explanations: [],
    };

    response.explanations = buildExplanations(response);

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    if (error instanceof LineupNotPossibleError && context && scored) {
      const partial = buildPartialLineup(payload, scored.players, scored.coaches);
      if (partial) {
        const response: GenerateLineupResponse = {
          marketRound: context.marketRound,
          marketStatus: context.marketStatus,
          isPartial: true,
          lineup: partial.lineup,
          summary: {
            formation: payload.formation,
            totalCost: partial.lineup.totalCost,
            remainingBudget: partial.lineup.remainingBudget,
            totalScore: partial.lineup.totalScore,
          },
          warnings: [...contextWarnings, ...partial.warnings],
          explanations: [],
        };
        response.explanations = buildExplanations(response);
        return NextResponse.json(response, { status: 200 });
      }
      return lineupNotPossibleResponse(error, contextWarnings);
    }

    return technicalFailureResponse();
  }
}
