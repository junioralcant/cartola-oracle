import { NextResponse } from "next/server";
import { HttpCartolaApiClient } from "@/lib/cartola-api";
import { buildRoundContext } from "@/lib/domain";
import { MarketStatus } from "@/lib/domain/types";

export const STATUS_UNAVAILABLE_MESSAGE =
  "Nao foi possivel carregar o status da rodada no momento. Tente novamente em instantes.";

type RoundStatusResponse = {
  marketRound: number;
  marketStatus: MarketStatus;
};

type RoundStatusErrorResponse = {
  error: {
    code: "STATUS_UNAVAILABLE";
    message: string;
  };
};

export async function GET(): Promise<NextResponse<RoundStatusResponse | RoundStatusErrorResponse>> {
  try {
    const client = new HttpCartolaApiClient();
    const context = await buildRoundContext(client);
    return NextResponse.json(
      {
        marketRound: context.marketRound,
        marketStatus: context.marketStatus,
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "STATUS_UNAVAILABLE",
          message: STATUS_UNAVAILABLE_MESSAGE,
        },
      },
      { status: 503 },
    );
  }
}
