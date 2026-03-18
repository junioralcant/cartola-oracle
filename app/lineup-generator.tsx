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
  { name: "Brasileirao", accentClassName: "league-pill--gold" },
  { name: "Serie A", accentClassName: "league-pill--blue" },
  { name: "Mata-mata", accentClassName: "league-pill--red" },
  { name: "Scout Pro", accentClassName: "league-pill--lime" },
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
    <span className="club-badge" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="club-badge__shield" src={shieldUrl} alt={`${abbreviation} escudo`} loading="lazy" />
    </span>
  );
}

function PlayerTile({ player }: { player: ScoredPlayer }) {
  return (
    <article className="player-tile">
      <div className="player-tile__topline">
        <span className="player-tile__live-badge">Live</span>
        <span className="player-tile__position">{POSITION_SHORT_LABELS[player.position]}</span>
      </div>
      <div className="player-tile__identity">
        <div>
          <h3>{player.name}</h3>
          <p>{POSITION_LABELS[player.position]}</p>
        </div>
        <ClubBadge
          abbreviation={player.clubAbbreviation}
          shieldUrl={player.clubShieldUrl}
        />
      </div>
      <dl className="player-tile__stats">
        <div>
          <dt>Preco</dt>
          <dd>C$ {formatCurrency(player.price)}</dd>
        </div>
        <div>
          <dt>Score</dt>
          <dd>{formatScore(player.score)}</dd>
        </div>
      </dl>
      <p className="player-tile__reason">{player.justification}</p>
    </article>
  );
}

