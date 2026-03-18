import { MarketStatus } from "../domain/types";

export type CartolaEndpoint =
  | "market-status"
  | "market-athletes"
  | "last-round-scores"
  | "matches"
  | "clubs";

export interface CartolaApiWarning {
  endpoint: CartolaEndpoint;
  message: string;
}

export interface ApiResult<T> {
  data: T;
  warnings: CartolaApiWarning[];
}

export interface NormalizedMarketStatus {
  marketRound: number;
  marketStatus: MarketStatus;
  defaultFormationId: number;
}

export interface NormalizedAthlete {
  id: number;
  name: string;
  positionId: number;
  clubId: number;
  price: number;
  averageScore: number;
  lastKnownScore: number;
  scout: Record<string, number>;
}

export interface NormalizedCoach {
  id: number;
  name: string;
  clubId: number;
  price: number;
}

export interface NormalizedClub {
  id: number;
  name: string;
  abbreviation: string;
  shieldUrl?: string;
}

export interface NormalizedMarketAthletes {
  athletes: NormalizedAthlete[];
  coaches: NormalizedCoach[];
  clubsById: Record<number, NormalizedClub>;
}

export interface NormalizedLastRoundScore {
  athleteId: number;
  score: number;
  scout: Record<string, number>;
}

export interface NormalizedMatch {
  homeClubId: number;
  awayClubId: number;
  matchDate: string;
  local: string;
}

export interface CartolaApiClient {
  getMarketStatus(): Promise<NormalizedMarketStatus>;
  getMarketAthletes(): Promise<ApiResult<NormalizedMarketAthletes>>;
  getLastRoundScores(round: number): Promise<ApiResult<NormalizedLastRoundScore[]>>;
  getMatches(): Promise<ApiResult<NormalizedMatch[]>>;
  getClubs(): Promise<ApiResult<Record<number, NormalizedClub>>>;
}
