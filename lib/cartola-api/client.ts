import { MarketStatus } from "../domain/types";
import { CartolaApiError } from "./errors";
import {
  ApiResult,
  CartolaApiClient,
  CartolaApiWarning,
  CartolaEndpoint,
  NormalizedAthlete,
  NormalizedClub,
  NormalizedCoach,
  NormalizedLastRoundScore,
  NormalizedMarketAthletes,
  NormalizedMarketStatus,
  NormalizedMatch,
} from "./types";

const API_BASE_URL = "https://api.cartola.globo.com";
const ELIGIBLE_ATHLETE_STATUS_ID = 7;

export interface HttpCartolaApiClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  retryCount?: number;
  fetchFn?: typeof fetch;
}

class HttpStatusError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "HttpStatusError";
    this.statusCode = statusCode;
  }
}

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const asString = (value: unknown): string | null => (typeof value === "string" ? value : null);

const selectShieldUrl = (escudos: unknown): string | null => {
  if (!isObjectRecord(escudos)) {
    return null;
  }

  for (const size of ["60x60", "45x45", "30x30"]) {
    const candidate = asString(escudos[size]);
    if (candidate) {
      return candidate;
    }
  }

  return null;
};

const asScout = (value: unknown): Record<string, number> => {
  if (!isObjectRecord(value)) {
    return {};
  }

  const scout: Record<string, number> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    const numericValue = asNumber(rawValue);
    if (numericValue !== null) {
      scout[key] = numericValue;
    }
  }

  return scout;
};

const toMarketStatus = (statusCode: number): MarketStatus => {
  switch (statusCode) {
    case 1:
      return "open";
    case 2:
      return "closed";
    case 3:
      return "maintenance";
    default:
      return "paused";
  }
};

export class HttpCartolaApiClient implements CartolaApiClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retryCount: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: HttpCartolaApiClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? API_BASE_URL;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.retryCount = options.retryCount ?? 1;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async getMarketStatus(): Promise<NormalizedMarketStatus> {
    const payload = await this.fetchJson<unknown>(this.buildUrl("/mercado/status"), "market-status");
    return normalizeMarketStatus(payload);
  }

  async getMarketAthletes(): Promise<ApiResult<NormalizedMarketAthletes>> {
    const payload = await this.fetchJson<unknown>(
      this.buildUrl("/atletas/mercado"),
      "market-athletes",
    );
    return normalizeMarketAthletes(payload);
  }

  async getLastRoundScores(round: number): Promise<ApiResult<NormalizedLastRoundScore[]>> {
    try {
      const payload = await this.fetchJson<unknown>(
        this.buildUrl(`/atletas/pontuados/${round}`),
        "last-round-scores",
      );
      return normalizeLastRoundScores(payload);
    } catch (error) {
      return {
        data: [],
        warnings: [toWarning("last-round-scores", error)],
      };
    }
  }

  async getMatches(): Promise<ApiResult<NormalizedMatch[]>> {
    try {
      const payload = await this.fetchJson<unknown>(this.buildUrl("/partidas"), "matches");
      return normalizeMatches(payload);
    } catch (error) {
      return {
        data: [],
        warnings: [toWarning("matches", error)],
      };
    }
  }

  async getClubs(): Promise<ApiResult<Record<number, NormalizedClub>>> {
    try {
      const payload = await this.fetchJson<unknown>(this.buildUrl("/clubes"), "clubs");
      return normalizeClubs(payload);
    } catch (error) {
      return {
        data: {},
        warnings: [toWarning("clubs", error)],
      };
    }
  }

  private async fetchJson<T>(url: string, endpoint: CartolaEndpoint): Promise<T> {
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= this.retryCount; attempt += 1) {
      try {
        return await this.fetchJsonOnce<T>(url, endpoint);
      } catch (error) {
        lastError = error;
        if (!shouldRetry(error) || attempt === this.retryCount) {
          throw this.toCartolaApiError(error, endpoint);
        }
      }
    }

    throw this.toCartolaApiError(lastError, endpoint);
  }

  private buildUrl(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  private async fetchJsonOnce<T>(url: string, endpoint: CartolaEndpoint): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn(url, {
        method: "GET",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new HttpStatusError(response.status, `${endpoint} failed with HTTP ${response.status}`);
      }

      try {
        return (await response.json()) as T;
      } catch {
        throw new CartolaApiError({
          endpoint,
          type: "parse",
          message: `${endpoint} returned an invalid JSON payload`,
        });
      }
    } finally {
      clearTimeout(timer);
    }
  }

  private toCartolaApiError(error: unknown, endpoint: CartolaEndpoint): CartolaApiError {
    if (error instanceof CartolaApiError) {
      return error;
    }

    if (error instanceof HttpStatusError) {
      return new CartolaApiError({
        endpoint,
        type: "http",
        statusCode: error.statusCode,
        message: error.message,
      });
    }

    if (isAbortError(error)) {
      return new CartolaApiError({
        endpoint,
        type: "network",
        message: `${endpoint} request timed out`,
      });
    }

    return new CartolaApiError({
      endpoint,
      type: "network",
      message: `${endpoint} request failed`,
    });
  }
}

