import { Formation, GeneratedLineup, ScoredCoach, ScoredPlayer } from "../domain/types";

export interface GenerateLineupInput {
  budget: number;
  formation: Formation;
  players: ScoredPlayer[];
  coaches: ScoredCoach[];
}

export interface LineupOptimizer {
  generateLineup(input: GenerateLineupInput): GeneratedLineup;
}
