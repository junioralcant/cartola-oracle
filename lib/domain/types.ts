export type Position = "GOL" | "LAT" | "ZAG" | "MEI" | "ATA";

export type MarketStatus = "open" | "closed" | "maintenance" | "paused";

export interface CartolaMarketStatus {
  rodada_atual: number;
  status_mercado: number;
  esquema_default_id: number;
}

export interface CartolaAthlete {
  atleta_id: number;
  apelido: string;
  posicao_id: number;
  clube_id: number;
  preco_num: number;
  media_num: number;
  pontos_num: number;
  scout: Record<string, number>;
}

export interface CartolaCoach {
  tecnico_id: number;
  nome: string;
  clube_id: number;
  preco_num: number;
}

export interface CartolaClubProfile {
  nome: string;
  abreviacao: string;
}

export interface CartolaMatch {
  clube_casa_id: number;
  clube_visitante_id: number;
  partida_data: string;
  local: string;
}

export interface LastRoundScore {
  id: number;
  pontuacao: number;
  scout: Record<string, number>;
}

export const SUPPORTED_FORMATIONS = [
  "4-3-3",
  "4-4-2",
  "3-5-2",
  "3-4-3",
  "5-3-2",
  "5-4-1",
  "4-2-3-1",
] as const;

export type Formation = (typeof SUPPORTED_FORMATIONS)[number];

export type FormationSlotMap = Record<Position, number>;

export const FORMATION_SLOTS: Record<Formation, FormationSlotMap> = {
  "4-3-3": { GOL: 1, LAT: 2, ZAG: 2, MEI: 3, ATA: 3 },
  "4-4-2": { GOL: 1, LAT: 2, ZAG: 2, MEI: 4, ATA: 2 },
  "3-5-2": { GOL: 1, LAT: 2, ZAG: 1, MEI: 5, ATA: 2 },
  "3-4-3": { GOL: 1, LAT: 2, ZAG: 1, MEI: 4, ATA: 3 },
  "5-3-2": { GOL: 1, LAT: 2, ZAG: 3, MEI: 3, ATA: 2 },
  "5-4-1": { GOL: 1, LAT: 2, ZAG: 3, MEI: 4, ATA: 1 },
  "4-2-3-1": { GOL: 1, LAT: 2, ZAG: 2, MEI: 5, ATA: 1 },
};

export interface ScoredPlayer {
  id: number;
  name: string;
  position: Position;
  clubId: number;
  clubAbbreviation: string;
  clubShieldUrl?: string;
  price: number;
  score: number;
  justification: string;
}

export interface ScoredCoach {
  id: number;
  name: string;
  clubId: number;
  clubAbbreviation: string;
  clubShieldUrl?: string;
  price: number;
  score: number;
  justification: string;
}

export interface GeneratedLineup {
  formation: Formation;
  players: ScoredPlayer[];
  coach: ScoredCoach;
  totalCost: number;
  totalScore: number;
  remainingBudget: number;
}

export type PlayerScoreFactor =
  | "lastRound"
  | "average"
  | "value"
  | "opponent"
  | "clubStrength"
  | "home";

export type CoachScoreFactor = "value" | "opponent" | "clubStrength" | "home";

export interface PlayerScoreWeights {
  lastRound: number;
  average: number;
  value: number;
  opponent: number;
  clubStrength: number;
  home: number;
}

export interface CoachScoreWeights {
  value: number;
  opponent: number;
  clubStrength: number;
  home: number;
}

export interface ScoreWeights {
  player: PlayerScoreWeights;
  coach: CoachScoreWeights;
}