const normalizeMarketStatus = (payload: unknown): NormalizedMarketStatus => {
  if (!isObjectRecord(payload)) {
    throw new CartolaApiError({
      endpoint: "market-status",
      type: "parse",
      message: "market-status payload must be an object",
    });
  }

  const round = asNumber(payload.rodada_atual);
  const statusCode = asNumber(payload.status_mercado);
  const defaultFormationId = asNumber(payload.esquema_default_id);

  if (round === null || statusCode === null || defaultFormationId === null) {
    throw new CartolaApiError({
      endpoint: "market-status",
      type: "parse",
      message: "market-status payload is missing required fields",
    });
  }

  return {
    marketRound: round,
    marketStatus: toMarketStatus(statusCode),
    defaultFormationId,
  };
};

const coachFromAthlete = (athlete: NormalizedAthlete): NormalizedCoach => ({
  id: athlete.id,
  name: athlete.name,
  clubId: athlete.clubId,
  price: athlete.price,
});

const normalizeMarketAthletes = (payload: unknown): ApiResult<NormalizedMarketAthletes> => {
  if (!isObjectRecord(payload)) {
    throw new CartolaApiError({
      endpoint: "market-athletes",
      type: "parse",
      message: "market-athletes payload must be an object",
    });
  }

  if (!Array.isArray(payload.atletas)) {
    throw new CartolaApiError({
      endpoint: "market-athletes",
      type: "parse",
      message: "market-athletes payload must include atletas[]",
    });
  }

  const warnings: CartolaApiWarning[] = [];
  const athletes: NormalizedAthlete[] = [];
  const coachesById = new Map<number, NormalizedCoach>();
  const excludedByStatus = new Map<string, number>();

  if (Array.isArray(payload.tecnicos)) {
    for (const rawCoach of payload.tecnicos) {
      const normalizedCoach = normalizeCoach(rawCoach);
      if (normalizedCoach) {
        coachesById.set(normalizedCoach.id, normalizedCoach);
      } else {
        warnings.push({
          endpoint: "market-athletes",
          message: "Ignored tecnico with invalid minimal fields",
        });
      }
    }
  }

  for (const rawAthlete of payload.atletas) {
    const normalized = normalizeAthlete(rawAthlete);
    if (!normalized) {
      warnings.push({
        endpoint: "market-athletes",
        message: "Ignored athlete with invalid minimal fields",
      });
      continue;
    }

    if (normalized.statusId !== ELIGIBLE_ATHLETE_STATUS_ID) {
      const statusKey = normalized.statusId === null ? "unknown" : String(normalized.statusId);
      excludedByStatus.set(statusKey, (excludedByStatus.get(statusKey) ?? 0) + 1);
      continue;
    }

    if (normalized.positionId === 6) {
      const derivedCoach = coachFromAthlete(normalized);
      if (!coachesById.has(derivedCoach.id)) {
        coachesById.set(derivedCoach.id, derivedCoach);
      }
      continue;
    }

    athletes.push(normalized);
  }

  if (excludedByStatus.size > 0) {
    const excludedTotal = Array.from(excludedByStatus.values()).reduce((sum, current) => sum + current, 0);
    const breakdown = Array.from(excludedByStatus.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([status, count]) => `${status}:${count}`)
      .join(", ");
    warnings.push({
      endpoint: "market-athletes",
      message: `Filtered ${excludedTotal} athletes by ineligible status_id (${breakdown}); only status_id=7 is accepted`,
    });
  }

  if (athletes.length === 0) {
    throw new CartolaApiError({
      endpoint: "market-athletes",
      type: "parse",
      message: "market-athletes returned no valid athletes",
    });
  }

  const coaches = Array.from(coachesById.values());

  const clubs = normalizeClubsInternal(payload.clubes);
  warnings.push(...clubs.warnings);

  return {
    data: {
      athletes,
      coaches,
      clubsById: clubs.data,
    },
    warnings,
  };
};

const normalizeAthlete = (value: unknown): NormalizedAthlete | null => {
  if (!isObjectRecord(value)) {
    return null;
  }

  const id = asNumber(value.atleta_id);
  const name = asString(value.apelido);
  const statusId = asNumber(value.status_id);
  const positionId = asNumber(value.posicao_id);
  const clubId = asNumber(value.clube_id);
  const price = asNumber(value.preco_num);
  const averageScore = asNumber(value.media_num);
  const lastKnownScore = asNumber(value.pontos_num);

  if (
    id === null ||
    name === null ||
    positionId === null ||
    clubId === null ||
    price === null ||
    averageScore === null ||
    lastKnownScore === null
  ) {
    return null;
  }

  return {
    id,
    name,
    statusId,
    positionId,
    clubId,
    price,
    averageScore,
    lastKnownScore,
    scout: asScout(value.scout),
  };
};

