import React, { useCallback, useMemo, useState } from 'react';
import {
  DevCardType,
  GameState,
  PlayerView,
  TradeOffer,
  createEmptyResources,
  getPlayerView,
  isScenarioWithShips,
  reconstructStateAtSequence
} from '@catan/core';
import { runSimulatedGame } from '@catan/ai';
import { Dialog } from './ui/Dialog';
import { AdaptiveSurface } from './ui/AdaptiveSurface';
import { ThemeToggle } from './ui/ThemeToggle';
import { useTheme } from '../hooks/useTheme';
import { useTradeState } from '../hooks/useTradeState';
import { AiThinkingIndicator } from './game/AiThinkingIndicator';
import { ScoreBank } from './game/ScoreBank';
import { EventLog } from './game/EventLog';
import { CostsHelp } from './game/CostsHelp';
import { FullRules } from './game/FullRules';
import { ReleaseNotes, ReleaseNoteEntry } from './game/ReleaseNotes';
import { StartingOrder } from './game/StartingOrder';
import { TradeOfferBuilder } from './game/TradeOfferBuilder';
import { CounterTradeOffer } from './game/CounterTradeOffer';
import { DevCardsPanel } from './game/DevCardsPanel';
import { PlayMonopolyDialog } from './game/PlayMonopolyDialog';
import { PlayYearOfPlentyDialog } from './game/PlayYearOfPlentyDialog';
import { DiscardDialog } from './game/DiscardDialog';
import { StealResourceDialog } from './game/StealResourceDialog';
import { IncomingTradeOfferDialog } from './game/IncomingTradeOfferDialog';
import { WaitingRoomPanel } from './game/WaitingRoomPanel';
import { GameOverDialog } from './game/GameOverDialog';
import { InGameTerminationDialog } from './game/InGameTerminationDialog';
import { LobbyState, OnlineSession } from '../online';
import { Locale } from '../i18n';

export interface UiShowcaseProps {
  /** Active UI locale, forwarded to every demoed component that takes one. */
  locale: Locale;
  /** Called when the user leaves the showcase (back-to-lobby button). */
  onExit?: () => void;
}

type PanelId =
  | 'score_bank'
  | 'event_log'
  | 'costs_help'
  | 'full_rules'
  | 'release_notes'
  | 'starting_order'
  | 'trade'
  | 'counter_trade'
  | 'dev_cards'
  | 'play_monopoly'
  | 'play_year_of_plenty'
  | 'discard'
  | 'steal_resource'
  | 'incoming_trade'
  | 'waiting_room'
  | 'game_over'
  | 'in_game_termination';

// Fixed seed so the showcase's sample AI-vs-AI game (and therefore every derived prop below)
// is stable and reproducible across reloads instead of a new random game every render.
const SHOWCASE_SIM_SEED = 'ui-showcase-fixed-seed-v1';

const DEMO_PARTICIPANTS = [
  { id: 'p1', name: 'AI Expert Adaptiv', type: 'ai' as const, color: 'red' as const, aiDifficulty: 'expert' as const, aiStyle: 'adaptive' as const },
  { id: 'p2', name: 'AI Avansat Dezvoltare', type: 'ai' as const, color: 'blue' as const, aiDifficulty: 'advanced' as const, aiStyle: 'development' as const },
  { id: 'p3', name: 'AI Mediu Expansiune', type: 'ai' as const, color: 'orange' as const, aiDifficulty: 'medium' as const, aiStyle: 'expansion' as const },
  { id: 'p4', name: 'AI Începător Comercial', type: 'ai' as const, color: 'green' as const, aiDifficulty: 'beginner' as const, aiStyle: 'commercial' as const }
];

function SectionHeading({ title, description }: { title: string; description: string }): React.ReactElement {
  return (
    <div className="mb-3">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <p className="text-sm text-inkSoft">{description}</p>
    </div>
  );
}

function DemoButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }): React.ReactElement {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded border border-line bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-surfaceMuted disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  );
}

