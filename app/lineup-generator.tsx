"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  GenerateLineupError,
  GenerateLineupResponse,
  LineupErrorResponse,
} from "@/lib/domain/lineup-contract";
import {
  Formation,
  Position,
  SUPPORTED_FORMATIONS,
  ScoredCoach,
  ScoredPlayer,
} from "@/lib/domain/types";

type FieldErrors = {
  budget?: string;
  formation?: string;
};

type ViewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: GenerateLineupResponse }
  | { status: "functional-error"; error: GenerateLineupError; warnings: string[] }
  | { status: "technical-error"; message: string };

type GroupedPlayers = {
  position: Position;
  label: string;
  shortLabel: string;
  players: ScoredPlayer[];
};

const POSITION_ORDER: Position[] = ["GOL", "LAT", "ZAG", "MEI", "ATA"];

const POSITION_LABELS: Record<Position, string> = {
  GOL: "Goleiro",
  LAT: "Laterais",
  ZAG: "Zagueiros",
  MEI: "Meias",
  ATA: "Atacantes",
};

const POSITION_SHORT_LABELS: Record<Position, string> = {
  GOL: "Gol",
  LAT: "Lat",
  ZAG: "Zag",
  MEI: "Mei",
  ATA: "Ata",
};

const MARKET_STATUS_LABELS: Record<GenerateLineupResponse["marketStatus"], string> = {
  open: "Mercado aberto",
  closed: "Mercado fechado",
  maintenance: "Em manutencao",
  paused: "Mercado pausado",
};

const TECHNICAL_ERROR_MESSAGE =
  "Nao foi possivel carregar uma sugestao agora. Tente novamente em instantes.";

const FEATURED_LEAGUES = [
  {
    name: "Brasileirao",
    className:
      "[background:radial-gradient(circle_at_30%_20%,rgba(255,216,74,0.26),transparent_60%),#2f3029]",
  },
  {
    name: "Serie A",
    className:
      "[background:radial-gradient(circle_at_30%_20%,rgba(70,102,255,0.28),transparent_60%),#232735]",
  },
  {
    name: "Mata-mata",
    className:
      "[background:radial-gradient(circle_at_30%_20%,rgba(235,64,74,0.26),transparent_60%),#332227]",
  },
  {
    name: "Scout Pro",
    className:
      "[background:radial-gradient(circle_at_30%_20%,rgba(185,214,58,0.22),transparent_60%),#303322]",
  },
];

const QUICK_STATS = [
  { label: "Fluxo", value: "Mobile first" },
  { label: "Modelos", value: `${SUPPORTED_FORMATIONS.length} formacoes` },
  { label: "Leitura", value: "Score + motivo" },
];

const formatCurrency = (value: number): string =>
  value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatScore = (value: number): string =>
  value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const isLineupErrorResponse = (value: unknown): value is LineupErrorResponse => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<LineupErrorResponse>;
  return (
    !!candidate.error &&
    typeof candidate.error === "object" &&
    Array.isArray(candidate.warnings)
  );
};

const groupPlayers = (players: ScoredPlayer[]): GroupedPlayers[] =>
  POSITION_ORDER.map((position) => ({
    position,
    label: POSITION_LABELS[position],
    shortLabel: POSITION_SHORT_LABELS[position],
    players: players.filter((player) => player.position === position),
  })).filter((group) => group.players.length > 0);

const cx = (...classNames: Array<string | false | null | undefined>) =>
  classNames.filter(Boolean).join(" ");

const sectionCardClass =
  "rounded-[1.6rem] border border-white/8 p-4 shadow-[0_28px_70px_rgba(0,0,0,0.42)] md:p-5 lg:p-6 [background:linear-gradient(180deg,rgba(36,38,43,0.98),rgba(20,21,24,0.98))]";
const sectionHeadingClass = "mb-3 flex items-start justify-between gap-3";
const eyebrowClass = "m-0 text-[0.72rem] font-bold uppercase tracking-[0.18em] text-white/56";
const sectionLinkClass = "text-[0.76rem] font-bold uppercase tracking-[0.1em] text-white/56";
const panelTitleClass = "m-0 text-[1.2rem] font-[750] leading-[1.04]";