const normalizeCoach = (value: unknown): NormalizedCoach | null => {
  if (!isObjectRecord(value)) {
    return null;
  }

  const id = asNumber(value.tecnico_id);
  const name = asString(value.nome);
  const clubId = asNumber(value.clube_id);
  const price = asNumber(value.preco_num);

  if (id === null || name === null || clubId === null || price === null) {
    return null;
  }

  return {
    id,
    name,
    clubId,
    price,
  };
};

const normalizeLastRoundScores = (payload: unknown): ApiResult<NormalizedLastRoundScore[]> => {
  if (!isObjectRecord(payload) || !isObjectRecord(payload.atletas)) {
    throw new CartolaApiError({
      endpoint: "last-round-scores",
      type: "parse",
      message: "last-round-scores payload must include atletas object",
    });
  }

  const warnings: CartolaApiWarning[] = [];
  const scores: NormalizedLastRoundScore[] = [];

  for (const [idKey, value] of Object.entries(payload.atletas)) {
    if (!isObjectRecord(value)) {
      warnings.push({
        endpoint: "last-round-scores",
        message: `Ignored score entry for athlete ${idKey}`,
      });
      continue;
    }

    const athleteId = Number(idKey);
    const score = asNumber(value.pontuacao);
    if (!Number.isFinite(athleteId) || score === null) {
      warnings.push({
        endpoint: "last-round-scores",
        message: `Ignored score entry for athlete ${idKey}`,
      });
      continue;
    }

    scores.push({
      athleteId,
      score,
      scout: asScout(value.scout),
    });
  }

  return { data: scores, warnings };
};

const normalizeMatches = (payload: unknown): ApiResult<NormalizedMatch[]> => {
  if (!isObjectRecord(payload) || !Array.isArray(payload.partidas)) {
    throw new CartolaApiError({
      endpoint: "matches",
      type: "parse",
      message: "matches payload must include partidas[]",
    });
  }

  const warnings: CartolaApiWarning[] = [];
  const matches: NormalizedMatch[] = [];

  for (const match of payload.partidas) {
    if (!isObjectRecord(match)) {
      warnings.push({
        endpoint: "matches",
        message: "Ignored match with invalid structure",
      });
      continue;
    }

    const homeClubId = asNumber(match.clube_casa_id);
    const awayClubId = asNumber(match.clube_visitante_id);
    const matchDate = asString(match.partida_data);
    const local = asString(match.local) ?? "Unknown";

    if (homeClubId === null || awayClubId === null || matchDate === null) {
      warnings.push({
        endpoint: "matches",
        message: "Ignored match with missing minimal fields",
      });
      continue;
    }

    matches.push({
      homeClubId,
      awayClubId,
      matchDate,
      local,
    });
  }

  return { data: matches, warnings };
};

const normalizeClubs = (payload: unknown): ApiResult<Record<number, NormalizedClub>> => {
  const clubs = normalizeClubsInternal(payload);
  return clubs;
};

const normalizeClubsInternal = (
  payload: unknown,
): ApiResult<Record<number, NormalizedClub>> => {
  if (!isObjectRecord(payload)) {
    throw new CartolaApiError({
      endpoint: "clubs",
      type: "parse",
      message: "clubs payload must be an object",
    });
  }

  const warnings: CartolaApiWarning[] = [];
  const clubsById: Record<number, NormalizedClub> = {};

  for (const [idKey, value] of Object.entries(payload)) {
    if (!isObjectRecord(value)) {
      warnings.push({
        endpoint: "clubs",
        message: `Ignored club ${idKey} with invalid structure`,
      });
      continue;
    }

    const id = Number(idKey);
    const name = asString(value.nome);
    const abbreviation = asString(value.abreviacao);
    const shieldUrl = selectShieldUrl(value.escudos);

    if (!Number.isFinite(id) || name === null || abbreviation === null) {
      warnings.push({
        endpoint: "clubs",
        message: `Ignored club ${idKey} with missing minimal fields`,
      });
      continue;
    }

    const club: NormalizedClub = {
      id,
      name,
      abbreviation,
    };

    if (shieldUrl) {
      club.shieldUrl = shieldUrl;
    }

    clubsById[id] = club;
  }

  return { data: clubsById, warnings };
};

const isAbortError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") {
    return false;
  }

  return (
    "name" in error &&
    typeof error.name === "string" &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
};

const shouldRetry = (error: unknown): boolean => {
  if (error instanceof HttpStatusError) {
    return error.statusCode >= 500;
  }

  if (error instanceof CartolaApiError) {
    return false;
  }

  return isAbortError(error) || error instanceof TypeError;
};

const toWarning = (endpoint: CartolaEndpoint, error: unknown): CartolaApiWarning => {
  if (error instanceof CartolaApiError) {
    return {
      endpoint,
      message: error.message,
    };
  }

  return {
    endpoint,
    message: `${endpoint} data unavailable`,
  };
};
