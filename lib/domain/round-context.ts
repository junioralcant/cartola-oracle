import { ApiResult, CartolaApiClient, CartolaApiWarning, NormalizedAthlete, NormalizedCoach, NormalizedClub, NormalizedLastRoundScore, NormalizedMatch } from "../cartola-api/types";
import { MarketStatus, Position } from "./types";

const POSITION_ID_TO_POSITION: Record<number, Position> = {
  1: "GOL",
  2: "LAT",
  3: "ZAG",
  4: "MEI",
  5: "ATA",
};

interface MatchContext {
  isHome: boolean;
  opponentClubId: number;
}

export interface PlayerContext {
  id: number;
  name: string;
  position: Position;
  clubId: number;
  clubAbbreviation: string;
  clubShieldUrl?: string;
  opponentClubAbbreviation: string | null;
  opponentClubShieldUrl?: string;
  price: number;
  averageScore: number;
  lastRoundScore: number;
  scout: Record<string, number>;
  isHome: boolean;
  opponentClubId: number | null;
}

export interface CoachContext {
  id: number;
  name: string;
  clubId: number;
  clubAbbreviation: string;
  clubShieldUrl?: string;
  price: number;
  isHome: boolean;
  opponentClubId: number | null;
}

export interface RoundContext {
  marketRound: number;
  marketStatus: MarketStatus;
  lastRound: number | null;
  players: PlayerContext[];
  coaches: CoachContext[];
  warnings: string[];
}

const toWarningMessage = (warning: CartolaApiWarning): string => `${warning.endpoint}: ${warning.message}`;

const appendWarnings = (collector: string[], warnings: CartolaApiWarning[]): void => {
  collector.push(...warnings.map(toWarningMessage));
};

const buildMatchMap = (matches: NormalizedMatch[]): Map<number, MatchContext> => {
  const result = new Map<number, MatchContext>();
  for (const match of matches) {
    result.set(match.homeClubId, { isHome: true, opponentClubId: match.awayClubId });
    result.set(match.awayClubId, { isHome: false, opponentClubId: match.homeClubId });
  }
  return result;
};

const getClubAbbreviation = (club?: NormalizedClub): string => club?.abbreviation ?? "Unknown";
const getClubShieldUrl = (club?: NormalizedClub): string | undefined => club?.shieldUrl;

const resolvePosition = (positionId: number): Position | undefined => POSITION_ID_TO_POSITION[positionId];

const mapAthlete = (
  athlete: NormalizedAthlete,
  clubsById: Record<number, NormalizedClub>,
  matchMap: Map<number, MatchContext>,
  lastRoundScores: Map<number, NormalizedLastRoundScore>,
  warnings: string[],
  lastRoundAvailable: boolean,
  missingLastRoundEntries: Set<number>,
): PlayerContext | null => {
  const position = resolvePosition(athlete.positionId);
  if (!position) {
    warnings.push(`player: unsupported position ${athlete.positionId} for athlete ${athlete.name}`);
    return null;
  }

  const club = clubsById[athlete.clubId];
  if (!club) {
    warnings.push(`clubs: missing data for club ${athlete.clubId}`);
  }

  const match = matchMap.get(athlete.clubId);
  if (!match) {
    warnings.push(`matches: missing matchup for club ${athlete.clubId}`);
  }
  const opponentClub = match ? clubsById[match.opponentClubId] : undefined;

  const lastRoundEntry = lastRoundScores.get(athlete.id);
  if (lastRoundAvailable && !lastRoundEntry) {
    missingLastRoundEntries.add(athlete.id);
  }

  return {
    id: athlete.id,
    name: athlete.name,
    position,
    clubId: athlete.clubId,
    clubAbbreviation: getClubAbbreviation(club),
    clubShieldUrl: getClubShieldUrl(club),
    opponentClubAbbreviation: opponentClub ? getClubAbbreviation(opponentClub) : null,
    opponentClubShieldUrl: getClubShieldUrl(opponentClub),
    price: athlete.price,
    averageScore: athlete.averageScore,
    lastRoundScore: lastRoundEntry?.score ?? athlete.lastKnownScore,
    scout: athlete.scout,
    isHome: match?.isHome ?? false,
    opponentClubId: match?.opponentClubId ?? null,
  };
};

const mapCoach = (
  coach: NormalizedCoach,
  clubsById: Record<number, NormalizedClub>,
  matchMap: Map<number, MatchContext>,
  warnings: string[],
): CoachContext => {
  const club = clubsById[coach.clubId];
  if (!club) {
    warnings.push(`clubs: missing data for club ${coach.clubId}`);
  }

  const match = matchMap.get(coach.clubId);
  if (!match) {
    warnings.push(`matches: missing matchup for coach ${coach.id}`);
  }

  return {
    id: coach.id,
    name: coach.name,
    clubId: coach.clubId,
    clubAbbreviation: getClubAbbreviation(club),
    clubShieldUrl: getClubShieldUrl(club),
    price: coach.price,
    isHome: match?.isHome ?? false,
    opponentClubId: match?.opponentClubId ?? null,
  };
};

export async function buildRoundContext(client: CartolaApiClient): Promise<RoundContext> {
  const warnings: string[] = [];
  const status = await client.getMarketStatus();
  if (status.marketStatus !== "open") {
    warnings.push(`market-status: status ${status.marketStatus}`);
  }

  const lastRound = status.marketRound > 1 ? status.marketRound - 1 : null;
  if (lastRound === null) {
    warnings.push("last-round-scores: rodada 1 não possui histórico anterior");
  }

  const [athletesResult, matchesResult, clubsResult, lastRoundScoresResult] = await Promise.all([
    client.getMarketAthletes(),
    client.getMatches(),
    client.getClubs(),
    lastRound === null
      ? Promise.resolve({ data: [], warnings: [] } as ApiResult<NormalizedLastRoundScore[]>)
      : client.getLastRoundScores(lastRound),
  ]);

  appendWarnings(warnings, athletesResult.warnings);
  appendWarnings(warnings, matchesResult.warnings);
  appendWarnings(warnings, clubsResult.warnings);
  appendWarnings(warnings, lastRoundScoresResult.warnings);

  const clubsById: Record<number, NormalizedClub> = {
    ...clubsResult.data,
    ...athletesResult.data.clubsById,
  };
  const matchMap = buildMatchMap(matchesResult.data);
  const lastRoundScoresMap = new Map<number, NormalizedLastRoundScore>();
  for (const entry of lastRoundScoresResult.data) {
    lastRoundScoresMap.set(entry.athleteId, entry);
  }

  const players: PlayerContext[] = [];
  const missingLastRoundEntries = new Set<number>();
  for (const athlete of athletesResult.data.athletes) {
    const context = mapAthlete(
      athlete,
      clubsById,
      matchMap,
      lastRoundScoresMap,
      warnings,
      lastRound !== null,
      missingLastRoundEntries,
    );
    if (context) {
      players.push(context);
    }
  }

  if (lastRound !== null && missingLastRoundEntries.size > 0) {
    warnings.push(`last-round-scores: missing entries for ${missingLastRoundEntries.size} athletes`);
  }

  const coaches = athletesResult.data.coaches.map((coach) =>
    mapCoach(coach, clubsById, matchMap, warnings),
  );

  return {
    marketRound: status.marketRound,
    marketStatus: status.marketStatus,
    lastRound,
    players,
    coaches,
    warnings,
  };
}