function ClubBadge({
  abbreviation,
  shieldUrl,
}: {
  abbreviation: string;
  shieldUrl?: string;
}) {
  if (!shieldUrl) {
    return null;
  }

  return (
    <span className="inline-flex items-center justify-center" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="h-12 w-12 object-contain"
        src={shieldUrl}
        alt={`${abbreviation} escudo`}
        loading="lazy"
      />
    </span>
  );
}

function PlayerTile({ player }: { player: ScoredPlayer }) {
  const matchupLabel = player.opponentClubAbbreviation
    ? `${player.opponentClubAbbreviation} ${player.isHome ? "em casa" : "fora"}`
    : "Adversario indefinido";

  return (
    <article className="grid gap-3 rounded-[1.25rem] border border-white/8 p-[14px] [background:linear-gradient(180deg,rgba(255,255,255,0.03),transparent_20%),#212328]">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex min-h-[1.7rem] items-center rounded-full bg-white/92 px-[0.65rem] py-[0.2rem] text-[0.66rem] font-extrabold uppercase tracking-[0.08em] text-[#191a1d]">
          Live
        </span>
        <span className="text-[0.74rem] font-bold uppercase tracking-[0.08em] text-[#ffca55]">
          {POSITION_SHORT_LABELS[player.position]}
        </span>
      </div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="m-0 text-[1.25rem] font-[760] leading-[1.04]">{player.name}</h3>
          <p className="mt-[0.2rem] mb-0 leading-[1.5] text-white/78">{POSITION_LABELS[player.position]}</p>
        </div>
        <div className="grid justify-items-end gap-2 text-right">
          <ClubBadge
            abbreviation={player.clubAbbreviation}
            shieldUrl={player.clubShieldUrl}
          />
          <div className="grid justify-items-end gap-1">
            <span className="text-[0.72rem] uppercase tracking-[0.1em] text-white/56">Confronto</span>
            <span className="inline-flex items-center gap-2 text-[0.86rem] font-[700]">
              {player.opponentClubShieldUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="h-6 w-6 object-contain"
                  src={player.opponentClubShieldUrl}
                  alt={`${player.opponentClubAbbreviation ?? "Rival"} escudo rival`}
                  loading="lazy"
                />
              ) : null}
              <span>{matchupLabel}</span>
            </span>
          </div>
        </div>
      </div>
      <dl className="grid gap-2">
        <div className="grid gap-2">
          <dt className="text-[0.76rem] uppercase tracking-[0.1em] text-white/56">Preco</dt>
          <dd className="m-0 text-base font-[750]">C$ {formatCurrency(player.price)}</dd>
        </div>
        <div className="grid gap-2">
          <dt className="text-[0.76rem] uppercase tracking-[0.1em] text-white/56">Score</dt>
          <dd className="m-0 text-base font-[750]">{formatScore(player.score)}</dd>
        </div>
      </dl>
      <p className="m-0 mt-[0.2rem] leading-[1.5] text-white/78">{player.justification}</p>
    </article>
  );
}

