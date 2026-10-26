import { z } from 'zod';
import {
  AIDecisionRecord,
  GameAction,
  GameEvent,
  GameRulesConfig,
  PlayerColor,
  PlayerView,
  ReplayFile
} from '@catan/core';

export const ResourceTypeSchema = z.enum(['wood', 'brick', 'sheep', 'wheat', 'ore']);

export const PartialResourceCountSchema = z
  .object({
    wood: z.number().int().min(0).optional(),
    brick: z.number().int().min(0).optional(),
    sheep: z.number().int().min(0).optional(),
    wheat: z.number().int().min(0).optional(),
    ore: z.number().int().min(0).optional()
  })
  .strict();

export const AIDifficultySchema = z.enum(['beginner', 'medium', 'advanced', 'expert']);

export const AIStrategyStyleSchema = z.enum([
  'balanced',
  'expansion',
  'development',
  'commercial',
  'competitive',
  'adaptive'
]);

export const ParticipantTypeSchema = z.enum(['human', 'ai', 'llm', 'passive']);

export const PlayerColorSchema = z.enum(['red', 'blue', 'orange', 'green']);

export const GameRulesConfigSchema = z
  .object({
    presetId: z.enum(['standard', 'small_group', 'custom']).optional(),
    victoryPointsToWin: z.union([z.literal(10), z.literal(12), z.literal(14)]).optional(),
    startingResourcesRule: z.enum(['second_settlement', 'both_settlements']).optional(),
    knightStealRule: z.enum(['single', 'all_adjacent']).optional(),
    robber7StealRule: z.enum(['single', 'all_adjacent']).optional(),
    devCardsPerTurnRule: z.enum(['one_total', 'one_per_type']).optional(),
    tradeOfferTimeoutSec: z.number().int().min(5).max(300).optional(),
    boardLayout: z.enum(['random_balanced', 'random_pure', 'beginner_fixed']).optional(),
    autoFillPassiveBotsMinPlayers: z.number().int().min(1).max(4).optional()
  })
  .strict();

export const GameActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('place_initial_settlement'),
    vertexId: z.string().min(2).max(10)
  }),
  z.object({
    type: z.literal('place_initial_road'),
    edgeId: z.string().min(2).max(10)
  }),
  z.object({
    type: z.literal('roll_dice')
  }),
  z.object({
    type: z.literal('discard_cards'),
    resources: PartialResourceCountSchema
  }),
  z.object({
    type: z.literal('move_robber'),
    hexId: z.string().min(2).max(10),
    targetPlayerId: z.string().optional()
  }),
  z.object({
    type: z.literal('steal_from_player'),
    targetPlayerId: z.string().min(1)
  }),
  z.object({
    type: z.literal('build_road'),
    edgeId: z.string().min(2).max(10)
  }),
  z.object({
    type: z.literal('build_settlement'),
    vertexId: z.string().min(2).max(10)
  }),
  z.object({
    type: z.literal('build_city'),
    vertexId: z.string().min(2).max(10)
  }),
  z.object({
    type: z.literal('buy_dev_card')
  }),
  z.object({
    type: z.literal('play_knight'),
    hexId: z.string().min(2).max(10),
    targetPlayerId: z.string().optional()
  }),
  z.object({
    type: z.literal('play_road_building')
  }),
  z.object({
    type: z.literal('place_free_road'),
    edgeId: z.string().min(2).max(10)
  }),
  z.object({
    type: z.literal('play_year_of_plenty'),
    resources: z.tuple([ResourceTypeSchema, ResourceTypeSchema])
  }),
  z.object({
    type: z.literal('play_monopoly'),
    resource: ResourceTypeSchema
  }),
  z.object({
    type: z.literal('trade_bank'),
    give: ResourceTypeSchema,
    giveAmount: z.number().int().min(2).max(19),
    receive: ResourceTypeSchema
  }),
  z.object({
    type: z.literal('propose_trade'),
    toPlayerId: z.string().optional(),
    offering: PartialResourceCountSchema,
    requesting: PartialResourceCountSchema
  }),
  z.object({
    type: z.literal('respond_trade'),
    offerId: z.string().min(1),
    response: z.enum(['accept', 'reject']),
    reason: z.string().optional()
  }),
  z.object({
    type: z.literal('cancel_trade'),
    offerId: z.string().min(1)
  }),
  z.object({
    type: z.literal('end_turn')
  })
]);

