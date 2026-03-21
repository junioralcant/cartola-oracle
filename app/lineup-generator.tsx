"use client";

import {
  GenerateLineupError,
  GenerateLineupResponse,
  LineupErrorResponse,
} from "@/lib/domain/lineup-contract";
import {
  Formation,
  FORMATION_SLOTS,
  Position,
  ScoredCoach,
  ScoredPlayer,
  SUPPORTED_FORMATIONS,
} from "@/lib/domain/types";
import { getClubCardTint } from "@/lib/ui/club-colors";
import useEmblaCarousel from "embla-carousel-react";
import {
  CSSProperties,
  FormEvent,
  ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";

type FieldErrors = {
  budget?: string;
  formation?: string;
};

type RoundStatus = {
  marketRound: number;
  marketStatus: GenerateLineupResponse["marketStatus"];
};

type ViewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: GenerateLineupResponse }
  | { status: "functional-error"; error: GenerateLineupError; warnings: string[] }
  | { status: "technical-error"; message: string };

type PitchPlayer = {
  player: ScoredPlayer;
  top: string;
  left: string;
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

const POSITION_PITCH_ROWS: Record<Position, number> = {
  ATA: 18,
  MEI: 40,
  LAT: 60,
  ZAG: 68,
  GOL: 88,
};

const MARKET_STATUS_LABELS: Record<GenerateLineupResponse["marketStatus"], string> = {
  open: "Mercado aberto",
  closed: "Mercado fechado",
  maintenance: "Em manutencao",
  paused: "Mercado pausado",
};

const isMarketStatus = (value: unknown): value is RoundStatus["marketStatus"] =>
  typeof value === "string" && value in MARKET_STATUS_LABELS;

const isRoundStatusPayload = (value: unknown): value is RoundStatus => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.marketRound === "number" && isMarketStatus(candidate.marketStatus);
};

const TECHNICAL_ERROR_MESSAGE =
  "Nao foi possivel carregar uma sugestao agora. Tente novamente em instantes.";

const FIELD_X_POSITIONS: Record<number, string[]> = {
  1: ["50%"],
  2: ["30%", "70%"],
  3: ["20%", "50%", "80%"],
  4: ["14%", "38%", "62%", "86%"],
  5: ["10%", "30%", "50%", "70%", "90%"],
};

const COACH_FIELD_POSITION = {
  top: `${POSITION_PITCH_ROWS.GOL}%`,
  left: "82%",
};

const surfaceCardClass =
  "rounded-[32px] border border-white/10 bg-white/[0.05] shadow-[0_24px_70px_rgba(8,6,20,0.45)] backdrop-blur-xl";

const panelClass =
  "rounded-[24px] border border-white/10 bg-white/[0.04] shadow-[0_18px_55px_rgba(8,6,20,0.34)] backdrop-blur-xl";

const eyebrowClass =
  "m-0 font-[var(--font-brand)] text-[12px] uppercase tracking-[0.18em] text-[color:var(--color-text-tertiary)]";

const formatCurrency = (value: number): string =>
  value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatScore = (value: number): string =>
  value.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
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

const getFieldPositions = (count: number): string[] => FIELD_X_POSITIONS[count] ?? FIELD_X_POSITIONS[5];

const buildPitchPlayers = (players: ScoredPlayer[], formation: Formation): PitchPlayer[] => {
  const slots = FORMATION_SLOTS[formation];
  const output: PitchPlayer[] = [];

  const backline = players.filter((player) => player.position === "LAT" || player.position === "ZAG");
  const latPlayers = backline.filter((player) => player.position === "LAT");
  const zagPlayers = backline.filter((player) => player.position === "ZAG");
  const formationBacklineSlots = slots.LAT + slots.ZAG;
  const defenderCount = latPlayers.length + zagPlayers.length;
  const allowedFlatBacklines = new Set([4, 5]);
  const needsFlatBackline =
    allowedFlatBacklines.has(formationBacklineSlots) &&
    defenderCount === formationBacklineSlots &&
    latPlayers.length === slots.LAT &&
    zagPlayers.length === slots.ZAG &&
    slots.LAT === 2;

  let combinedBacklineInserted = false;

  POSITION_ORDER.toReversed().forEach((position) => {
    if (needsFlatBackline && position === "ZAG" && !combinedBacklineInserted) {
      const defenderTop = `${(
        (POSITION_PITCH_ROWS.LAT * slots.LAT + POSITION_PITCH_ROWS.ZAG * slots.ZAG) / formationBacklineSlots
      ).toFixed(1)}%`;
      const defenderXPositions = getFieldPositions(formationBacklineSlots);
      const sortedLats = [...latPlayers].sort((a, b) => a.id - b.id);
      const sortedZags = [...zagPlayers].sort((a, b) => a.id - b.id);

      const baseLayout = formationBacklineSlots === 4
        ? [
            { player: sortedLats[0], left: defenderXPositions[0] },
            { player: sortedZags[0], left: defenderXPositions[1] },
            { player: sortedZags[1], left: defenderXPositions[2] },
            { player: sortedLats[1], left: defenderXPositions[3] },
          ]
        : [
            { player: sortedLats[0], left: defenderXPositions[0] },
            { player: sortedZags[0], left: defenderXPositions[1] },
            { player: sortedZags[1], left: defenderXPositions[2] },
            { player: sortedZags[2], left: defenderXPositions[3] },
            { player: sortedLats[1], left: defenderXPositions[4] },
          ];

      baseLayout.forEach(({ player, left }) => {
        output.push({
          player,
          top: defenderTop,
          left,
        });
      });

      combinedBacklineInserted = true;
      return;
    }

    if (needsFlatBackline && (position === "LAT" || position === "ZAG")) {
      return;
    }

    const grouped = players.filter((player) => player.position === position);
    const xPositions = getFieldPositions(Math.max(grouped.length, slots[position]));

    grouped.forEach((player, index) => {
      output.push({
        player,
        top: `${POSITION_PITCH_ROWS[position]}%`,
        left: xPositions[index] ?? "50%",
      });
    });
  });

  return output;
};

