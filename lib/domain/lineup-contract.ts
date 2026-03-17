import { Formation, GeneratedLineup, MarketStatus, SUPPORTED_FORMATIONS } from "./types";

export interface GenerateLineupRequest {
  budget: number;
  formation: Formation;
}

export interface GenerateLineupSummary {
  formation: Formation;
  totalCost: number;
  remainingBudget: number;
  totalScore: number;
}

export interface GenerateLineupResponse {
  marketRound: number;
  marketStatus: MarketStatus;
  lineup: GeneratedLineup;
  summary: GenerateLineupSummary;
  warnings: string[];
  explanations: string[];
}

export interface GenerateLineupError {
  code: string;
  message: string;
}

export interface LineupErrorResponse {
  error: GenerateLineupError;
  warnings: string[];
}

export const isSupportedFormation = (value: unknown): value is Formation =>
  typeof value === "string" && SUPPORTED_FORMATIONS.includes(value as Formation);

const isPositiveNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

export const isGenerateLineupRequest = (value: unknown): value is GenerateLineupRequest => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<GenerateLineupRequest>;
  return isPositiveNumber(candidate.budget) && isSupportedFormation(candidate.formation);
};

export function assertGenerateLineupRequest(value: unknown): asserts value is GenerateLineupRequest {
  if (!isGenerateLineupRequest(value)) {
    throw new Error("Invalid lineup request; expected { budget: number, formation: string }");
  }
}
