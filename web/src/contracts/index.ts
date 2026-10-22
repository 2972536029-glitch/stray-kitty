export type GamePhase = 'dialogue' | 'explore' | 'event' | 'preparation' | 'battle' | 'settlement' | 'home';
export interface BattleAttempt {id: string; stageId: string; status: 'active' | 'won' | 'lost'}
export interface GameState {
  schemaVersion: 1; contentVersion: string; revision: number; phase: GamePhase;
  chapterId: string; storyNodeId: string; mapId: string; flags: string[];
  cats: string[]; inventory: Record<string, number>; currencies: Record<string, number>;
  furniture: string[]; placements: Record<string, string>; completedStages: string[];
  pendingEventId: string; activeBattle: BattleAttempt | null;
  lastResult: {message: string; roll?: number; outcome?: string; firstClear?: boolean};
}
export type GameCommand =
  | {type: 'ADVANCE_STORY'; nodeId: string}
  | {type: 'INTERACT'; interactionId: string}
  | {type: 'CHOOSE_EVENT'; eventId: string; optionId: string}
  | {type: 'START_BATTLE'; stageId: string}
  | {type: 'COMPLETE_BATTLE'; attemptId: string; outcome: 'won' | 'lost'}
  | {type: 'CONTINUE'} | {type: 'GO_HOME'} | {type: 'GO_EXPLORE'}
  | {type: 'PLACE_FURNITURE'; furnitureId: string; slotId: string}
  | {type: 'DRAW_FURNITURE'; poolId: string};
export interface CommandRequest {expectedRevision: number; command: GameCommand}
export interface CommandResponse {state: GameState; replayed: boolean}
export interface Session {playerId: string; token: string}
export interface ApiErrorBody {error: {code: string; message: string; requestId: string}}
export interface StoryNode {id: string; chapterId: string; speaker: string; text: string; next: string; exit: 'explore' | 'home' | ''}
export interface MapInteraction {id: string; x: number; y: number; label: string; eventId: string}
export interface MapDefinition {id: string; name: string; status: string; width: number; height: number; interactions: MapInteraction[]}
export interface EventDefinition {id: string; title: string; text: string; options: {id: string; label: string; threshold: number; material: number}[]}
export interface StageDefinition {id: string; name: string; status: string; lanes: number; columns: number; waves: number}
export interface ModuleResult<T> {status: 'completed' | 'cancelled'; data: T}
export interface BattleContext {attempt: BattleAttempt; stage: StageDefinition; catIds: string[]; modifiers: string[]}
export interface BattleResult {attemptId: string; outcome: 'won' | 'lost'}
export interface MapContext {map: MapDefinition; flags: string[]; spawn: {x: number; y: number}}
export interface Catalog {
  version: string;
  chapters: {id: string; title: string; summary: string; status: string}[];
  story: StoryNode[]; maps: MapDefinition[]; events: EventDefinition[]; stages: StageDefinition[];
  cats: {id: string; name: string; color: string; description: string; skill: string}[];
  furniture: {id: string; name: string; theme: string}[];
  slots: {id: string; name: string}[];
  items: {id: string; name: string; description: string}[];
  pools: {id: string; name: string; cost: number; requiredFlag: string; entries: {furnitureId: string; weight: number}[]}[];
  tutorials: {phase: GamePhase; text: string}[];
  assets: {id: string; kind: string; path: string}[];
}