export const LobbySeatConfigSchema = z.object({
  seatIndex: z.number().int().min(0).max(3),
  name: z.string().min(1).max(40),
  type: z.enum(['human', 'ai', 'llm', 'passive', 'open']),
  color: PlayerColorSchema.optional(),
  aiDifficulty: AIDifficultySchema.optional(),
  aiStyle: AIStrategyStyleSchema.optional()
});

export type LobbySeatConfig = z.infer<typeof LobbySeatConfigSchema>;

export interface LobbySeatState extends LobbySeatConfig {
  playerId: string;
  color: PlayerColor;
  connected: boolean;
  claimedByPlayerName?: string;
}

export type DisconnectPolicy = 'wait' | 'replace_with_ai' | 'abandon';

export interface LobbyState {
  lobbyId: string;
  name: string;
  mode: 'local' | 'lan' | 'online';
  hostPlayerId: string;
  isPrivate: boolean;
  inviteCode?: string;
  disconnectPolicy: DisconnectPolicy;
  rules: GameRulesConfig;
  seed?: string;
  seats: LobbySeatState[];
  status: 'waiting' | 'in_progress' | 'finished';
  gameId?: string;
  createdAtMs: number;
}

export const CreateLobbyRequestSchema = z.object({
  name: z.string().min(1).max(60).default('Partidă Catan'),
  hostName: z.string().min(1).max(40).default('Jucător 1'),
  mode: z.enum(['local', 'lan', 'online']).default('local'),
  isPrivate: z.boolean().default(false),
  disconnectPolicy: z.enum(['wait', 'replace_with_ai', 'abandon']).default('wait'),
  seed: z.string().max(80).optional(),
  rules: GameRulesConfigSchema.optional(),
  seats: z.array(LobbySeatConfigSchema).min(1).max(4).optional()
});

export const ConfigureLobbyRequestSchema = z.object({
  sessionToken: z.string().min(1),
  rules: GameRulesConfigSchema.optional(),
  disconnectPolicy: z.enum(['wait', 'replace_with_ai', 'abandon']).optional(),
  seats: z.array(LobbySeatConfigSchema).min(1).max(4).optional(),
  seed: z.string().max(80).optional()
});

export const JoinLobbyRequestSchema = z.object({
  playerName: z.string().min(1).max(40),
  seatIndex: z.number().int().min(0).max(3).optional(),
  inviteCode: z.string().optional(),
  sessionToken: z.string().optional()
});

export const SubmitActionRequestSchema = z.object({
  sessionToken: z.string().min(1),
  playerId: z.string().min(1),
  expectedSequence: z.number().int().min(0).optional(),
  action: GameActionSchema
});

export const ClientToServerWsMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('authenticate'),
    gameId: z.string().min(1),
    sessionToken: z.string().min(1)
  }),
  z.object({
    type: z.literal('submit_action'),
    gameId: z.string().min(1),
    sessionToken: z.string().min(1),
    expectedSequence: z.number().int().min(0).optional(),
    action: GameActionSchema
  }),
  z.object({
    type: z.literal('ping')
  })
]);

export type ClientToServerWsMessage = z.infer<typeof ClientToServerWsMessageSchema>;

export type ServerToClientWsMessage =
  | {
      type: 'state_sync';
      gameId: string;
      playerView: PlayerView;
      legalActions: GameAction[];
      recentEvents: GameEvent[];
      aiDecisions: AIDecisionRecord[];
    }
  | {
      type: 'action_rejected';
      gameId: string;
      code: string;
      reason: string;
      currentSequence: number;
    }
  | {
      type: 'lobby_updated';
      lobby: LobbyState;
    }
  | {
      type: 'pong';
      timestampMs: number;
    };

export interface ReplaySummaryItem {
  gameId: string;
  seed: string;
  createdAtMs: number;
  turns: number;
  eventsCount: number;
  winnerId: string | null;
  players: Array<{ id: string; name: string; type: string; color: string; score: number }>;
}

export interface FullGameReplayResponse {
  replay: ReplayFile;
}