function CoachHighlight({ coach }: { coach: ScoredCoach }) {
  return (
    <article className={sectionCardClass}>
      <div className={sectionHeadingClass}>
        <div>
          <p className={eyebrowClass}>Comando</p>
          <h2 className={panelTitleClass}>Tecnico em destaque</h2>
        </div>
        <span className={sectionLinkClass}>Ver perfil</span>
      </div>

      <div className="mt-4 grid gap-3 rounded-[1.25rem] border border-white/8 p-[14px] [background:radial-gradient(circle_at_top_right,rgba(255,216,74,0.16),transparent_26%),#212328]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={eyebrowClass}>Tecnico</p>
            <h3 className="m-0 text-[1.25rem] font-[760] leading-[1.04]">{coach.name}</h3>
          </div>
          <ClubBadge
            abbreviation={coach.clubAbbreviation}
            shieldUrl={coach.clubShieldUrl}
          />
        </div>
        <dl className="grid gap-2">
          <div className="grid gap-2">
            <dt className="text-[0.76rem] uppercase tracking-[0.1em] text-white/56">Preco</dt>
            <dd className="m-0 text-base font-[750]">C$ {formatCurrency(coach.price)}</dd>
          </div>
          <div className="grid gap-2">
            <dt className="text-[0.76rem] uppercase tracking-[0.1em] text-white/56">Score</dt>
            <dd className="m-0 text-base font-[750]">{formatScore(coach.score)}</dd>
          </div>
        </dl>
        <p className="m-0 mt-[0.2rem] leading-[1.5] text-white/78">{coach.justification}</p>
      </div>
    </article>
  );
}

