import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { HttpCartolaApiClient } from "./client";
import { CartolaApiError } from "./errors";

const okResponse = (payload: unknown): Response =>
  ({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(payload),
  }) as unknown as Response;

const httpErrorResponse = (status: number): Response =>
  ({
    ok: false,
    status,
    json: vi.fn(),
  }) as unknown as Response;

describe("HttpCartolaApiClient", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes market status payload", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      okResponse({
        rodada_atual: 5,
        status_mercado: 1,
        esquema_default_id: 4,
      }),
    );

    const client = new HttpCartolaApiClient({ fetchFn });
    await expect(client.getMarketStatus()).resolves.toEqual({
      marketRound: 5,
      marketStatus: "open",
      defaultFormationId: 4,
    });
  });

  it("throws parse error when market status misses required fields", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(okResponse({ rodada_atual: 5, esquema_default_id: 4 }));

    const client = new HttpCartolaApiClient({ fetchFn });

    await expect(client.getMarketStatus()).rejects.toMatchObject({
      name: "CartolaApiError",
      endpoint: "market-status",
      type: "parse",
    } satisfies Partial<CartolaApiError>);
  });

  it("retries once on transient HTTP 5xx", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(httpErrorResponse(503))
      .mockResolvedValueOnce(
        okResponse({
          rodada_atual: 7,
          status_mercado: 2,
          esquema_default_id: 5,
        }),
      );

    const client = new HttpCartolaApiClient({ fetchFn, retryCount: 1 });
    const marketStatus = await client.getMarketStatus();

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(marketStatus.marketStatus).toBe("closed");
  });

  it("does not retry on HTTP 4xx", async () => {
    const fetchFn = vi.fn().mockResolvedValue(httpErrorResponse(404));
    const client = new HttpCartolaApiClient({ fetchFn, retryCount: 1 });

    await expect(client.getMarketStatus()).rejects.toMatchObject({
      name: "CartolaApiError",
      endpoint: "market-status",
      type: "http",
      statusCode: 404,
    } satisfies Partial<CartolaApiError>);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("times out and retries once before failing", async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn((_url: string, init?: RequestInit) => {
      const signal = init?.signal;
      return new Promise<Response>((_, reject) => {
        signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });

    const client = new HttpCartolaApiClient({ fetchFn, timeoutMs: 10, retryCount: 1 });
    const requestPromise = client.getMarketStatus();
    const expectation = expect(requestPromise).rejects.toMatchObject({
      name: "CartolaApiError",
      endpoint: "market-status",
      type: "network",
    } satisfies Partial<CartolaApiError>);
    await vi.advanceTimersByTimeAsync(25);

    await expectation;
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("returns warning and empty data when last-round endpoint fails", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(httpErrorResponse(500))
      .mockResolvedValueOnce(httpErrorResponse(500));
    const client = new HttpCartolaApiClient({ fetchFn, retryCount: 1 });

    const result = await client.getLastRoundScores(4);
    expect(result.data).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      endpoint: "last-round-scores",
    });
  });

  it("keeps valid athletes and warns about invalid ones", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      okResponse({
        atletas: [
          {
            atleta_id: 1,
            apelido: "Pedro",
            posicao_id: 5,
            clube_id: 10,
            preco_num: 12.5,
            media_num: 6.3,
            pontos_num: 8.2,
            scout: { G: 1 },
          },
          {
            atleta_id: 2,
            apelido: "Invalido",
            posicao_id: 5,
            clube_id: 10,
          },
        ],
        tecnicos: [
          {
            tecnico_id: 9,
            nome: "Tecnico X",
            clube_id: 10,
            preco_num: 8,
          },
        ],
        clubes: {
          "10": {
            nome: "Flamengo",
            abreviacao: "FLA",
          },
        },
      }),
    );

    const client = new HttpCartolaApiClient({ fetchFn });
    const result = await client.getMarketAthletes();

    expect(result.data.athletes).toHaveLength(1);
    expect(result.data.coaches).toHaveLength(1);
    expect(result.data.clubsById[10]).toEqual({
      id: 10,
      name: "Flamengo",
      abbreviation: "FLA",
    });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].endpoint).toBe("market-athletes");
  });

  it("derives coaches from atletas when tecnicos array is absent", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      okResponse({
        atletas: [
          {
            atleta_id: 1,
            apelido: "Goleiro",
            posicao_id: 1,
            clube_id: 10,
            preco_num: 12.5,
            media_num: 6.3,
            pontos_num: 8.2,
            scout: { G: 1 },
          },
          {
            atleta_id: 50,
            apelido: "Plug Técnico",
            posicao_id: 6,
            clube_id: 10,
            preco_num: 5,
            media_num: 4,
            pontos_num: 3,
          },
        ],
        clubes: {
          "10": {
            nome: "Flamengo",
            abreviacao: "FLA",
          },
        },
      }),
    );

    const client = new HttpCartolaApiClient({ fetchFn });
    const result = await client.getMarketAthletes();

    expect(result.data.athletes).toHaveLength(1);
    expect(result.data.coaches).toHaveLength(1);
    expect(result.data.coaches[0]).toMatchObject({ name: "Plug Técnico", price: 5 });
  });

  it("deduplicates coaches when both atletas and tecnicos expose the same id", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      okResponse({
        atletas: [
          {
            atleta_id: 1,
            apelido: "Defensor",
            posicao_id: 3,
            clube_id: 20,
            preco_num: 9.5,
            media_num: 5.5,
            pontos_num: 4,
          },
          {
            atleta_id: 99,
            apelido: "Técnico Legacy",
            posicao_id: 6,
            clube_id: 20,
            preco_num: 3,
            media_num: 5,
            pontos_num: 2,
          },
        ],
        tecnicos: [
          {
            tecnico_id: 99,
            nome: "Técnico Oficial",
            clube_id: 20,
            preco_num: 4,
          },
        ],
        clubes: {
          "20": {
            nome: "Internacional",
            abreviacao: "INT",
          },
        },
      }),
    );

    const client = new HttpCartolaApiClient({ fetchFn });
    const result = await client.getMarketAthletes();

    expect(result.data.coaches).toHaveLength(1);
    expect(result.data.coaches[0].price).toBe(4);
  });
});
