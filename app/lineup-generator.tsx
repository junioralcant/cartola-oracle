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

const MARKET_STATUS_LABELS: Record<GenerateLineupResponse["marketStatus"], string> = {
  open: "Mercado aberto",
  closed: "Mercado fechado",
  maintenance: "Em manutencao",
  paused: "Mercado pausado",
};

const TECHNICAL_ERROR_MESSAGE =
  "Nao foi possivel carregar uma sugestao agora. Tente novamente em instantes.";

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
    players: players.filter((player) => player.position === position),
  })).filter((group) => group.players.length > 0);

function PlayerCard({ player }: { player: ScoredPlayer }) {
  return (
    <article className="player-card">
      <div className="player-card__header">
        <div>
          <p className="player-card__eyebrow">{POSITION_LABELS[player.position]}</p>
          <h3>{player.name}</h3>
        </div>
        <div className="player-card__badge">{player.clubAbbreviation}</div>
      </div>
      <dl className="player-card__metrics">
        <div>
          <dt>Preco</dt>
          <dd>C$ {formatCurrency(player.price)}</dd>
        </div>
        <div>
          <dt>Score</dt>
          <dd>{formatScore(player.score)}</dd>
        </div>
      </dl>
      <p className="player-card__reason">{player.justification}</p>
    </article>
  );
}