function StatusPanel({
  viewState,
  onReset,
}: {
  viewState: ViewState;
  onReset: () => void;
}) {
  if (viewState.status === "loading") {
    return (
      <section
        className={cx(
          sectionCardClass,
          "min-h-full content-start [background:linear-gradient(180deg,rgba(70,102,255,0.14),transparent_40%),linear-gradient(180deg,rgba(33,35,40,0.98),rgba(20,21,24,0.98))]",
        )}
        aria-live="polite"
      >
        <p className={eyebrowClass}>Ao vivo</p>
        <h2 className={panelTitleClass}>Montando o melhor time para esta rodada</h2>
        <p className="m-0 text-white/56">
          Calculando score, custo e encaixe ideal da formacao escolhida.
        </p>
      </section>
    );
  }

  if (viewState.status === "functional-error") {
    return (
      <section
        className={cx(
          sectionCardClass,
          "min-h-full content-start [background:linear-gradient(180deg,rgba(255,105,105,0.12),transparent_36%),linear-gradient(180deg,rgba(33,35,40,0.98),rgba(20,21,24,0.98))]",
        )}
        aria-live="polite"
      >
        <p className={eyebrowClass}>Ajuste necessario</p>
        <h2 className={panelTitleClass}>{viewState.error.message}</h2>
        {viewState.warnings.length > 0 ? (
          <ul className="m-0 list-disc pl-[1.1rem] leading-[1.6] text-white/78" aria-label="Warnings da requisicao">
            {viewState.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-white/56">
            Revise o teto de cartoletas ou troque a formacao para tentar de novo.
          </p>
        )}
      </section>
    );
  }

  if (viewState.status === "technical-error") {
    return (
      <section
        className={cx(
          sectionCardClass,
          "min-h-full content-start [background:linear-gradient(180deg,rgba(255,105,105,0.12),transparent_36%),linear-gradient(180deg,rgba(33,35,40,0.98),rgba(20,21,24,0.98))]",
        )}
        aria-live="polite"
      >
        <p className={eyebrowClass}>Falha tecnica</p>
        <h2 className={panelTitleClass}>{viewState.message}</h2>
        <p className="m-0 text-white/56">Revise a conexao ou tente novamente para buscar uma nova sugestao.</p>
        <button
          className="min-h-14 rounded-[12px] border border-white/14 bg-white/4 p-[14px] font-extrabold text-[#f7f7f8] transition-[transform,opacity,background-color,border-color] duration-180 ease-in-out hover:-translate-y-px"
          type="button"
          onClick={onReset}
        >
          Tentar novamente
        </button>
      </section>
    );
  }

  if (viewState.status === "success") {
    return (
      <section
        className={cx(
          sectionCardClass,
          "min-h-full content-start [background:linear-gradient(180deg,rgba(95,212,154,0.14),transparent_36%),linear-gradient(180deg,rgba(33,35,40,0.98),rgba(20,21,24,0.98))]",
        )}
        aria-live="polite"
      >
        <p className={eyebrowClass}>Resumo rapido</p>
        <h2 className={panelTitleClass}>Time sugerido para a rodada {viewState.data.marketRound}</h2>
        <p className="m-0 text-white/56">{MARKET_STATUS_LABELS[viewState.data.marketStatus]}</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <span className="text-[0.76rem] uppercase tracking-[0.1em] text-white/56">Formacao</span>
            <strong className="m-0 text-base font-[750]">{viewState.data.summary.formation}</strong>
          </div>
          <div className="grid gap-2">
            <span className="text-[0.76rem] uppercase tracking-[0.1em] text-white/56">Saldo</span>
            <strong className="m-0 text-base font-[750]">
              C$ {formatCurrency(viewState.data.summary.remainingBudget)}
            </strong>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-full content-start rounded-[1.6rem] border border-white/8 p-4 shadow-[0_28px_70px_rgba(0,0,0,0.42)] md:p-5 lg:p-6 [background:linear-gradient(180deg,rgba(36,38,43,0.98),rgba(20,21,24,0.98))]" aria-live="polite">
      <p className={eyebrowClass}>Painel</p>
      <h2 className={panelTitleClass}>Escolha o orcamento e a formacao para receber um elenco completo.</h2>
      <p className="m-0 text-white/56">
        O resultado mostra titulares, tecnico, score projetado, custo total e avisos da rodada.
      </p>
    </section>
  );
}

export function LineupGenerator() {
  const [budget, setBudget] = useState("120.50");
  const [formation, setFormation] = useState<Formation>(SUPPORTED_FORMATIONS[0]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [viewState, setViewState] = useState<ViewState>({ status: "idle" });

  const groupedPlayers = useMemo(
    () =>
      viewState.status === "success" ? groupPlayers(viewState.data.lineup.players) : [],
    [viewState],
  );

  const validate = (): { budget?: number; errors: FieldErrors } => {
    const nextErrors: FieldErrors = {};
    const normalizedBudget = Number.parseFloat(budget.replace(",", "."));

    if (!Number.isFinite(normalizedBudget) || normalizedBudget <= 0) {
      nextErrors.budget = "Informe um valor de cartoletas maior que zero.";
    }

    if (!SUPPORTED_FORMATIONS.includes(formation)) {
      nextErrors.formation = "Selecione uma formacao valida.";
    }

    return {
      budget: nextErrors.budget ? undefined : normalizedBudget,
      errors: nextErrors,
    };
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const validation = validate();
    setFieldErrors(validation.errors);

    if (Object.keys(validation.errors).length > 0 || validation.budget === undefined) {
      return;
    }

    setViewState({ status: "loading" });

    try {
      const response = await fetch("/api/lineup/generate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          budget: validation.budget,
          formation,
        }),
      });

      const payload: unknown = await response.json();

      if (response.ok) {
        setViewState({ status: "success", data: payload as GenerateLineupResponse });
        return;
      }

      if ((response.status === 400 || response.status === 422) && isLineupErrorResponse(payload)) {
        setViewState({
          status: "functional-error",
          error: payload.error,
          warnings: payload.warnings,
        });
        return;
      }

      setViewState({ status: "technical-error", message: TECHNICAL_ERROR_MESSAGE });
    } catch {
      setViewState({ status: "technical-error", message: TECHNICAL_ERROR_MESSAGE });
    }
  };

  return (
    <main className="min-h-screen w-full max-w-full overflow-x-hidden p-4 md:p-6">
      <section className="mx-auto grid w-full min-w-0 max-w-[1180px] gap-4 md:gap-5">
        <header className="flex justify-center rounded-[1.6rem] border border-white/8 p-4 shadow-[0_28px_70px_rgba(0,0,0,0.42)] md:p-5 lg:p-6 [background:radial-gradient(circle_at_center,rgba(255,216,74,0.16),transparent_28%),linear-gradient(180deg,rgba(51,53,58,0.98),rgba(28,29,33,0.98))]">
          <div className="inline-flex items-center gap-[0.18rem] text-[clamp(1.45rem,5vw,2rem)] font-extrabold tracking-[-0.04em]" aria-label="Cartola Oracle">
            <span>CARTOLA</span>
            <span
              className="h-[0.8em] w-[0.8em] rounded-full bg-[radial-gradient(circle_at_35%_35%,#ffe27a_0%,#f3ba21_45%,#e99b09_100%)] shadow-[0_0_18px_rgba(243,186,33,0.45)]"
              aria-hidden="true"
            />
            <span className="text-white/88">ORACLE</span>
          </div>
        </header>

        <section className={sectionCardClass}>
          <div className={sectionHeadingClass}>
            <div>
              <p className={eyebrowClass}>Competiciones</p>
              <h2 className={panelTitleClass}>Leituras da rodada</h2>
            </div>
            <span className={sectionLinkClass}>Ver tudo</span>
          </div>
          <div className="flex flex-wrap gap-3 pb-[0.2rem]" aria-label="Destaques da interface">
            {FEATURED_LEAGUES.map((league) => (
              <span
                key={league.name}
                className={cx(
                  "grid min-h-[4.25rem] place-items-center rounded-[1.25rem] border border-white/6 px-[0.9rem] py-[0.9rem] text-center text-[0.86rem] font-bold",
                  league.className,
                )}
              >
                {league.name}
              </span>
            ))}
          </div>
        </section>

        <section className="relative grid min-h-[15rem] w-full min-w-0 gap-3 overflow-hidden rounded-[1.6rem] border border-white/8 p-4 shadow-[0_28px_70px_rgba(0,0,0,0.42)] before:pointer-events-none before:absolute before:right-[-2rem] before:bottom-[-2rem] before:h-40 before:w-40 before:rounded-full before:[background:radial-gradient(circle,rgba(255,216,74,0.2),transparent_65%)] md:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)] md:items-end md:p-5 lg:p-6 [background:radial-gradient(circle_at_85%_20%,rgba(243,186,33,0.22),transparent_24%),linear-gradient(145deg,rgba(43,44,47,0.98),rgba(18,19,22,0.98))]">
          <div className="relative z-10 grid gap-3">
            <p className={eyebrowClass}>Cartola Oracle</p>
            <h1 className="m-0 max-w-[14ch] text-[clamp(2rem,8vw,4rem)] font-extrabold leading-[1.04]">
              Monte seu time ideal com leitura de app esportivo e foco total na rodada.
            </h1>
            <p className="m-0 max-w-[34rem] leading-[1.55] text-white/78">
              Gere uma escalacao completa a partir do seu orcamento, compare score projetado e
              entenda por que cada nome entrou no time.
            </p>
          </div>
          <div className="relative z-10 grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2">
            {QUICK_STATS.map((item) => (
              <div
                key={item.label}
                className="grid min-h-[5.5rem] content-between gap-2 rounded-[1.2rem] border border-white/6 bg-white/4 p-[14px]"
              >
                <span className="text-[0.74rem] uppercase tracking-[0.1em] text-white/56">{item.label}</span>
                <strong className="text-[0.95rem] font-bold">{item.value}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className={sectionCardClass}>
          <div className={sectionHeadingClass}>
            <div>
              <p className={eyebrowClass}>Live Matches</p>
              <h2 className={panelTitleClass}>Central do time</h2>
            </div>
            <span className={sectionLinkClass}>View all</span>
          </div>

          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))] md:[grid-template-columns:minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
            <form
              className="w-full min-w-0 rounded-[1.6rem] border border-white/8 p-4 shadow-[0_28px_70px_rgba(0,0,0,0.42)] md:p-5 lg:p-6 [background:linear-gradient(180deg,rgba(78,99,255,0.1),transparent_36%),linear-gradient(180deg,rgba(33,35,40,0.98),rgba(20,21,24,0.98))]"
              onSubmit={handleSubmit}
              noValidate
            >
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex min-h-[1.7rem] items-center rounded-full bg-white/92 px-[0.65rem] py-[0.2rem] text-[0.66rem] font-extrabold uppercase tracking-[0.08em] text-[#191a1d]">
                  Live
                </span>
                <span className="text-white/56">Atualize em segundos</span>
              </div>

              <div className="mt-3 grid gap-3">
                <div>
                  <h2 className={panelTitleClass}>Gerar time</h2>
                  <p className="m-0 leading-[1.5] text-white/78">
                    Ajuste cartoletas e formacao para liberar uma sugestao pronta para escalar.
                  </p>
                </div>

                <label className="grid gap-2" htmlFor="budget">
                  <span className="text-[0.95rem] font-bold">Cartoletas disponiveis</span>
                  <input
                    id="budget"
                    name="budget"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={budget}
                    onChange={(event) => setBudget(event.target.value)}
                    aria-invalid={fieldErrors.budget ? "true" : "false"}
                    aria-describedby={fieldErrors.budget ? "budget-error" : "budget-help"}
                    placeholder="120.50"
                    className="min-h-14 w-full rounded-2xl border border-white/14 bg-white/5 px-[14px] py-3 text-[#f7f7f8] placeholder:text-white/56"
                  />
                  <small id="budget-help" className="text-white/56">
                    Defina o teto de cartoletas para montar o elenco.
                  </small>
                  {fieldErrors.budget ? (
                    <strong className="text-[0.9rem] text-[#ff6969]" id="budget-error">
                      {fieldErrors.budget}
                    </strong>
                  ) : null}
                </label>

                <label className="grid gap-2" htmlFor="formation">
                  <span className="text-[0.95rem] font-bold">Formacao</span>
                  <select
                    id="formation"
                    name="formation"
                    value={formation}
                    onChange={(event) => setFormation(event.target.value as Formation)}
                    aria-invalid={fieldErrors.formation ? "true" : "false"}
                    aria-describedby={
                      fieldErrors.formation ? "formation-error" : "formation-help"
                    }
                    className="min-h-14 w-full rounded-2xl border border-white/14 bg-white/5 px-[14px] py-3 text-[#f7f7f8]"
                  >
                    {SUPPORTED_FORMATIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <small id="formation-help" className="text-white/56">
                    Todas as formacoes aceitas pelo contrato da API.
                  </small>
                  {fieldErrors.formation ? (
                    <strong className="text-[0.9rem] text-[#ff6969]" id="formation-error">
                      {fieldErrors.formation}
                    </strong>
                  ) : null}
                </label>

                <button
                  className="min-h-14 rounded-[12px] bg-[linear-gradient(135deg,#ffe27a_0%,#f3ba21_45%,#db9200_100%)] p-[14px] font-extrabold text-[#191a1d] transition-[transform,opacity,background-color,border-color] duration-180 ease-in-out hover:-translate-y-px disabled:cursor-wait disabled:opacity-70 disabled:transform-none"
                  type="submit"
                  disabled={viewState.status === "loading"}
                >
                  {viewState.status === "loading" ? "Gerando time..." : "Gerar time"}
                </button>
              </div>
            </form>

            <StatusPanel
              viewState={viewState}
              onReset={() => setViewState({ status: "idle" })}
            />
          </div>
        </section>

        {viewState.status === "success" ? (
          <section className="grid gap-3" aria-label="Resultado da escalacao">
            <section className="rounded-[1.6rem] border border-white/8 p-4 shadow-[0_28px_70px_rgba(0,0,0,0.42)] md:p-5 lg:p-6 [background:radial-gradient(circle_at_85%_15%,rgba(243,186,33,0.2),transparent_20%),linear-gradient(145deg,rgba(43,44,47,0.98),rgba(20,21,24,0.98))]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className={eyebrowClass}>Round Summary</p>
                  <h2 className={panelTitleClass}>Time sugerido para a rodada {viewState.data.marketRound}</h2>
                  <p className="mt-[0.35rem] mb-0 text-white/56">{MARKET_STATUS_LABELS[viewState.data.marketStatus]}</p>
                </div>
                <div className="grid w-full min-w-[7.5rem] gap-1 rounded-[1.2rem] border border-white/8 bg-white/6 px-4 py-[0.85rem] md:w-auto">
                  <span className="text-[0.74rem] uppercase tracking-[0.1em] text-white/56">Score total</span>
                  <strong className="m-0 text-base font-[750]">{formatScore(viewState.data.summary.totalScore)}</strong>
                </div>
              </div>

              <dl className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
                <div className="grid gap-2">
                  <dt className="text-[0.76rem] uppercase tracking-[0.1em] text-white/56">Formacao</dt>
                  <dd className="m-0 text-base font-[750]">{viewState.data.summary.formation}</dd>
                </div>
                <div className="grid gap-2">
                  <dt className="text-[0.76rem] uppercase tracking-[0.1em] text-white/56">Custo total</dt>
                  <dd className="m-0 text-base font-[750]">C$ {formatCurrency(viewState.data.summary.totalCost)}</dd>
                </div>
                <div className="grid gap-2">
                  <dt className="text-[0.76rem] uppercase tracking-[0.1em] text-white/56">Saldo</dt>
                  <dd className="m-0 text-base font-[750]">C$ {formatCurrency(viewState.data.summary.remainingBudget)}</dd>
                </div>
                <div className="grid gap-2">
                  <dt className="text-[0.76rem] uppercase tracking-[0.1em] text-white/56">Titulares</dt>
                  <dd className="m-0 text-base font-[750]">11 jogadores escalados</dd>
                </div>
              </dl>
            </section>

            <section className={sectionCardClass}>
              <div className={sectionHeadingClass}>
                <div>
                  <p className={eyebrowClass}>Live Matches</p>
                  <h2 className={panelTitleClass}>11 jogadores escalados</h2>
                </div>
                <span className={sectionLinkClass}>View all</span>
              </div>

              <div className="grid gap-3">
                {groupedPlayers.map((group) => (
                  <section
                    key={group.position}
                    className="rounded-[1.6rem] border border-white/8 p-4 md:p-5 lg:p-6 [background:linear-gradient(180deg,rgba(33,35,40,0.98),rgba(17,18,20,0.98))]"
                    aria-label={group.label}
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <h3 className="m-0 text-[1.2rem] font-[750] leading-[1.04]">{group.label}</h3>
                      <span className="text-white/56">{group.players.length} selecionados</span>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {group.players.map((player) => (
                        <PlayerTile key={player.id} player={player} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </section>

            <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <CoachHighlight coach={viewState.data.lineup.coach} />

              {viewState.data.explanations.length > 0 ? (
                <section className={sectionCardClass}>
                  <div className={sectionHeadingClass}>
                    <div>
                      <p className={eyebrowClass}>Latest News</p>
                      <h2 className={panelTitleClass}>Justificativas gerais</h2>
                    </div>
                    <span className={sectionLinkClass}>Oracle read</span>
                  </div>
                  <ul className="m-0 list-disc pl-[1.1rem] leading-[1.6] text-white/78" aria-label="Justificativas gerais">
                    {viewState.data.explanations.map((explanation) => (
                      <li key={explanation}>{explanation}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {viewState.data.warnings.length > 0 ? (
                <section className="rounded-[1.6rem] border border-white/8 p-4 shadow-[0_28px_70px_rgba(0,0,0,0.42)] md:p-5 lg:p-6 [background:linear-gradient(180deg,rgba(255,202,85,0.12),transparent_36%),linear-gradient(180deg,rgba(36,38,43,0.98),rgba(20,21,24,0.98))]">
                  <div className={sectionHeadingClass}>
                    <div>
                      <p className={eyebrowClass}>Alerts</p>
                      <h2 className={panelTitleClass}>Warnings</h2>
                    </div>
                    <span className={sectionLinkClass}>Acompanhar</span>
                  </div>
                  <ul className="m-0 list-disc pl-[1.1rem] leading-[1.6] text-white/78" aria-label="Warnings da rodada">
                    {viewState.data.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </section>
          </section>
        ) : null}
      </section>
    </main>
  );
}