/**
 * Dev-only showcase that renders every game-specific modal/panel component immediately, with
 * realistic sample data, independently of real game state — so each one can be reviewed on
 * demand instead of only appearing once the live game reaches the exact state that normally
 * triggers it (e.g. the discard dialog only appearing after rolling a 7 with 8+ cards).
 *
 * Every GameState/PlayerView/TradeOffer/etc. below is read-only sample data derived from one
 * fixed-seed local AI-vs-AI simulation (see runSimulatedGame + reconstructStateAtSequence,
 * exactly as ReplayAndAnalysisView.tsx uses them) — nothing here ever calls executeAction,
 * submitOnlineAction, or any other network/game-mutating call. All callbacks are no-ops or
 * purely local-state demo stubs.
 */
export function UiShowcase({ locale, onExit }: UiShowcaseProps): React.ReactElement {
  const { theme, setTheme } = useTheme();
  const [openPanel, setOpenPanel] = useState<PanelId | null>(null);
  const [dialogDemoOpen, setDialogDemoOpen] = useState(false);
  const [surfaceDemoOpen, setSurfaceDemoOpen] = useState(false);
  const [aiThinkingSince, setAiThinkingSince] = useState<number | null>(null);
  const [isRenamingSeat, setIsRenamingSeat] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');

  const closePanel = useCallback(() => setOpenPanel(null), []);

  // One fixed AI-vs-AI replay, generated once with a stable seed.
  const replay = useMemo(() => {
    const sim = runSimulatedGame({
      seed: SHOWCASE_SIM_SEED,
      participants: DEMO_PARTICIPANTS,
      recordReplay: true
    });
    return sim.replay ?? null;
  }, []);

  // Mid-game state: enough turns in that players hold resources, built pieces, and likely a
  // dev card or two — the backbone GameState/PlayerView pair for most demos below.
  const midGameState: GameState | null = useMemo(() => {
    if (!replay) return null;
    return reconstructStateAtSequence(replay, Math.min(40, replay.events.length), false);
  }, [replay]);

  // Separate, later reconstruction where the simulated game actually finished (winnerId set) —
  // used only by the Game Over demo, rather than forcing the mid-game state into having a winner.
  const gameOverState: GameState | null = useMemo(() => {
    if (!replay) return null;
    const final = reconstructStateAtSequence(replay, replay.events.length, false);
    return final.winnerId ? final : null;
  }, [replay]);

  const viewerId = midGameState?.players[0]?.id ?? '';
  const playerView: PlayerView | null = useMemo(
    () => (midGameState ? getPlayerView(midGameState, viewerId) : null),
    [midGameState, viewerId]
  );

  const activePlayer = useMemo(
    () => midGameState?.players.find((p) => p.id === midGameState.activePlayerId) ?? midGameState?.players[0] ?? null,
    [midGameState]
  );
  const viewerPlayer = useMemo(
    () => midGameState?.players.find((p) => p.id === viewerId) ?? null,
    [midGameState, viewerId]
  );
  const hasShipsInScenario = Boolean(midGameState && isScenarioWithShips(midGameState.rules.boardScenario));

  const unplayedDevCards = viewerPlayer?.devCards.filter((c) => !c.played) ?? [];
  const devCardCountsByType: Record<DevCardType, number> = useMemo(() => {
    const counts: Record<DevCardType, number> = {
      knight: 0,
      road_building: 0,
      year_of_plenty: 0,
      monopoly: 0,
      victory_point: 0
    };
    for (const c of unplayedDevCards) counts[c.type]++;
    return counts;
  }, [unplayedDevCards]);

  // Reuses the exact hook App.tsx uses in-game for the trade/dev-card/discard sub-modal staging
  // state, so the showcase's TradeOfferBuilder/CounterTradeOffer/PlayMonopolyDialog/etc. demos
  // behave like the real thing locally — every "dispatch" below is a console.info stub, never a
  // real executeAction.
  const trade = useTradeState({
    gameState: midGameState,
    executeAction: (playerId, action) => console.info('[showcase] would executeAction', playerId, action),
    viewerId,
    showActionFeedback: (content) => console.info('[showcase] feedback', content),
    locale
  });

  // Sample open incoming trade offer — not derived from the replay (a finished/mid AI-vs-AI
  // game doesn't reliably leave one open at a fixed sequence), but shaped exactly like a real
  // TradeOffer so IncomingTradeOfferDialog/CounterTradeOffer render for real.
  const sampleOffer: TradeOffer | null = useMemo(() => {
    if (!midGameState || midGameState.players.length < 2) return null;
    const proposer = midGameState.players[1];
    return {
      id: 'showcase-offer-1',
      fromPlayerId: proposer.id,
      offering: { ...createEmptyResources(), wood: 2, brick: 1 },
      requesting: { ...createEmptyResources(), ore: 1 },
      createdAtMs: Date.now(),
      expiresAtMs: Date.now() + 60_000,
      rejectedByPlayerIds: [],
      status: 'open'
    };
  }, [midGameState]);

  // Sample robber-steal context — the mid-game reconstruction isn't necessarily paused in
  // steal_resource phase, so this derives a shallow copy with a plausible eligible-targets list
  // rather than mutating the real reconstructed state.
  const stealGameState: GameState | null = useMemo(() => {
    if (!midGameState || !activePlayer) return null;
    return {
      ...midGameState,
      robberContext: {
        source: 'dice_7',
        returnPhase: 'main_actions',
        eligibleTargetIds: midGameState.players.filter((p) => p.id !== activePlayer.id).map((p) => p.id)
      }
    };
  }, [midGameState, activePlayer]);

  // Sample waiting-room lobby/session — this surface only ever exists before any game/replay
  // data does, so it can't be derived from the GameState backbone at all.
  const sampleLobby: LobbyState = useMemo(
    () => ({
      lobbyId: 'showcase-lobby',
      name: 'Partidă de Test',
      mode: 'online',
      hostPlayerId: 'p1',
      isPrivate: false,
      inviteCode: 'DEMO42',
      status: 'waiting',
      seats: [
        { seatIndex: 0, playerId: 'p1', name: 'Alex', type: 'human', color: 'red', connected: true },
        { seatIndex: 1, playerId: 'p2', name: 'Bogdan', type: 'human', color: 'blue', connected: false },
        { seatIndex: 2, playerId: 'p3', name: '', type: 'open', color: 'orange', connected: false },
        { seatIndex: 3, playerId: 'p4', name: 'AI Bot', type: 'ai', color: 'green', connected: true, aiDifficulty: 'advanced' }
      ]
    }),
    []
  );
  const sampleSession: OnlineSession = useMemo(
    () => ({ lobbyId: 'showcase-lobby', gameId: null, sessionToken: 'showcase-token', playerId: 'p1' }),
    []
  );

  const sampleReleaseNotes: ReleaseNoteEntry[] = [
    { hash: 'abc1234', date: '2026-10-30', message: 'feat(web): add UI Showcase dev page' },
    { hash: 'def5678', date: '2026-10-29', message: 'fix(web): mobile in-game HUD overflow' },
    { hash: 'gh90123', date: '2026-10-28', message: 'refactor(web): migrate hamburger nav onto AppNav' }
  ];

  const triggerAiThinking = useCallback(() => {
    setAiThinkingSince(Date.now());
    setTimeout(() => setAiThinkingSince(null), 5000);
  }, []);

  if (!midGameState || !playerView || !activePlayer || !viewerPlayer) {
    return (
      <main className="p-6 text-ink">
        <p>
          {locale === 'ro'
            ? 'Nu s-a putut genera o partidă de test pentru galeria de componente.'
            : 'Could not generate a sample game for the component showcase.'}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl space-y-10 p-6 text-ink">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">🧪 UI Showcase</h1>
          <p className="text-sm text-inkSoft">
            {locale === 'ro'
              ? 'Fiecare componentă de mai jos poate fi deschisă pe loc, cu date de test, fără să fie nevoie să joci o partidă reală.'
              : 'Every component below can be opened on the spot with sample data, without playing a real game.'}
          </p>
        </div>
        {onExit && (
          <button type="button" onClick={onExit} className="rounded border border-line bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-surfaceMuted">
            ← {locale === 'ro' ? 'Înapoi la Lobby' : 'Back to Lobby'}
          </button>
        )}
      </div>

      {/* ---------------------------------------------------------------- UI PRIMITIVES --- */}
      <section>
        <SectionHeading
          title={locale === 'ro' ? 'Primitive UI' : 'UI primitives'}
          description="apps/web/src/components/ui/"
        />
        <div className="flex flex-wrap gap-2">
          <DemoButton label="Open Dialog" onClick={() => setDialogDemoOpen(true)} />
          <DemoButton label="Open AdaptiveSurface" onClick={() => setSurfaceDemoOpen(true)} />
          <DemoButton label="Trigger AiThinkingIndicator (~5s)" onClick={triggerAiThinking} />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span className="text-sm text-inkSoft">ThemeToggle + useTheme (live):</span>
          <ThemeToggle theme={theme} setTheme={setTheme} />
        </div>

        <p className="mt-3 text-sm text-inkSoft">
          AppNav is already visible globally — it's the hamburger trigger in the header above, not
          re-rendered here as a second instance.
        </p>

        <Dialog open={dialogDemoOpen} onClose={() => setDialogDemoOpen(false)} title="Sample Dialog" footer={
          <button type="button" className="btn btn-primary" onClick={() => setDialogDemoOpen(false)}>Close</button>
        }>
          <p>This is a sample blocking Dialog — title, body, and footer action.</p>
        </Dialog>

        <AdaptiveSurface open={surfaceDemoOpen} onClose={() => setSurfaceDemoOpen(false)} title="Sample AdaptiveSurface">
          <p>
            This is a drawer on desktop and a bottom sheet on phone — resize the window to see the
            difference.
          </p>
        </AdaptiveSurface>

        {/* Normally a global fixed-position overlay; just demoing its rendering here. */}
        <AiThinkingIndicator since={aiThinkingSince} locale={locale} />
      </section>

      {/* ------------------------------------------------------------------ GAME PANELS --- */}
      <section>
        <SectionHeading
          title={locale === 'ro' ? 'Panouri de Joc' : 'Game panels'}
          description="apps/web/src/components/game/ — sample data from one fixed-seed local AI-vs-AI simulation."
        />
        <div className="flex flex-wrap gap-2">
          <DemoButton label="Open ScoreBank" onClick={() => setOpenPanel('score_bank')} />
          <DemoButton label="Open EventLog" onClick={() => setOpenPanel('event_log')} />
          <DemoButton label="Open CostsHelp" onClick={() => setOpenPanel('costs_help')} />
          <DemoButton label="Open FullRules" onClick={() => setOpenPanel('full_rules')} />
          <DemoButton label="Open ReleaseNotes" onClick={() => setOpenPanel('release_notes')} />
          <DemoButton
            label="Open StartingOrder"
            onClick={() => setOpenPanel('starting_order')}
            disabled={!midGameState.startingOrderRolls?.length}
          />
          <DemoButton label="Open TradeOfferBuilder" onClick={() => setOpenPanel('trade')} />
          <DemoButton label="Open CounterTradeOffer" onClick={() => setOpenPanel('counter_trade')} disabled={!sampleOffer} />
          <DemoButton label="Open DevCardsPanel" onClick={() => setOpenPanel('dev_cards')} />
          <DemoButton label="Open PlayMonopolyDialog" onClick={() => setOpenPanel('play_monopoly')} />
          <DemoButton label="Open PlayYearOfPlentyDialog" onClick={() => setOpenPanel('play_year_of_plenty')} />
          <DemoButton label="Open DiscardDialog" onClick={() => setOpenPanel('discard')} />
          <DemoButton label="Open StealResourceDialog" onClick={() => setOpenPanel('steal_resource')} />
          <DemoButton label="Open IncomingTradeOfferDialog" onClick={() => setOpenPanel('incoming_trade')} disabled={!sampleOffer} />
          <DemoButton label="Open WaitingRoomPanel" onClick={() => setOpenPanel('waiting_room')} />
          <DemoButton label="Open GameOverDialog" onClick={() => setOpenPanel('game_over')} disabled={!gameOverState} />
          <DemoButton label="Open InGameTerminationDialog" onClick={() => setOpenPanel('in_game_termination')} />
        </div>
        {!gameOverState && (
          <p className="mt-2 text-xs text-inkSoft">
            {locale === 'ro'
              ? 'Simularea fixă nu s-a terminat în numărul maxim de ture — GameOverDialog e dezactivat.'
              : 'The fixed simulation did not finish within the turn cap — GameOverDialog is disabled.'}
          </p>
        )}
      </section>

      {/* ScoreBank */}
      {openPanel === 'score_bank' && (
        <AdaptiveSurface open onClose={closePanel} title={`🏆 Leaderboard, Players & Bank (Target: ${midGameState.rules.victoryPointsToWin} VP)`}>
          <ScoreBank
            locale={locale}
            playerView={playerView}
            resourceGainFlash={{}}
            hasShipsInScenario={hasShipsInScenario}
            isGameOver={false}
            isHumanTurn={false}
            autoPlayAi={false}
            onToggleAutoPlayAi={() => console.info('[showcase] would toggle autoPlayAi')}
            onStepAi={() => console.info('[showcase] would step AI')}
            eventCount={midGameState.sequence}
            onOpenEventLog={() => setOpenPanel('event_log')}
            onOpenCostsHelp={() => setOpenPanel('costs_help')}
          />
        </AdaptiveSurface>
      )}

      {/* EventLog */}
      {openPanel === 'event_log' && (
        <AdaptiveSurface open onClose={closePanel} title={`📜 Event Log (${replay?.events.length ?? 0} actions)`}>
          <EventLog locale={locale} gameState={midGameState} events={replay?.events.slice(0, 40) ?? []} />
        </AdaptiveSurface>
      )}

      {/* CostsHelp */}
      {openPanel === 'costs_help' && (
        <AdaptiveSurface open onClose={closePanel} title="📋 Building Costs & Victory Point Table">
          <CostsHelp locale={locale} hasShipsInScenario={hasShipsInScenario} />
        </AdaptiveSurface>
      )}

      {/* FullRules */}
      {openPanel === 'full_rules' && (
        <AdaptiveSurface open onClose={closePanel} title="📖 Official Rules">
          <FullRules locale={locale} scenario={midGameState.rules.boardScenario} />
        </AdaptiveSurface>
      )}

      {/* ReleaseNotes */}
      {openPanel === 'release_notes' && (
        <AdaptiveSurface open onClose={closePanel} title="📋 Release Notes — v0.0.0-showcase">
          <ReleaseNotes commitCount={128} shortHash="abc1234" releaseNotes={sampleReleaseNotes} />
        </AdaptiveSurface>
      )}

      {/* StartingOrder */}
      {openPanel === 'starting_order' && midGameState.startingOrderRolls && (
        <AdaptiveSurface open onClose={closePanel} title="🎲 Who Starts the Game">
          <StartingOrder players={midGameState.players} rolls={midGameState.startingOrderRolls} onClose={closePanel} />
        </AdaptiveSurface>
      )}

      {/* TradeOfferBuilder */}
      {openPanel === 'trade' && (
        <AdaptiveSurface open onClose={closePanel} title="⚓ Maritime (Bank/Port) Trade & Player-to-Player Offer">
          <TradeOfferBuilder
            locale={locale}
            gameState={midGameState}
            activePlayer={activePlayer}
            bankGiveRes={trade.bankGiveRes}
            bankReceiveRes={trade.bankReceiveRes}
            onBankGiveResChange={trade.setBankGiveRes}
            onBankReceiveResChange={trade.setBankReceiveRes}
            onBankTrade={(give, giveAmount, receive) => console.info('[showcase] would bank-trade', give, giveAmount, receive)}
            p2pOffer={trade.p2pOffer}
            p2pRequest={trade.p2pRequest}
            onP2pOfferChange={trade.setP2pOffer}
            onP2pRequestChange={trade.setP2pRequest}
            onProposeTrade={() => console.info('[showcase] would proposeTrade', trade.p2pOffer, trade.p2pRequest)}
          />
        </AdaptiveSurface>
      )}

      {/* CounterTradeOffer */}
      {openPanel === 'counter_trade' && sampleOffer && (
        <AdaptiveSurface open onClose={closePanel} title="🔄 Counter-offer">
          <CounterTradeOffer
            locale={locale}
            originalOffer={sampleOffer}
            viewerPlayer={viewerPlayer}
            p2pOffer={trade.p2pOffer}
            p2pRequest={trade.p2pRequest}
            onP2pOfferChange={trade.setP2pOffer}
            onP2pRequestChange={trade.setP2pRequest}
            onSendCounterOffer={() => console.info('[showcase] would sendCounterOffer', trade.p2pOffer, trade.p2pRequest)}
          />
        </AdaptiveSurface>
      )}

      {/* DevCardsPanel */}
      {openPanel === 'dev_cards' && (
        <AdaptiveSurface open onClose={closePanel} title={`🃏 Development Cards — ${viewerPlayer.name} (${unplayedDevCards.length})`}>
          <DevCardsPanel
            locale={locale}
            gameState={midGameState}
            activePlayer={activePlayer}
            unplayedDevCards={unplayedDevCards}
            devCardCountsByType={devCardCountsByType}
            isHumanTurn={false}
            onActivateKnight={() => console.info('[showcase] would activate knight placement')}
            onPlayRoadBuilding={() => console.info('[showcase] would play road building')}
            onOpenMonopoly={() => setOpenPanel('play_monopoly')}
            onOpenYearOfPlenty={() => setOpenPanel('play_year_of_plenty')}
          />
        </AdaptiveSurface>
      )}

      {/* PlayMonopolyDialog */}
      {openPanel === 'play_monopoly' && (
        <Dialog
          open
          onClose={closePanel}
          title="👑 Declare Monopoly"
          footer={
            <button type="button" className="btn btn-primary" onClick={() => { console.info('[showcase] would play_monopoly', trade.monopolyResource); closePanel(); }}>
              Confiscate all: {trade.monopolyResource.toUpperCase()}
            </button>
          }
        >
          <PlayMonopolyDialog
            locale={locale}
            activePlayer={activePlayer}
            selectedResource={trade.monopolyResource}
            onSelectResource={trade.setMonopolyResource}
          />
        </Dialog>
      )}

      {/* PlayYearOfPlentyDialog */}
      {openPanel === 'play_year_of_plenty' && (
        <Dialog
          open
          onClose={closePanel}
          title="🎁 Play: Year of Plenty"
          footer={
            <button type="button" className="btn btn-primary" onClick={() => { console.info('[showcase] would play_year_of_plenty', trade.yopResources); closePanel(); }}>
              Take {trade.yopResources[0]} + {trade.yopResources[1]}
            </button>
          }
        >
          <PlayYearOfPlentyDialog
            locale={locale}
            gameState={midGameState}
            activePlayer={activePlayer}
            selected={trade.yopResources}
            onSelectedChange={trade.setYopResources}
            onConfirm={() => { console.info('[showcase] would play_year_of_plenty', trade.yopResources); closePanel(); }}
          />
        </Dialog>
      )}

      {/* DiscardDialog */}
      {openPanel === 'discard' && (
        <Dialog
          open
          onClose={closePanel}
          title={`⚠️ Discard cards: ${viewerPlayer.name}`}
          footer={
            <button type="button" className="btn btn-primary" onClick={() => { console.info('[showcase] would discard_cards', trade.discardSelection); closePanel(); }}>
              Confirm Discard
            </button>
          }
        >
          <DiscardDialog locale={locale} player={viewerPlayer} selection={trade.discardSelection} onSelectionChange={trade.setDiscardSelection} />
        </Dialog>
      )}

      {/* StealResourceDialog */}
      {openPanel === 'steal_resource' && stealGameState && (
        <Dialog open onClose={closePanel} title="🥷 Choose the opponent to steal 1 resource from">
          <StealResourceDialog
            locale={locale}
            gameState={stealGameState}
            playerView={playerView}
            onStealFromPlayer={(targetPlayerId) => { console.info('[showcase] would steal_from_player', targetPlayerId); closePanel(); }}
          />
        </Dialog>
      )}

      {/* IncomingTradeOfferDialog */}
      {openPanel === 'incoming_trade' && sampleOffer && (
        <Dialog
          open
          onClose={closePanel}
          title={`Trade Offer from ${midGameState.players.find((p) => p.id === sampleOffer.fromPlayerId)?.name ?? sampleOffer.fromPlayerId}`}
          footer={
            <div className="flex gap-2">
              <button type="button" className="btn btn-primary" onClick={() => { console.info('[showcase] would respond_trade accept'); closePanel(); }}>Accept</button>
              <button type="button" className="btn" onClick={() => { console.info('[showcase] would respond_trade reject'); closePanel(); }}>Reject</button>
              <button type="button" className="btn" onClick={() => setOpenPanel('counter_trade')}>Counter</button>
            </div>
          }
        >
          <IncomingTradeOfferDialog
            locale={locale}
            offer={sampleOffer}
            viewerResources={viewerPlayer.resources}
            canAfford
          />
        </Dialog>
      )}

      {/* WaitingRoomPanel */}
      {openPanel === 'waiting_room' && (
        <AdaptiveSurface open onClose={closePanel} title="🌐 Waiting Room">
          <WaitingRoomPanel
            lobby={sampleLobby}
            session={sampleSession}
            onShareInvite={(inviteCode) => console.info('[showcase] would share invite', inviteCode)}
            isRenaming={isRenamingSeat}
            renameDraft={renameDraft}
            onRenameDraftChange={setRenameDraft}
            onRenamingChange={setIsRenamingSeat}
            onRenameSeat={(seatIndex, newName) => console.info('[showcase] would rename seat', seatIndex, newName)}
            error={null}
            busy={false}
            onStartGame={() => console.info('[showcase] would start online lobby')}
          />
        </AdaptiveSurface>
      )}

      {/* GameOverDialog */}
      {openPanel === 'game_over' && gameOverState && (
        <Dialog
          open
          onClose={closePanel}
          title="🎉 Game Finished & Auto-Saved!"
          footer={
            <div className="flex gap-2">
              <button type="button" className="btn btn-primary" onClick={() => { console.info('[showcase] would open replay'); closePanel(); }}>Open in Replay & Analysis</button>
              <button type="button" className="btn" onClick={closePanel}>New Game</button>
            </div>
          }
        >
          <GameOverDialog locale={locale} gameState={gameOverState} />
        </Dialog>
      )}

      {/* InGameTerminationDialog */}
      {openPanel === 'in_game_termination' && (
        <Dialog
          open
          onClose={closePanel}
          title="⚠️ Match Termination Request"
          footer={
            <div className="flex gap-2">
              <button type="button" className="btn btn-primary" onClick={closePanel}>No, continue the game</button>
              <button type="button" className="btn btn-danger" onClick={closePanel}>Yes, close it</button>
            </div>
          }
        >
          <InGameTerminationDialog countdown={23} />
        </Dialog>
      )}
    </main>
  );
}