const derivePlayerSignals = (player: ScoredPlayer) => {
  const recentAverage = Math.max(0, player.score * 0.84 + 1.1);
  const lastRound = Math.max(0, player.score * 1.12);
  const valueRatio = player.score / Math.max(player.price, 1);
  const valueLabel = valueRatio >= 0.9 ? "A+" : valueRatio >= 0.7 ? "A" : valueRatio >= 0.55 ? "B" : "C";

  return {
    recentAverage,
    lastRound,
    valueLabel,
  };
};

const deriveCoachSignals = (coach: ScoredCoach) => {
  const momentum = Math.max(0, coach.score * 0.88 + 0.9);
  const valueRatio = coach.score / Math.max(coach.price, 1);
  const valueLabel = valueRatio >= 1 ? "A+" : valueRatio >= 0.8 ? "A" : valueRatio >= 0.6 ? "B" : "C";

  return {
    momentum,
    valueLabel,
  };
};

const cx = (...classNames: Array<string | false | null | undefined>) =>
  classNames.filter(Boolean).join(" ");

function ClubBadge({
  abbreviation,
  shieldUrl,
  size = "h-10 w-10",
}: {
  abbreviation: string;
  shieldUrl?: string;
  size?: string;
}) {
  if (!shieldUrl) {
    return (
      <span
        className={cx(
          "inline-flex items-center justify-center rounded-full border border-white/10 bg-white/8 text-[11px] font-bold uppercase tracking-[0.12em] text-white/70",
          size,
        )}
      >
        {abbreviation}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center justify-center" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={cx(size, "object-contain")}
        src={shieldUrl}
        alt={`${abbreviation} escudo`}
        loading="lazy"
        draggable={false}
      />
    </span>
  );
}

function SummaryCard({
  title,
  value,
  subtitle,
  accent = "default",
}: {
  title: string;
  value: ReactNode;
  subtitle: string;
  accent?: "default" | "purple" | "green";
}) {
  return (
    <article
      className={cx(
        panelClass,
        "relative min-h-[132px] overflow-hidden p-5",
        accent === "purple" &&
          "bg-[linear-gradient(180deg,rgba(70,55,110,0.82),rgba(50,40,90,0.92))]",
        accent === "green" &&
          "bg-[linear-gradient(180deg,rgba(70,95,80,0.92),rgba(45,70,60,0.90))]",
      )}
    >
      <div className="absolute inset-x-auto top-[-22px] right-[-14px] h-24 w-24 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.14),transparent_68%)]" />
      <p className={eyebrowClass}>{title}</p>
      <strong className="mt-5 block font-[var(--font-display)] text-[32px] leading-[1.05]">
        {value}
      </strong>
      <span className="mt-2 block text-[13px] text-[color:var(--color-text-secondary)]">
        {subtitle}
      </span>
    </article>
  );
}

function RoundLoadingIcon() {
  return (
    <span
      className="inline-flex h-5 w-5 animate-spin rounded-full border border-white/30 border-t-white"
      aria-hidden="true"
    />
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
          surfaceCardClass,
          "grid min-h-[286px] content-start gap-4 p-6 [background:linear-gradient(180deg,rgba(111,77,255,0.18),transparent_40%),linear-gradient(180deg,rgba(50,45,70,0.92),rgba(23,21,32,0.96))]",
        )}
        aria-live="polite"
      >
        <p className={eyebrowClass}>Processando</p>
        <h2 className="m-0 max-w-[11ch] font-[var(--font-display)] text-[28px] leading-[1.15]">
          Montando o melhor time para esta rodada
        </h2>
        <p className="m-0 max-w-[34ch] text-[14px] leading-6 text-[color:var(--color-text-secondary)]">
          Calculando score, custo e encaixe ideal da formacao escolhida.
        </p>
        <div className="mt-2 grid gap-3">
          <div className="h-2 rounded-full bg-white/10">
            <div className="h-full w-2/3 rounded-full bg-[image:var(--gradient-button)]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className={cx(panelClass, "min-h-[92px] p-4")} />
            <div className={cx(panelClass, "min-h-[92px] p-4")} />
          </div>
        </div>
      </section>
    );
  }

  if (viewState.status === "functional-error") {
    return (
      <section
        className={cx(
          surfaceCardClass,
          "grid min-h-[286px] content-start gap-4 p-6 [background:linear-gradient(180deg,rgba(185,28,28,0.14),transparent_38%),linear-gradient(180deg,rgba(50,45,70,0.92),rgba(23,21,32,0.96))]",
        )}
        aria-live="polite"
      >
        <p className={eyebrowClass}>Ajuste necessario</p>
        <h2 className="m-0 font-[var(--font-display)] text-[28px] leading-[1.15]">
          {viewState.error.message}
        </h2>
        {viewState.warnings.length > 0 ? (
          <ul
            className="m-0 list-disc pl-[1.15rem] text-[14px] leading-6 text-[color:var(--color-text-secondary)]"
            aria-label="Warnings da requisicao"
          >
            {viewState.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-[14px] leading-6 text-[color:var(--color-text-secondary)]">
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
          surfaceCardClass,
          "grid min-h-[286px] content-start gap-4 p-6 [background:linear-gradient(180deg,rgba(185,28,28,0.14),transparent_38%),linear-gradient(180deg,rgba(50,45,70,0.92),rgba(23,21,32,0.96))]",
        )}
        aria-live="polite"
      >
        <p className={eyebrowClass}>Falha tecnica</p>
        <h2 className="m-0 font-[var(--font-display)] text-[28px] leading-[1.15]">
          {viewState.message}
        </h2>
        <p className="m-0 text-[14px] leading-6 text-[color:var(--color-text-secondary)]">
          Revise a conexao ou tente novamente para buscar uma nova sugestao.
        </p>
        <button
          className="mt-2 min-h-14 rounded-full border border-white/10 bg-white/8 px-5 text-[15px] font-bold text-white transition hover:bg-white/12"
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
          surfaceCardClass,
          "grid min-h-[286px] content-start gap-5 p-6 [background:linear-gradient(180deg,rgba(111,77,255,0.14),transparent_26%),linear-gradient(180deg,rgba(50,45,70,0.92),rgba(23,21,32,0.96))]",
        )}
        aria-live="polite"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={eyebrowClass}>Resultado</p>
            <h2 className="m-0 font-[var(--font-display)] text-[28px] leading-[1.15]">
              Time sugerido para a rodada {viewState.data.marketRound}
            </h2>
            <p className="mt-2 mb-0 text-[14px] text-[color:var(--color-text-secondary)]">
              {MARKET_STATUS_LABELS[viewState.data.marketStatus]}
            </p>
          </div>
          <div className="rounded-[22px] border border-white/10 bg-white/8 px-4 py-3 text-right">
            <span className="block text-[11px] uppercase tracking-[0.12em] text-[color:var(--color-brand-secondary)]">
              score proj.
            </span>
            <strong className="font-[var(--font-display)] text-[24px]">
              {formatScore(viewState.data.summary.totalScore)}
            </strong>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SummaryCard
            title="Formacao"
            value={viewState.data.summary.formation}
            subtitle={`${viewState.data.lineup.players.length} jogadores escalados`}
            accent="purple"
          />
          <SummaryCard
            title="Saldo"
            value={`C$ ${formatCurrency(viewState.data.summary.remainingBudget)}`}
            subtitle={`Custo total C$ ${formatCurrency(viewState.data.summary.totalCost)}`}
            accent="green"
          />
        </div>
      </section>
    );
  }

  return (
    <section
      className={cx(
        surfaceCardClass,
        "grid min-h-[286px] content-start gap-4 p-6 [background:linear-gradient(180deg,rgba(111,77,255,0.12),transparent_30%),linear-gradient(180deg,rgba(50,45,70,0.92),rgba(23,21,32,0.96))]",
      )}
      aria-live="polite"
    >
      <p className={eyebrowClass}>Painel</p>
      <h2 className="m-0 max-w-[11ch] font-[var(--font-display)] text-[28px] leading-[1.15]">
        Escolha o orcamento e a formacao para receber um elenco completo.
      </h2>
      <p className="m-0 text-[14px] leading-6 text-[color:var(--color-text-secondary)]">
        O resultado mostra titulares, tecnico, score projetado, custo total e avisos da rodada.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard
          title="API"
          value="Ready"
          subtitle="geracao em tempo real"
          accent="purple"
        />
        <SummaryCard
          title="Saida"
          value="11+1"
          subtitle="atletas e tecnico"
          accent="default"
        />
      </div>
    </section>
  );
}