function CoachHighlight({ coach }: { coach: ScoredCoach }) {
  return (
    <article className="coach-highlight">
      <div className="section-heading">
        <div>
          <p className="section-heading__eyebrow">Comando</p>
          <h2>Tecnico em destaque</h2>
        </div>
        <span className="section-link">Ver perfil</span>
      </div>

      <div className="coach-highlight__card">
        <div className="coach-highlight__header">
          <div>
            <p className="coach-highlight__label">Tecnico</p>
            <h3>{coach.name}</h3>
          </div>
          <ClubBadge
            abbreviation={coach.clubAbbreviation}
            shieldUrl={coach.clubShieldUrl}
          />
        </div>
        <dl className="player-tile__stats">
          <div>
            <dt>Preco</dt>
            <dd>C$ {formatCurrency(coach.price)}</dd>
          </div>
          <div>
            <dt>Score</dt>
            <dd>{formatScore(coach.score)}</dd>
          </div>
        </dl>
        <p className="player-tile__reason">{coach.justification}</p>
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
      <section className="status-panel status-panel--loading" aria-live="polite">
        <p className="section-heading__eyebrow">Ao vivo</p>
        <h2>Montando o melhor time para esta rodada</h2>
        <p>Calculando score, custo e encaixe ideal da formacao escolhida.</p>
      </section>
    );
  }

  if (viewState.status === "functional-error") {
    return (
      <section className="status-panel status-panel--error" aria-live="polite">
        <p className="section-heading__eyebrow">Ajuste necessario</p>
        <h2>{viewState.error.message}</h2>
        {viewState.warnings.length > 0 ? (
          <ul className="insight-list" aria-label="Warnings da requisicao">
            {viewState.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : (
          <p>Revise o teto de cartoletas ou troque a formacao para tentar de novo.</p>
        )}
      </section>
    );
  }

  if (viewState.status === "technical-error") {
    return (
      <section className="status-panel status-panel--error" aria-live="polite">
        <p className="section-heading__eyebrow">Falha tecnica</p>
        <h2>{viewState.message}</h2>
        <p>Revise a conexao ou tente novamente para buscar uma nova sugestao.</p>
        <button className="secondary-action" type="button" onClick={onReset}>
          Tentar novamente
        </button>
      </section>
    );
  }

  if (viewState.status === "success") {
    return (
      <section className="status-panel status-panel--success" aria-live="polite">
        <p className="section-heading__eyebrow">Resumo rapido</p>
        <h2>Time sugerido para a rodada {viewState.data.marketRound}</h2>
        <p>{MARKET_STATUS_LABELS[viewState.data.marketStatus]}</p>
        <div className="status-panel__metrics">
          <div>
            <span>Formacao</span>
            <strong>{viewState.data.summary.formation}</strong>
          </div>
          <div>
            <span>Saldo</span>
            <strong>C$ {formatCurrency(viewState.data.summary.remainingBudget)}</strong>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="status-panel" aria-live="polite">
      <p className="section-heading__eyebrow">Painel</p>
      <h2>Escolha o orcamento e a formacao para receber um elenco completo.</h2>
      <p>O resultado mostra titulares, tecnico, score projetado, custo total e avisos da rodada.</p>
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
    <main className="oracle-app-shell">
      <section className="app-frame">
        <header className="topbar">
          <div className="brand-lockup" aria-label="Cartola Oracle">
            <span className="brand-lockup__word">CARTOLA</span>
            <span className="brand-lockup__mark" aria-hidden="true" />
            <span className="brand-lockup__word brand-lockup__word--accent">ORACLE</span>
          </div>
        </header>

        <section className="section-block">
          <div className="section-heading">
            <div>
              <p className="section-heading__eyebrow">Competiciones</p>
              <h2>Leituras da rodada</h2>
            </div>
            <span className="section-link">Ver tudo</span>
          </div>
          <div className="league-strip" aria-label="Destaques da interface">
            {FEATURED_LEAGUES.map((league) => (
              <span key={league.name} className={`league-pill ${league.accentClassName}`}>
                {league.name}
              </span>
            ))}
          </div>
        </section>

        <section className="hero-card">
          <div className="hero-card__copy">
            <p className="section-heading__eyebrow">Cartola Oracle</p>
            <h1>Monte seu time ideal com leitura de app esportivo e foco total na rodada.</h1>
            <p>
              Gere uma escalacao completa a partir do seu orcamento, compare score projetado e
              entenda por que cada nome entrou no time.
            </p>
          </div>
          <div className="hero-card__stats">
            {QUICK_STATS.map((item) => (
              <div key={item.label} className="hero-stat">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="section-block">
          <div className="section-heading">
            <div>
              <p className="section-heading__eyebrow">Live Matches</p>
              <h2>Central do time</h2>
            </div>
            <span className="section-link">View all</span>
          </div>

          <div className="generator-grid">
            <form className="generator-card" onSubmit={handleSubmit} noValidate>
              <div className="generator-card__topline">
                <span className="generator-pill">Live</span>
                <span className="generator-card__hint">Atualize em segundos</span>
              </div>

              <div className="generator-card__body">
                <div>
                  <h2>Gerar time</h2>
                  <p>
                    Ajuste cartoletas e formacao para liberar uma sugestao pronta para escalar.
                  </p>
                </div>

                <label className="field" htmlFor="budget">
                  <span>Cartoletas disponiveis</span>
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
                  />
                  <small id="budget-help">Defina o teto de cartoletas para montar o elenco.</small>
                  {fieldErrors.budget ? (
                    <strong className="field__error" id="budget-error">
                      {fieldErrors.budget}
                    </strong>
                  ) : null}
                </label>

                <label className="field" htmlFor="formation">
                  <span>Formacao</span>
                  <select
                    id="formation"
                    name="formation"
                    value={formation}
                    onChange={(event) => setFormation(event.target.value as Formation)}
                    aria-invalid={fieldErrors.formation ? "true" : "false"}
                    aria-describedby={
                      fieldErrors.formation ? "formation-error" : "formation-help"
                    }
                  >
                    {SUPPORTED_FORMATIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <small id="formation-help">Todas as formacoes aceitas pelo contrato da API.</small>
                  {fieldErrors.formation ? (
                    <strong className="field__error" id="formation-error">
                      {fieldErrors.formation}
                    </strong>
                  ) : null}
                </label>

                <button
                  className="primary-action"
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
          <section className="results-stack" aria-label="Resultado da escalacao">
            <section className="summary-showcase">
              <div className="summary-showcase__header">
                <div>
                  <p className="section-heading__eyebrow">Round Summary</p>
                  <h2>Time sugerido para a rodada {viewState.data.marketRound}</h2>
                  <p>{MARKET_STATUS_LABELS[viewState.data.marketStatus]}</p>
                </div>
                <div className="summary-showcase__score">
                  <span>Score total</span>
                  <strong>{formatScore(viewState.data.summary.totalScore)}</strong>
                </div>
              </div>

              <dl className="summary-grid">
                <div>
                  <dt>Formacao</dt>
                  <dd>{viewState.data.summary.formation}</dd>
                </div>
                <div>
                  <dt>Custo total</dt>
                  <dd>C$ {formatCurrency(viewState.data.summary.totalCost)}</dd>
                </div>
                <div>
                  <dt>Saldo</dt>
                  <dd>C$ {formatCurrency(viewState.data.summary.remainingBudget)}</dd>
                </div>
                <div>
                  <dt>Titulares</dt>
                  <dd>11 jogadores escalados</dd>
                </div>
              </dl>
            </section>

            <section className="section-block">
              <div className="section-heading">
                <div>
                  <p className="section-heading__eyebrow">Live Matches</p>
                  <h2>11 jogadores escalados</h2>
                </div>
                <span className="section-link">View all</span>
              </div>

              <div className="position-groups">
                {groupedPlayers.map((group) => (
                  <section key={group.position} className="position-group" aria-label={group.label}>
                    <div className="position-group__header">
                      <h3>{group.label}</h3>
                      <span>{group.players.length} selecionados</span>
                    </div>
                    <div className="player-grid">
                      {group.players.map((player) => (
                        <PlayerTile key={player.id} player={player} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </section>

            <section className="bottom-grid">
              <CoachHighlight coach={viewState.data.lineup.coach} />

              {viewState.data.explanations.length > 0 ? (
                <section className="insight-panel">
                  <div className="section-heading">
                    <div>
                      <p className="section-heading__eyebrow">Latest News</p>
                      <h2>Justificativas gerais</h2>
                    </div>
                    <span className="section-link">Oracle read</span>
                  </div>
                  <ul className="insight-list" aria-label="Justificativas gerais">
                    {viewState.data.explanations.map((explanation) => (
                      <li key={explanation}>{explanation}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {viewState.data.warnings.length > 0 ? (
                <section className="insight-panel insight-panel--warning">
                  <div className="section-heading">
                    <div>
                      <p className="section-heading__eyebrow">Alerts</p>
                      <h2>Warnings</h2>
                    </div>
                    <span className="section-link">Acompanhar</span>
                  </div>
                  <ul className="insight-list" aria-label="Warnings da rodada">
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
