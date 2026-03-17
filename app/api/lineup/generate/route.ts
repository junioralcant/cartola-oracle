import { NextResponse } from "next/server";
import { HttpCartolaApiClient } from "@/lib/cartola-api";
import {
  assertGenerateLineupRequest,
  buildRoundContext,
  GenerateLineupError,
  GenerateLineupResponse,
  LineupErrorResponse,
  scoreRoundContext,
} from "@/lib/domain";
import { HeuristicLineupOptimizer, LineupNotPossibleError } from "@/lib/optimizer";

const INVALID_REQUEST_MESSAGE = "Invalid lineup request; expected { budget: number, formation: string }";
const UPSTREAM_ERROR_MESSAGE = "Nao foi possivel gerar o time agora. Tente novamente em instantes.";

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
    const context = await buildRoundContext(client);
    contextWarnings = context.warnings;
    const scored = scoreRoundContext(context);

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
    if (error instanceof LineupNotPossibleError) {
      return lineupNotPossibleResponse(error, contextWarnings);
    }

    return technicalFailureResponse();
  }
}