function PlayerCardButton({
  player,
  onSelect,
  compact = false,
}: {
  player: ScoredPlayer;
  onSelect: (player: ScoredPlayer) => void;
  compact?: boolean;
}) {
  const teamTint = useMemo(() => getClubCardTint(player.clubAbbreviation), [player.clubAbbreviation]);

  const tileStyle = useMemo<CSSProperties>(
    () => ({
      background: `linear-gradient(180deg,rgba(255,255,255,0.05),transparent 18%), linear-gradient(145deg,rgba(${teamTint.surfaceStrongRgb},0.25),rgba(${teamTint.surfaceSoftRgb},0.17) 48%,rgba(23,24,28,0.98))`,
      borderColor: `rgba(${teamTint.borderRgb},0.44)`,
    }),
    [teamTint.borderRgb, teamTint.surfaceSoftRgb, teamTint.surfaceStrongRgb],
  );

  const matchupLabel = player.opponentClubAbbreviation
    ? `${player.opponentClubAbbreviation} ${player.isHome ? "em casa" : "fora"}`
    : "Adversario indefinido";

  return (
    <button
      type="button"
      className={cx(
        "grid w-full gap-3 rounded-[24px] border p-[14px] text-left transition duration-200 hover:-translate-y-[2px]",
        compact && "gap-2 rounded-[22px]",
      )}
      style={tileStyle}
      data-testid={`player-card-${player.id}`}
      data-team-color-source={teamTint.isFallback ? "fallback" : "mapped"}
      onClick={() => onSelect(player)}
      aria-label={`Abrir analise de ${player.name}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex min-h-[1.7rem] items-center rounded-full bg-white/92 px-[0.65rem] py-[0.2rem] text-[0.66rem] font-extrabold uppercase tracking-[0.08em] text-[#191a1d]">
          {compact ? POSITION_SHORT_LABELS[player.position] : "Live"}
        </span>
        <span className="text-[0.74rem] font-bold uppercase tracking-[0.08em] text-[color:var(--color-warning)]">
          {formatScore(player.score)} pts
        </span>
      </div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3
            className={cx(
              "m-0 font-[var(--font-display)] leading-[1.04]",
              compact ? "text-[18px]" : "text-[20px]",
            )}
          >
            {player.name}
          </h3>
          <p className="mt-[0.2rem] mb-0 text-[13px] leading-[1.5] text-white/78">
            {POSITION_LABELS[player.position]}
          </p>
        </div>
        <ClubBadge
          abbreviation={player.clubAbbreviation}
          shieldUrl={player.clubShieldUrl}
          size={compact ? "h-9 w-9" : "h-12 w-12"}
        />
      </div>
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3 text-[12px] uppercase tracking-[0.08em] text-white/56">
          <span>Confronto</span>
          <span>Preco</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-[14px] font-bold text-white">
            {player.opponentClubShieldUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="h-6 w-6 object-contain"
                src={player.opponentClubShieldUrl}
                alt={`${player.opponentClubAbbreviation ?? "Rival"} escudo rival`}
                loading="lazy"
                draggable={false}
              />
            ) : null}
            <span>{matchupLabel}</span>
          </span>
          <strong className="text-[14px]">C$ {formatCurrency(player.price)}</strong>
        </div>
      </div>
      {!compact ? (
        <p className="m-0 text-[14px] leading-[1.5] text-white/78">{player.justification}</p>
      ) : null}
    </button>
  );
}

function PitchPlayerIcon({
  player,
  top,
  left,
  isHighlighted,
  onSelectPlayer,
}: {
  player: ScoredPlayer;
  top: string;
  left: string;
  isHighlighted: boolean;
  onSelectPlayer: (player: ScoredPlayer) => void;
}) {
  const teamTint = useMemo(() => getClubCardTint(player.clubAbbreviation), [player.clubAbbreviation]);

  const badgeStyle = useMemo<CSSProperties>(
    () => ({
      backgroundImage: `linear-gradient(180deg,rgba(${teamTint.surfaceSoftRgb},0.95) 0%,rgba(${teamTint.surfaceStrongRgb},0.72) 100%)`,
      borderColor: `rgba(${teamTint.borderRgb},${isHighlighted ? "0.95" : "0.8"})`,
      boxShadow: isHighlighted
        ? `0 0 0 4px rgba(255,255,255,0.14), 0 14px 28px rgba(${teamTint.surfaceStrongRgb},0.34)`
        : "0 0 0 4px rgba(255,255,255,0.06)",
    }),
    [isHighlighted, teamTint.borderRgb, teamTint.surfaceSoftRgb, teamTint.surfaceStrongRgb],
  );

  const labelStyle = useMemo<CSSProperties>(
    () => ({
      color: `rgb(${teamTint.borderRgb})`,
    }),
    [teamTint.borderRgb],
  );

  return (
    <button
      type="button"
      className="absolute z-10 flex w-[86px] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 text-center transition hover:scale-[1.03]"
      style={{ top, left }}
      onClick={() => onSelectPlayer(player)}
      aria-label={`Abrir analise de ${player.name}`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/70">
        {POSITION_SHORT_LABELS[player.position]}
      </span>
      <span
        className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border-[3px] text-[11px] font-extrabold uppercase tracking-[0.08em]"
        style={badgeStyle}
        aria-hidden="true"
      >
        {player.clubShieldUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="h-8 w-8 object-contain"
            src={player.clubShieldUrl}
            alt=""
            loading="lazy"
            draggable={false}
          />
        ) : (
          <span style={labelStyle}>{player.clubAbbreviation}</span>
        )}
      </span>
      <strong className="max-w-full truncate font-[var(--font-display)] text-[11px] leading-3 text-white">
        {player.name}
      </strong>
      <span className="text-[10px] font-semibold leading-3 text-[#8DF8C7]">
        C$ {formatCurrency(player.price)}
      </span>
    </button>
  );
}

function CoachOnFieldBadge({
  coach,
  onSelect,
}: {
  coach: ScoredCoach;
  onSelect: (coach: ScoredCoach) => void;
}) {
  const teamTint = useMemo(() => getClubCardTint(coach.clubAbbreviation), [coach.clubAbbreviation]);

  const badgeStyle = useMemo<CSSProperties>(
    () => ({
      backgroundImage: `linear-gradient(180deg,rgba(${teamTint.surfaceSoftRgb},0.95) 0%,rgba(${teamTint.surfaceStrongRgb},0.72) 100%)`,
      borderColor: `rgba(${teamTint.borderRgb},0.9)`,
      boxShadow: `0 0 0 4px rgba(0,0,0,0.15), 0 14px 28px rgba(${teamTint.surfaceStrongRgb},0.35)`,
    }),
    [teamTint.borderRgb, teamTint.surfaceSoftRgb, teamTint.surfaceStrongRgb],
  );

  return (
    <button
      type="button"
      className="absolute z-20 flex w-[72px] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 text-center transition hover:scale-[1.03]"
      style={{
        top: COACH_FIELD_POSITION.top,
        left: COACH_FIELD_POSITION.left,
      }}
      aria-label={`Tecnico ${coach.name}`}
      onClick={() => onSelect(coach)}
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/70">
        TEC
      </span>
      <span
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border-[3px]"
        style={badgeStyle}
        aria-hidden="true"
      >
        {coach.clubShieldUrl ? (
          <img
            className="h-6 w-6 object-contain"
            src={coach.clubShieldUrl}
            alt=""
            loading="lazy"
            draggable={false}
          />
        ) : (
          <span style={{ color: `rgb(${teamTint.borderRgb})`, fontWeight: 700 }}>
            {coach.clubAbbreviation}
          </span>
        )}
      </span>
      <strong className="max-w-full truncate font-[var(--font-display)] text-[10px] leading-3 text-white">
        {coach.name}
      </strong>
      <span className="text-[9px] font-semibold leading-3 text-[#8DF8C7]">
        C$ {formatCurrency(coach.price)}
      </span>
    </button>
  );
}

function TacticalPitch({
  formation,
  players,
  coach,
  onSelectPlayer,
  onSelectCoach,
}: {
  formation: Formation;
  players: ScoredPlayer[];
  coach: ScoredCoach;
  onSelectPlayer: (player: ScoredPlayer) => void;
  onSelectCoach: (coach: ScoredCoach) => void;
}) {
  const slots = useMemo(() => buildPitchPlayers(players, formation), [formation, players]);
  const bestPlayerId = useMemo(
    () => players.reduce((best, player) => (player.score > best.score ? player : best), players[0])?.id,
    [players],
  );

  return (
    <section className={cx(surfaceCardClass, "overflow-hidden p-5 sm:p-6")}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={eyebrowClass}>Componente formacao</p>
          <h2 className="m-0 font-[var(--font-display)] text-[28px] leading-[1.15]">
            Escalacao do usuario
          </h2>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-2">
          <span className="text-[12px] uppercase tracking-[0.12em] text-[color:var(--color-text-tertiary)]">
            score
          </span>
          <strong className="font-[var(--font-display)] text-[18px]">
            {formatScore(players.reduce((sum, player) => sum + player.score, 0))} pts
          </strong>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {SUPPORTED_FORMATIONS.slice(0, 3).map((option) => (
          <span
            key={option}
            className={cx(
              "inline-flex min-h-10 items-center rounded-full border px-4 text-[13px] font-bold",
              option === formation
                ? "border-[color:var(--color-brand-primary)] bg-[color:var(--color-bg-surface-alt)] text-[color:var(--color-brand-secondary)]"
                : "border-white/10 bg-white/5 text-white/72",
            )}
          >
            {option}
          </span>
        ))}
      </div>

      <div
        className="relative min-h-[440px] overflow-hidden rounded-[30px] border border-[#bff3d433] bg-[linear-gradient(180deg,#17392b_0%,#0f2d22_100%)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]"
        data-testid="tactical-pitch"
      >
        <div className="absolute inset-[6%] rounded-[26px] border border-[#d8fff51a]" />
        <div className="absolute inset-x-[17%] top-[18%] h-[18%] rounded-b-[28px] border border-t-0 border-[#d8fff51a]" />
        <div className="absolute inset-x-[10%] top-[57%] bottom-[8%] rounded-t-[30px] border border-b-0 border-[#d8fff51a]" />
        <div className="absolute left-1/2 top-1/2 h-[110px] w-[110px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#d8fff51a]" />
        <div className="absolute left-[12%] right-[12%] top-1/2 h-px -translate-y-1/2 bg-[#d8fff51a]" />

        {slots.map(({ player, top, left }) => {
          const isHighlighted = player.id === bestPlayerId;

          return (
            <PitchPlayerIcon
              key={player.id}
              player={player}
              top={top}
              left={left}
              isHighlighted={isHighlighted}
              onSelectPlayer={onSelectPlayer}
            />
          );
        })}
        <CoachOnFieldBadge coach={coach} onSelect={onSelectCoach} />
      </div>
    </section>
  );
}

function PlayerModal({
  player,
  onClose,
}: {
  player: ScoredPlayer | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!player) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, player]);

  if (!player) {
    return null;
  }

  const signals = derivePlayerSignals(player);
  const matchupLabel = player.opponentClubAbbreviation
    ? `${player.isHome ? "Casa" : "Fora"} vs ${player.opponentClubAbbreviation}`
    : "Confronto pendente";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--color-bg-overlay)] px-4 py-6 backdrop-blur-md sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[390px] rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(50,45,70,0.96),rgba(25,22,36,0.98))] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.48)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="player-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="text-[12px] uppercase tracking-[0.12em] text-[color:var(--color-text-tertiary)]">
              {player.clubAbbreviation}
            </span>
            <h2
              id="player-modal-title"
              className="mt-2 mb-0 font-[var(--font-display)] text-[28px] leading-[1.15]"
            >
              {player.name}
            </h2>
            <p className="mt-2 mb-0 text-[14px] text-[color:var(--color-text-secondary)]">
              {POSITION_SHORT_LABELS[player.position]} • {matchupLabel}
            </p>
          </div>
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/8 text-white"
            onClick={onClose}
            aria-label="Fechar analise"
          >
            x
          </button>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className={cx(panelClass, "p-3")}>
            <span className="text-[11px] uppercase tracking-[0.12em] text-[color:var(--color-warning)]">
              score
            </span>
            <strong className="mt-2 block font-[var(--font-display)] text-[24px]">
              {formatScore(player.score)}
            </strong>
          </div>
          <div className={cx(panelClass, "p-3")}>
            <span className="text-[11px] uppercase tracking-[0.12em] text-[color:var(--color-text-tertiary)]">
              media rec.
            </span>
            <strong className="mt-2 block font-[var(--font-display)] text-[24px]">
              {formatScore(signals.recentAverage)}
            </strong>
          </div>
          <div className={cx(panelClass, "p-3")}>
            <span className="text-[11px] uppercase tracking-[0.12em] text-[color:var(--color-success)]">
              valor
            </span>
            <strong className="mt-2 block font-[var(--font-display)] text-[24px]">
              {signals.valueLabel}
            </strong>
          </div>
        </div>

        <div className={cx(panelClass, "mt-4 grid gap-3 p-4")}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px] uppercase tracking-[0.12em] text-[color:var(--color-text-tertiary)]">
              Custo
            </span>
            <strong>C$ {formatCurrency(player.price)}</strong>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px] uppercase tracking-[0.12em] text-[color:var(--color-text-tertiary)]">
              Ultima leitura
            </span>
            <strong>{formatScore(signals.lastRound)}</strong>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px] uppercase tracking-[0.12em] text-[color:var(--color-text-tertiary)]">
              Confronto
            </span>
            <strong>{matchupLabel}</strong>
          </div>
        </div>

        <div className={cx(panelClass, "mt-4 grid gap-3 p-4")}>
          <h3 className="m-0 font-[var(--font-display)] text-[20px]">Justificativa</h3>
          <p className="m-0 text-[14px] leading-6 text-[color:var(--color-text-secondary)]">
            {player.justification}
          </p>
        </div>

        <button
          type="button"
          className="mt-5 min-h-[54px] w-full rounded-full bg-[image:var(--gradient-button)] px-5 text-[15px] font-bold text-white shadow-[0_18px_40px_rgba(93,61,255,0.34)] transition hover:brightness-105"
          onClick={onClose}
        >
          Ver atleta na lista
        </button>
      </div>
    </div>
  );
}

function CoachModal({
  coach,
  onClose,
}: {
  coach: ScoredCoach | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!coach) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [coach, onClose]);

  if (!coach) {
    return null;
  }

  const signals = deriveCoachSignals(coach);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--color-bg-overlay)] px-4 py-6 backdrop-blur-md sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[390px] rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(50,45,70,0.96),rgba(25,22,36,0.98))] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.48)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="coach-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="text-[12px] uppercase tracking-[0.12em] text-[color:var(--color-text-tertiary)]">
              {coach.clubAbbreviation}
            </span>
            <h2
              id="coach-modal-title"
              className="mt-2 mb-0 font-[var(--font-display)] text-[28px] leading-[1.15]"
            >
              {coach.name}
            </h2>
            <p className="mt-2 mb-0 text-[14px] text-[color:var(--color-text-secondary)]">
              Treinador projetado para esta rodada
            </p>
          </div>
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/8 text-white"
            onClick={onClose}
            aria-label="Fechar analise do tecnico"
          >
            x
          </button>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className={cx(panelClass, "p-3")}>
            <span className="text-[11px] uppercase tracking-[0.12em] text-[color:var(--color-warning)]">
              score
            </span>
            <strong className="mt-2 block font-[var(--font-display)] text-[24px]">
              {formatScore(coach.score)}
            </strong>
          </div>
          <div className={cx(panelClass, "p-3")}>
            <span className="text-[11px] uppercase tracking-[0.12em] text-[color:var(--color-text-tertiary)]">
              tendencia
            </span>
            <strong className="mt-2 block font-[var(--font-display)] text-[24px]">
              {formatScore(signals.momentum)}
            </strong>
          </div>
          <div className={cx(panelClass, "p-3")}>
            <span className="text-[11px] uppercase tracking-[0.12em] text-[color:var(--color-success)]">
              valor
            </span>
            <strong className="mt-2 block font-[var(--font-display)] text-[24px]">
              {signals.valueLabel}
            </strong>
          </div>
        </div>

        <div className={cx(panelClass, "mt-4 grid gap-3 p-4")}>
          <h3 className="m-0 font-[var(--font-display)] text-[20px]">Justificativa</h3>
          <p className="m-0 text-[14px] leading-6 text-[color:var(--color-text-secondary)]">
            {coach.justification}
          </p>
        </div>

        <button
          type="button"
          className="mt-5 min-h-[54px] w-full rounded-full bg-[image:var(--gradient-button)] px-5 text-[15px] font-bold text-white shadow-[0_18px_40px_rgba(93,61,255,0.34)] transition hover:brightness-105"
          onClick={onClose}
        >
          Fechar analise
        </button>
      </div>
    </div>
  );
}

export function LineupGenerator() {
  const [budget, setBudget] = useState("120.50");
  const [formation, setFormation] = useState<Formation>(SUPPORTED_FORMATIONS[0]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [viewState, setViewState] = useState<ViewState>({ status: "idle" });
  const [selectedPlayer, setSelectedPlayer] = useState<ScoredPlayer | null>(null);
  const [selectedCoach, setSelectedCoach] = useState<ScoredCoach | null>(null);
  const [roundStatus, setRoundStatus] = useState<RoundStatus | null>(null);
  const [roundStatusLoading, setRoundStatusLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadRoundStatus = async () => {
      try {
        const response = await fetch("/api/lineup/status");
        if (!response.ok) {
          return;
        }

        const payload = await response.json();
        if (isRoundStatusPayload(payload) && isMounted) {
          setRoundStatus(payload);
        }
      } catch {
        // swallow failures; show fallback once loading flag resets
      } finally {
        if (isMounted) {
          setRoundStatusLoading(false);
        }
      }
    };

    loadRoundStatus();
    return () => {
      isMounted = false;
    };
  }, []);

  const selectedPlayersCount =
    viewState.status === "success" ? viewState.data.lineup.players.length : 0;

  const roundValueString =
    viewState.status === "success"
      ? String(viewState.data.marketRound)
      : roundStatus
      ? String(roundStatus.marketRound)
      : null;
  const shouldShowRoundSpinner = !roundValueString && roundStatusLoading;
  const roundValueNode = shouldShowRoundSpinner ? (
    <>
      <RoundLoadingIcon />
      <span className="sr-only">Carregando rodada</span>
    </>
  ) : (
    roundValueString ?? "—"
  );
  const fallbackStatusLabel = roundStatusLoading ? "Carregando status" : "Status indisponivel";

  const activeMarketStatus =
    viewState.status === "success"
      ? MARKET_STATUS_LABELS[viewState.data.marketStatus]
      : roundStatus
      ? MARKET_STATUS_LABELS[roundStatus.marketStatus]
      : fallbackStatusLabel;

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

    setSelectedPlayer(null);
    setSelectedCoach(null);
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
    <>
      <main className="min-h-screen overflow-x-hidden px-4 py-5 text-white sm:px-6 sm:py-8">
        <div className="mx-auto grid w-full max-w-[1220px] gap-4 sm:gap-5 lg:gap-6">
          <header className="flex items-center justify-between gap-4 rounded-[28px] border border-white/10 bg-white/[0.04] px-5 py-4 shadow-[var(--shadow-card)] backdrop-blur-xl">
            <div>
              <p className={eyebrowClass}>Cartola Oracle</p>
              <div className="mt-2 flex items-center gap-2 text-[24px] font-bold tracking-[-0.04em]">
                <span className="font-[var(--font-brand)] uppercase">Cartola</span>
                <span className="h-3.5 w-3.5 rounded-full bg-[radial-gradient(circle_at_35%_35%,#ffe27a_0%,#f3ba21_45%,#e99b09_100%)] shadow-[0_0_18px_rgba(243,186,33,0.45)]" />
                <span className="font-[var(--font-display)]">Oracle</span>
              </div>
            </div>
            <div className="rounded-full border border-white/10 bg-white/8 px-4 py-2 text-right">
              <span className="block text-[11px] uppercase tracking-[0.12em] text-[color:var(--color-brand-secondary)]">
                rodada
              </span>
              <strong className="font-[var(--font-display)] text-[18px]">
                {roundValueNode}
              </strong>
            </div>
          </header>

          <section className={cx(surfaceCardClass, "relative overflow-hidden p-6 sm:p-7")}>
            <div className="absolute top-[-60px] right-[-40px] h-44 w-44 rounded-full bg-[radial-gradient(circle,rgba(111,77,255,0.42),transparent_68%)]" />
            <div className="absolute left-[-50px] top-[38%] h-36 w-36 rounded-full bg-[radial-gradient(circle,rgba(141,248,199,0.18),transparent_66%)]" />
            <div className="absolute right-[10%] bottom-[-34px] h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(255,207,102,0.18),transparent_68%)]" />

            <div className="relative z-10 grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_340px] lg:items-start">
              <div className="grid gap-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className={eyebrowClass}>Escalacao inteligente</p>
                    <h1 className="m-0 max-w-[12ch] font-[var(--font-display)] text-[32px] leading-[1.06] sm:text-[42px]">
                      Monte seu time ideal para a rodada.
                    </h1>
                  </div>
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/7 font-[var(--font-display)] text-[18px]">
                    O
                  </span>
                </div>
                <p className="m-0 max-w-[58ch] text-[14px] leading-6 text-[color:var(--color-text-secondary)] sm:text-[15px]">
                  Gere uma escalacao otimizada com leitura rapida de orcamento, formacao e valor esperado.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <SummaryCard
                  title="Rodada"
                  value={roundValueNode}
                  subtitle={activeMarketStatus}
                  accent="purple"
                />
                <SummaryCard
                  title="Resumo rapido"
                  value={
                    viewState.status === "success"
                      ? formatScore(viewState.data.summary.totalScore)
                      : "82.4"
                  }
                  subtitle={
                    viewState.status === "success"
                      ? `Valor medio C$ ${formatCurrency(
                          viewState.data.summary.totalCost / Math.max(selectedPlayersCount, 1),
                        )}`
                      : "Valor medio C$ 11.1"
                  }
                />
              </div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.9fr)] lg:items-start">
            <form
              className={cx(
                surfaceCardClass,
                "grid gap-5 p-6 [background:linear-gradient(180deg,rgba(111,77,255,0.12),transparent_32%),rgba(255,255,255,0.05)]",
              )}
              onSubmit={handleSubmit}
              noValidate
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className={eyebrowClass}>Gerar escalacao</p>
                  <h2 className="m-0 font-[var(--font-display)] text-[28px] leading-[1.15]">
                    Defina orcamento e formacao.
                  </h2>
                </div>
                <span className="inline-flex min-h-8 items-center rounded-full border border-[color:var(--color-brand-primary)] bg-[color:var(--color-bg-surface-alt)] px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[color:var(--color-brand-secondary)]">
                  API ready
                </span>
              </div>

              <label className="grid gap-2" htmlFor="budget">
                <span className="text-[15px] font-bold">Cartoletas disponiveis</span>
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
                  className="min-h-[58px] rounded-[22px] border border-white/10 bg-white/6 px-4 text-white placeholder:text-white/45"
                />
                <small id="budget-help" className="text-[13px] text-[color:var(--color-text-tertiary)]">
                  Defina o teto de cartoletas para montar o elenco.
                </small>
                {fieldErrors.budget ? (
                  <strong className="text-[13px] text-[#ff8a8a]" id="budget-error">
                    {fieldErrors.budget}
                  </strong>
                ) : null}
              </label>

              <label className="grid gap-2" htmlFor="formation">
                <span className="text-[15px] font-bold">Formacao</span>
                <select
                  id="formation"
                  name="formation"
                  value={formation}
                  onChange={(event) => setFormation(event.target.value as Formation)}
                  aria-invalid={fieldErrors.formation ? "true" : "false"}
                  aria-describedby={fieldErrors.formation ? "formation-error" : "formation-help"}
                  className="min-h-[58px] rounded-[22px] border border-white/10 bg-white/6 px-4 text-white"
                >
                  {SUPPORTED_FORMATIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <small id="formation-help" className="text-[13px] text-[color:var(--color-text-tertiary)]">
                  Todas as formacoes aceitas pelo contrato da API.
                </small>
                {fieldErrors.formation ? (
                  <strong className="text-[13px] text-[#ff8a8a]" id="formation-error">
                    {fieldErrors.formation}
                  </strong>
                ) : null}
              </label>

              <div className="flex flex-wrap gap-2">
                <span className="inline-flex min-h-9 items-center rounded-full border border-white/10 bg-white/6 px-4 text-[13px] text-white/78">
                  {budget || "120"} cartoletas
                </span>
                <span className="inline-flex min-h-9 items-center rounded-full border border-[color:var(--color-brand-primary)] bg-[color:var(--color-bg-surface-alt)] px-4 text-[13px] font-bold text-[color:var(--color-brand-secondary)]">
                  {formation}
                </span>
              </div>

              <button
                className="min-h-[58px] rounded-full bg-[image:var(--gradient-button)] px-5 text-[16px] font-bold text-white shadow-[0_18px_40px_rgba(93,61,255,0.34)] transition hover:brightness-105 disabled:cursor-wait disabled:opacity-70"
                type="submit"
                disabled={viewState.status === "loading"}
              >
                {viewState.status === "loading" ? "Gerando time..." : "Gerar time"}
              </button>
            </form>

              <StatusPanel
                viewState={viewState}
                onReset={() => {
                  setSelectedPlayer(null);
                  setSelectedCoach(null);
                  setViewState({ status: "idle" });
                }}
              />
          </section>

          {viewState.status === "success" ? (
            <section className="grid gap-4" aria-label="Resultado da escalacao">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
                <TacticalPitch
                  formation={viewState.data.summary.formation}
                  players={viewState.data.lineup.players}
                  coach={viewState.data.lineup.coach}
                  onSelectPlayer={setSelectedPlayer}
                  onSelectCoach={setSelectedCoach}
                />

                <section className={cx(surfaceCardClass, "grid gap-4 p-6")}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className={eyebrowClass}>Atletas selecionados</p>
                      <h2 className="m-0 font-[var(--font-display)] text-[28px] leading-[1.15]">
                        {selectedPlayersCount} jogadores escalados
                      </h2>
                    </div>
                    <span className="text-[13px] text-[color:var(--color-text-secondary)]">12 cards</span>
                  </div>

                  <div className="grid gap-3">
                    {viewState.data.lineup.players.map((player) => (
                      <button
                        key={player.id}
                        type="button"
                        className={cx(panelClass, "flex items-center justify-between gap-3 p-4 text-left transition hover:bg-white/[0.09]")}
                        onClick={() => setSelectedPlayer(player)}
                        aria-label={`Abrir analise de ${player.name}`}
                      >
                        <div className="flex items-center gap-3">
                          <ClubBadge
                            abbreviation={player.clubAbbreviation}
                            shieldUrl={player.clubShieldUrl}
                            size="h-10 w-10"
                          />
                          <div>
                            <span className="text-[12px] uppercase tracking-[0.12em] text-[color:var(--color-text-tertiary)]">
                              {POSITION_SHORT_LABELS[player.position]}
                            </span>
                            <strong className="mt-1 block text-[16px]">{player.name}</strong>
                          </div>
                        </div>
                        <span className="text-[14px] font-bold text-[color:var(--color-warning)]">
                          {formatScore(player.score)} pts
                        </span>
                      </button>
                    ))}
                    <button
                      type="button"
                      className={cx(panelClass, "flex items-center justify-between gap-3 p-4 text-left transition hover:bg-white/[0.09]")}
                      onClick={() => setSelectedCoach(viewState.data.lineup.coach)}
                      aria-label={`Abrir analise do tecnico ${viewState.data.lineup.coach.name}`}
                    >
                      <div className="flex items-center gap-3">
                        <ClubBadge
                          abbreviation={viewState.data.lineup.coach.clubAbbreviation}
                          shieldUrl={viewState.data.lineup.coach.clubShieldUrl}
                          size="h-11 w-11"
                        />
                        <div>
                          <span className="text-[12px] uppercase tracking-[0.12em] text-[color:var(--color-text-tertiary)]">
                            Tecnico
                          </span>
                          <strong className="mt-1 block text-[16px]">{viewState.data.lineup.coach.name}</strong>
                        </div>
                      </div>
                      <span className="text-[14px] font-bold text-[color:var(--color-warning)]">
                        {formatScore(viewState.data.lineup.coach.score)} pts
                      </span>
                    </button>
                  </div>
                </section>
              </div>

            </section>
          ) : (
            <section className="grid gap-4 lg:grid-cols-2">
              <section className={cx(surfaceCardClass, "grid gap-4 p-6")}>
                <div>
                  <p className={eyebrowClass}>O que entra no resultado</p>
                  <h2 className="m-0 font-[var(--font-display)] text-[28px] leading-[1.15]">
                    Campo tatico e leitura expandida
                  </h2>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <article className={cx(panelClass, "grid gap-2 p-4 [background:linear-gradient(180deg,rgba(70,95,80,0.92),rgba(45,70,60,0.90))]")}>
                    <strong className="font-[var(--font-display)] text-[20px]">Campo tatico</strong>
                    <p className="m-0 text-[14px] leading-6 text-[color:var(--color-text-secondary)]">
                      11 atletas distribuidos por formacao com score por posicao.
                    </p>
                    <span className="text-[12px] uppercase tracking-[0.12em] text-[color:var(--color-success)]">
                      score por posicao
                    </span>
                  </article>
                  <article className={cx(panelClass, "grid gap-2 p-4 [background:linear-gradient(180deg,rgba(70,55,110,0.82),rgba(50,40,90,0.92))]")}>
                    <strong className="font-[var(--font-display)] text-[20px]">Modal analitico</strong>
                    <p className="m-0 text-[14px] leading-6 text-[color:var(--color-text-secondary)]">
                      Media, custo, justificativa expandida e acesso rapido ao atleta.
                    </p>
                    <span className="text-[12px] uppercase tracking-[0.12em] text-[color:var(--color-brand-secondary)]">
                      tap para abrir
                    </span>
                  </article>
                </div>
              </section>

            </section>
          )}
        </div>
      </main>

      <PlayerModal player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />
      <CoachModal coach={selectedCoach} onClose={() => setSelectedCoach(null)} />
    </>
  );
}