function CoachCard({ coach }: { coach: ScoredCoach }) {
  return (
    <article className="coach-card">
      <div className="coach-card__header">
        <div>
          <p className="player-card__eyebrow">Tecnico</p>
          <h3>{coach.name}</h3>
        </div>
        <div className="player-card__badge">{coach.clubAbbreviation}</div>
      </div>
      <dl className="player-card__metrics">
        <div>
          <dt>Preco</dt>
          <dd>C$ {formatCurrency(coach.price)}</dd>
        </div>
        <div>
          <dt>Score</dt>
          <dd>{formatScore(coach.score)}</dd>
        </div>
      </dl>
      <p className="player-card__reason">{coach.justification}</p>
    </article>
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

  const renderFeedback = () => {
    if (viewState.status === "loading") {
      return (
        <section className="feedback-panel feedback-panel--loading" aria-live="polite">
          <p className="feedback-panel__eyebrow">Processando</p>
          <h2>Montando o melhor time para esta rodada</h2>
          <p>Calculando score, equilibrio de custo e encaixe da formacao escolhida.</p>
        </section>
      );
    }

    if (viewState.status === "functional-error") {
      return (
        <section className="feedback-panel feedback-panel--error" aria-live="polite">
          <p className="feedback-panel__eyebrow">Ajuste necessario</p>
          <h2>{viewState.error.message}</h2>
          {viewState.warnings.length > 0 ? (
            <ul className="feedback-list" aria-label="Warnings da requisicao">
              {viewState.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </section>
      );
    }

    if (viewState.status === "technical-error") {
      return (
        <section className="feedback-panel feedback-panel--error" aria-live="polite">
          <p className="feedback-panel__eyebrow">Falha tecnica</p>
          <h2>{viewState.message}</h2>
          <p>Revise a conexao ou tente novamente para buscar uma nova sugestao.</p>
          <button className="secondary-action" type="button" onClick={() => setViewState({ status: "idle" })}>
            Tentar novamente
          </button>
        </section>
      );
    }

    return (
      <section className="feedback-panel feedback-panel--idle" aria-live="polite">
        <p className="feedback-panel__eyebrow">Pronto para gerar</p>
        <h2>Escolha o orcamento e a formacao para receber um elenco completo.</h2>
        <p>O resultado mostra titulares, tecnico, score projetado, custo total, saldo e observacoes da rodada.</p>
      </section>
    );
  };

  return (
    <main className="oracle-shell">
      <section className="oracle-hero">
        <div className="oracle-hero__copy">
          <p className="kicker">Cartola Oracle</p>
          <h1>Monte seu time ideal com leitura rapida, criterio tecnico e foco mobile.</h1>
          <p className="lede">
            Gere uma escalacao completa a partir do seu orcamento, acompanhe os avisos da rodada
            e entenda por que cada nome entrou no time.
          </p>
        </div>
        <div className="hero-chip-row" aria-label="Destaques da interface">
          <span>Fluxo completo</span>
          <span>7 formacoes</span>
          <span>Score + justificativa</span>
        </div>
      </section>

      <section className="oracle-grid">
        <div className="panel panel--form">
          <div className="panel__heading">
            <p className="panel__eyebrow">Parametros</p>
            <h2>Gerar time</h2>
          </div>
          <form className="lineup-form" onSubmit={handleSubmit} noValidate>
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
              <small id="budget-help">Informe o teto de cartoletas para montar o elenco.</small>
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
                aria-describedby={fieldErrors.formation ? "formation-error" : "formation-help"}
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

            <button className="primary-action" type="submit" disabled={viewState.status === "loading"}>
              {viewState.status === "loading" ? "Gerando time..." : "Gerar time"}
            </button>
          </form>
        </div>

        <div className="panel panel--feedback">{renderFeedback()}</div>
      </section>

      {viewState.status === "success" ? (
        <section className="results-stack" aria-label="Resultado da escalacao">
          <div className="summary-card">
            <div>
              <p className="panel__eyebrow">Resumo da rodada</p>
              <h2>Time sugerido para a rodada {viewState.data.marketRound}</h2>
              <p className="summary-card__market">{MARKET_STATUS_LABELS[viewState.data.marketStatus]}</p>
            </div>
            <dl className="summary-grid">
              <div>
                <dt>Formacao</dt>
                <dd>{viewState.data.summary.formation}</dd>
              </div>
              <div>
                <dt>Score total</dt>
                <dd>{formatScore(viewState.data.summary.totalScore)}</dd>
              </div>
              <div>
                <dt>Custo total</dt>
                <dd>C$ {formatCurrency(viewState.data.summary.totalCost)}</dd>
              </div>
              <div>
                <dt>Saldo</dt>
                <dd>C$ {formatCurrency(viewState.data.summary.remainingBudget)}</dd>
              </div>
            </dl>
          </div>

          <div className="content-grid">
            <section className="panel panel--lineup">
              <div className="panel__heading">
                <p className="panel__eyebrow">Elenco</p>
                <h2>11 jogadores escalados</h2>
              </div>
              <div className="position-groups">
                {groupedPlayers.map((group) => (
                  <section key={group.position} className="position-group" aria-label={group.label}>
                    <div className="position-group__header">
                      <h3>{group.label}</h3>
                      <span>{group.players.length} selecionados</span>
                    </div>
                    <div className="position-group__list">
                      {group.players.map((player) => (
                        <PlayerCard key={player.id} player={player} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </section>

            <aside className="side-stack">
              <section className="panel panel--coach">
                <div className="panel__heading">
                  <p className="panel__eyebrow">Comando</p>
                  <h2>Tecnico</h2>
                </div>
                <CoachCard coach={viewState.data.lineup.coach} />
              </section>

              {viewState.data.explanations.length > 0 ? (
                <section className="panel panel--notes">
                  <div className="panel__heading">
                    <p className="panel__eyebrow">Leitura</p>
                    <h2>Justificativas gerais</h2>
                  </div>
                  <ul className="bullet-list" aria-label="Justificativas gerais">
                    {viewState.data.explanations.map((explanation) => (
                      <li key={explanation}>{explanation}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {viewState.data.warnings.length > 0 ? (
                <section className="panel panel--warnings">
                  <div className="panel__heading">
                    <p className="panel__eyebrow">Atencao</p>
                    <h2>Warnings</h2>
                  </div>
                  <ul className="bullet-list bullet-list--warning" aria-label="Warnings da rodada">
                    {viewState.data.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </aside>
          </div>
        </section>
      ) : null}
    </main>
  );
}
