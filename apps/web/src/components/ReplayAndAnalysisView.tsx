import React, { useState, useEffect, useMemo } from 'react';
import {
  ALL_RESOURCES,
  GameAction,
  PlayerColor,
  ReplayFile,
  calculateScore,
  exportReplayJson,
  importReplayJson,
  reconstructStateAtSequence
} from '@catan/core';
import {
  analyzeDecisionAtSequence,
  analyzeReplayGame,
  runSimulatedGame
} from '@catan/ai';
import { BoardSvg } from './BoardSvg';
import { AnimatedDiceWidget, ResourceCardSprite } from './GameAssets';
import {
  SavedReplaySummary,
  deleteSavedReplay,
  loadSavedReplays,
  saveReplayToHistory
} from '../storage';
import {
  Locale,
  PHASE_LABELS,
  TRANSLATIONS,
  formatActionDescription
} from '../i18n';

export interface ReplayAndAnalysisViewProps {
  replay: ReplayFile | null;
  onSelectReplay: (replay: ReplayFile) => void;
  locale: Locale;
}

type ReplayModalType = 'none' | 'saved_games' | 'strategic_report' | 'event_log' | 'ai_decision';

// Readable names for the scoring factors evaluator.ts computes per candidate (packages/ai/src/
// evaluator.ts and bot.ts) - the AI's score is a weighted sum of these, and it's rarely "just
// points": a settlement candidate's score is mostly `production` (pip count) and `diversity`
// (resources you don't already have), a robber move is `opponentBlocking` vs `ownPenalty`, etc.
// Showing the breakdown (not just the final number) is the whole point of this panel.
const FACTOR_LABELS: Record<string, { ro: string; en: string }> = {
  victoryPoints: { ro: 'Puncte de Victorie', en: 'Victory points' },
  production: { ro: 'Producție (pips)', en: 'Production (pips)' },
  diversity: { ro: 'Diversitate resurse noi', en: 'New resource diversity' },
  harbor: { ro: 'Acces port', en: 'Harbor access' },
  blocking: { ro: 'Blocare drum advers', en: 'Blocks opponent road' },
  opponentBlocking: { ro: 'Blocare producție adversar', en: 'Blocks opponent production' },
  stealValue: { ro: 'Valoare țintă furt', en: 'Steal target value' },
  ownPenalty: { ro: 'Risc pentru propriile piese', en: 'Risk to own pieces' },
  buildBonus: { ro: 'Bonus construcție (+1 PV)', en: 'Build bonus (+1 VP)' },
  freeRoads: { ro: 'Valoare drumuri gratuite', en: 'Free roads value' },
  resourceUtility: { ro: 'Utilitate resurse alese', en: 'Chosen resource utility' },
  monopolyEstimate: { ro: 'Estimare câștig Monopol', en: 'Estimated Monopoly haul' },
  targetThreat: { ro: 'Amenințare reprezentată de țintă', en: 'Threat posed by target' },
  keptInventoryUtility: { ro: 'Utilitate resurse păstrate', en: 'Kept resources utility' },
  cleanup: { ro: 'Curățare ofertă refuzată', en: 'Rejected-offer cleanup' },
  caution: { ro: 'Prudență', en: 'Caution' },
  mandatoryTurnFlow: { ro: 'Pas obligatoriu al turei', en: 'Mandatory turn step' },
  expansion: { ro: 'Expansiune strategică', en: 'Strategic expansion' },
  passSpecialBuild: { ro: 'Renunțare la construcție specială', en: 'Skipping special build' },
  turnCompletion: { ro: 'Încheiere tură', en: 'Turn completion' },
  passive: { ro: 'Bot pasiv/neutru', en: 'Passive/neutral bot' },
  tacticalLookahead: { ro: 'Anticipare tactică (1 tură)', en: 'Tactical lookahead (1 turn)' },
  monteCarloRollout: { ro: 'Simulare Monte Carlo', en: 'Monte Carlo rollout' }
};

function factorLabel(key: string, locale: Locale): string {
  const known = FACTOR_LABELS[key];
  if (known) return known[locale];
  // Fallback for any factor key not in the map above: humanize the camelCase identifier so a
  // future evaluator.ts factor still shows as something readable instead of disappearing.
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

// Where a candidate action would land on the board, for the ghost marker in BoardSvg - not
// every action targets a board location (e.g. buy_dev_card, end_turn), which is fine: no ids
// means no marker is drawn.
function actionBoardTarget(action: GameAction): { vertexId?: string; edgeId?: string; hexId?: string } {
  switch (action.type) {
    case 'place_initial_settlement':
    case 'build_settlement':
    case 'build_city':
      return { vertexId: action.vertexId };
    case 'place_initial_road':
    case 'build_road':
    case 'build_ship':
    case 'place_free_road':
      return { edgeId: action.edgeId };
    case 'move_ship':
      return { edgeId: action.toEdgeId };
    case 'move_robber':
    case 'play_knight':
      return { hexId: action.hexId };
    default:
      return {};
  }
}

export const ReplayAndAnalysisView: React.FC<ReplayAndAnalysisViewProps> = ({
  replay,
  onSelectReplay,
  locale
}) => {
  const t = TRANSLATIONS[locale];
  const [currentSeq, setCurrentSeq] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [filterPlayerId, setFilterPlayerId] = useState<string>('all');
  const [filterActionType, setFilterActionType] = useState<string>('all');
  const [importError, setImportError] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<ReplayModalType>('none');
  const [reportTab, setReportTab] = useState<'overview' | 'initial' | 'ports' | 'cards' | 'dice' | 'decisions'>('overview');
  const [savedReplays, setSavedReplays] = useState<SavedReplaySummary[]>(() =>
    loadSavedReplays()
  );
  // Which candidate action's board location the user picked to inspect in the Decision
  // Inspector panel below - drives the ghost marker on the board (see actionBoardTarget).
  const [ghostCandidateIdx, setGhostCandidateIdx] = useState<number | null>(null);

  // Refresh saved games list when replay changes
  useEffect(() => {
    setSavedReplays(loadSavedReplays());
  }, [replay?.gameId]);

  // A newly selected step's candidates are a different list - don't keep last step's ghost up.
  useEffect(() => {
    setGhostCandidateIdx(null);
  }, [currentSeq]);

  useEffect(() => {
    if (replay) {
      setCurrentSeq(0);
      setIsPlaying(false);
    }
  }, [replay?.gameId]);

  useEffect(() => {
    if (!isPlaying || !replay) return;
    const timer = setInterval(() => {
      setCurrentSeq((prev) => {
        if (prev >= replay.events.length) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 550);
    return () => clearInterval(timer);
  }, [isPlaying, replay]);

  const reconstructedState = useMemo(() => {
    if (!replay) return null;
    const clamped = Math.min(replay.events.length, Math.max(0, currentSeq));
    return reconstructStateAtSequence(replay, clamped, false);
  }, [replay, currentSeq]);

  const stepComparison = useMemo(() => {
    if (!replay || currentSeq < 1 || currentSeq > replay.events.length) return null;
    try {
      return analyzeDecisionAtSequence(replay, currentSeq);
    } catch {
      return null;
    }
  }, [replay, currentSeq]);

  const strategicReport = useMemo(() => {
    if (!replay || replay.events.length === 0) return null;
    try {
      return analyzeReplayGame(replay);
    } catch {
      return null;
    }
  }, [replay]);

  // History entries loaded from localStorage carry metadata only (see storage.ts) - fetch the
  // full replay from the server (the durable, compressed store) on demand.
  const resolveFullReplay = async (item: SavedReplaySummary): Promise<ReplayFile | null> => {
    if (item.replay) return item.replay;
    try {
      const res = await fetch(`/api/games/${item.gameId}/replay`);
      if (res.ok) {
        const data = await res.json();
        if (data.replay) return data.replay as ReplayFile;
      }
    } catch (err) {
      console.error('Eroare la descărcarea replay-ului:', err);
    }
    return null;
  };

  const handleSelectSavedReplay = async (item: SavedReplaySummary) => {
    const full = await resolveFullReplay(item);
    if (!full) return;
    saveReplayToHistory(full, false);
    onSelectReplay(full);
    setActiveModal('none');
  };

  const handleExportSaved = async (item: SavedReplaySummary) => {
    const full = await resolveFullReplay(item);
    handleExport(full);
  };

  const handleGenerateSampleReplay = () => {
    const sim = runSimulatedGame({
      seed: `replay-lab-${Date.now()}`,
      participants: [
        { id: 'p1', name: 'AI Expert Adaptiv', type: 'ai', aiDifficulty: 'expert', aiStyle: 'adaptive' },
        { id: 'p2', name: 'AI Avansat Dezvoltare', type: 'ai', aiDifficulty: 'advanced', aiStyle: 'development' },
        { id: 'p3', name: 'AI Mediu Expansiune', type: 'ai', aiDifficulty: 'medium', aiStyle: 'expansion' },
        { id: 'p4', name: 'AI Începător Comercial', type: 'ai', aiDifficulty: 'beginner', aiStyle: 'commercial' }
      ],
      recordReplay: true
    });
    if (sim.replay) {
      const updated = saveReplayToHistory(sim.replay);
      setSavedReplays(updated);
      onSelectReplay(sim.replay);
    }
  };

  const handleSaveCurrentReplay = () => {
    if (!replay) return;
    const updated = saveReplayToHistory(replay);
    setSavedReplays(updated);
  };

  const handleExport = (targetReplay: ReplayFile | null = replay) => {
    if (!targetReplay) return;
    const json = exportReplayJson(targetReplay, true);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `catan-replay-${targetReplay.gameId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setImportError(null);
        const imported = importReplayJson(String(reader.result));
        const updated = saveReplayToHistory(imported);
        setSavedReplays(updated);
        onSelectReplay(imported);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : 'Fișier replay invalid.');
      }
    };
    reader.readAsText(file);
  };

  if (!replay || !reconstructedState) {
    return (
      <div className="viewport-main" style={{ alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div className="panel" style={{ maxWidth: 820, width: '100%', maxHeight: '85dvh' }}>
          <h2>🎬 {t.navReplay} & Istoric Partide Salvate ({savedReplays.length})</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '0.85rem', fontSize: '0.86rem' }}>
            {locale === 'ro'
              ? 'Toate partidele finalizate sunt salvate automat aici pentru analiză ulterioară. Poți încărca o partidă salvată, genera o partidă 4-AI sau importa un fișier JSON.'
              : 'All finished games are automatically saved here for later analysis. Load a saved game, generate a 4-AI match, or import a JSON file.'}
          </p>

          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
            <button type="button" className="btn btn-primary" onClick={handleGenerateSampleReplay}>
              ⚡ {t.quickAiMatch}
            </button>
            <label className="btn" style={{ cursor: 'pointer' }}>
              📂 {t.importReplay}
              <input type="file" accept=".json" onChange={handleImportFile} style={{ display: 'none' }} />
            </label>
          </div>

          {importError && <p style={{ color: 'var(--accent-red)', marginBottom: '0.6rem' }}>{importError}</p>}

          <div className="panel-scroll">
            {savedReplays.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem', padding: '1rem 0' }}>
                {locale === 'ro'
                  ? 'Nu există încă partide salvate în istoric. Joacă sau simulează o partidă!'
                  : 'No saved games in history yet. Play or simulate a match!'}
              </div>
            ) : (
              savedReplays.map((item) => (
                <div key={item.gameId} className="candidate-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                  <div>
                    <strong>{item.gameId}</strong> · Seed: <code>{item.seed}</code> ·{' '}
                    <span style={{ color: 'var(--accent-gold)' }}>
                      {item.winnerName ? `🏆 ${item.winnerName}` : 'În desfășurare'}
                    </span>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      {new Date(item.savedAt).toLocaleString()} · {item.turns} ture · {item.eventsCount} mutări ·{' '}
                      {item.participants.map((p) => `${p.name} (${p.finalScore} VP)`).join(', ')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => handleSelectSavedReplay(item)}
                    >
                      🔍 Analizează
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => handleExportSaved(item)}
                    >
                      💾
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => setSavedReplays(deleteSavedReplay(item.gameId))}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  const playerColors: Record<string, PlayerColor> = {};
  for (const p of reconstructedState.players) {
    playerColors[p.id] = p.color;
  }

  const filteredEvents = replay.events.filter((ev) => {
    if (filterPlayerId !== 'all' && ev.playerId !== filterPlayerId) return false;
    if (filterActionType !== 'all' && ev.action.type !== filterActionType) return false;
    return true;
  });

  const maxDiceCount = strategicReport
    ? Math.max(1, ...Object.values(strategicReport.diceHistogram))
    : 1;

  return (
    <div className="replay-viewport">
      {/* Left Column: Transport Bar + Board + Compact Player Cards */}
      <div className="replay-left-column">
        <div className="panel replay-transport-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
            <div style={{ fontSize: '0.82rem' }}>
              <strong>{replay.gameId}</strong> · Seed: <code>{replay.seed}</code> ·{' '}
              <span style={{ color: 'var(--accent-gold)', fontWeight: 700 }}>
                Tura {reconstructedState.turn} · Pas {currentSeq}/{replay.events.length}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setActiveModal('saved_games')}
              >
                📚 Istoric Partide ({savedReplays.length})
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setActiveModal('strategic_report')}
              >
                📊 Raport Strategic
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setActiveModal('event_log')}
              >
                📜 Jurnal ({replay.events.length})
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setActiveModal('ai_decision')}
              >
                🧠 Inspector AI
              </button>
              <button type="button" className="btn" onClick={handleSaveCurrentReplay} title="Salvează în istoric">
                📌 Salvează
              </button>
              <button type="button" className="btn" onClick={() => handleExport(replay)}>
                💾 Export
              </button>
              <label className="btn" style={{ cursor: 'pointer' }}>
                📂 Import
                <input type="file" accept=".json" onChange={handleImportFile} style={{ display: 'none' }} />
              </label>
            </div>
          </div>

          {/* Timeline Slider & Step Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.45rem' }}>
            <button type="button" className="btn" onClick={() => setCurrentSeq(0)} disabled={currentSeq === 0}>
              ⏮
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setCurrentSeq((s) => Math.max(0, s - 1))}
              disabled={currentSeq === 0}
            >
              ◀
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setIsPlaying((p) => !p)}
            >
              {isPlaying ? '⏸' : '▶'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setCurrentSeq((s) => Math.min(replay.events.length, s + 1))}
              disabled={currentSeq >= replay.events.length}
            >
              ▶
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setCurrentSeq(replay.events.length)}
              disabled={currentSeq >= replay.events.length}
            >
              ⏭
            </button>
            <input
              type="range"
              min={0}
              max={replay.events.length}
              value={currentSeq}
              onChange={(e) => setCurrentSeq(Number(e.target.value))}
              style={{ flex: 1 }}
            />
          </div>
        </div>

        {/* Interactive Board at Selected Step */}
        <div className="replay-board-stage">
          <div className="board-top-banner">
            <div className="phase-pill">
              {PHASE_LABELS[locale][reconstructedState.phase]}
            </div>
            <AnimatedDiceWidget
              die1={reconstructedState.lastDiceRoll?.die1}
              die2={reconstructedState.lastDiceRoll?.die2}
              total={reconstructedState.lastDiceRoll?.total}
              turn={reconstructedState.turn}
              rollTriggerKey={`replay-${currentSeq}-${reconstructedState.lastDiceRoll?.total ?? 0}`}
              locale={locale}
            />
          </div>
          {(() => {
            const ghostCandidate =
              ghostCandidateIdx !== null ? stepComparison?.evaluatedAlternatives[ghostCandidateIdx] : undefined;
            const ghostTarget = ghostCandidate ? actionBoardTarget(ghostCandidate.action) : {};
            return (
              <BoardSvg
                board={reconstructedState.board}
                playerColors={playerColors}
                locale={locale}
                ghostVertexId={ghostTarget.vertexId}
                ghostEdgeId={ghostTarget.edgeId}
                ghostHexId={ghostTarget.hexId}
              />
            );
          })()}
        </div>

        {/* Compact 4-Player Resource Cards Row at bottom of Replay Board */}
        <div className="replay-player-cards-row">
          {reconstructedState.players.map((p) => {
            const sc = calculateScore(reconstructedState, p.id);
            const isActive = reconstructedState.activePlayerId === p.id;
            return (
              <div key={p.id} className={`player-card ${isActive ? 'active-turn' : ''}`} style={{ padding: '0.4rem 0.55rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                  <span>
                    <span className="color-dot" style={{ backgroundColor: p.color, marginRight: 5, verticalAlign: 'middle' }} />
                    <strong>{p.name}</strong>
                  </span>
                  <span style={{ color: 'var(--accent-gold)', fontWeight: 700 }}>
                    {sc.totalScore} VP
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 3, marginTop: 4, justifyContent: 'space-between' }}>
                  {ALL_RESOURCES.map((r) => (
                    <ResourceCardSprite
                      key={r}
                      resource={r}
                      count={p.resources[r]}
                      locale={locale}
                      size="xs"
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Column: Decision Inspector & Interactive Event Stream (Fits inside locked height) */}
      <div className="replay-right-column">
        <div className="panel" style={{ flex: 1.15, minHeight: 0 }}>
          <h2>
            🧠 Inspector Decizie AI & Alternative (Pasul #{currentSeq})
          </h2>
          {!stepComparison ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
              {locale === 'ro'
                ? 'Selectează un pas (>= 1) din cronologie pentru a vedea evaluarea mutării și alternativele legale.'
                : 'Select a step (>= 1) to inspect the move evaluation and legal alternatives.'}
            </p>
          ) : (
            <div className="panel-scroll">
              <div
                style={{
                  background: '#0d1a29',
                  padding: '0.55rem',
                  borderRadius: 8,
                  marginBottom: '0.55rem',
                  borderLeft: `4px solid ${
                    stepComparison.isOptimal ? 'var(--accent-green)' : 'var(--accent-gold)'
                  }`
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', fontSize: '0.82rem' }}>
                  <strong>
                    {stepComparison.playerName}:{' '}
                    {formatActionDescription(stepComparison.actualAction, locale, replay?.events[currentSeq - 1]?.details)}
                  </strong>
                  <span
                    style={{
                      color: stepComparison.isOptimal ? 'var(--accent-green)' : 'var(--accent-gold)',
                      fontWeight: 700
                    }}
                  >
                    Scor: {stepComparison.actualScore}{' '}
                    {stepComparison.isOptimal
                      ? '✓ (Optimă)'
                      : `(Gap: -${stepComparison.scoreGap})`}
                  </span>
                </div>
                {stepComparison.recordedAIDecision && (
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    Profil AI: <strong>{stepComparison.recordedAIDecision.difficulty}</strong> · Stil:{' '}
                    <strong>{stepComparison.recordedAIDecision.style}</strong> ·{' '}
                    {stepComparison.recordedAIDecision.computeTimeMs}ms
                    {stepComparison.recordedAIDecision.simulationsRun
                      ? ` · Monte Carlo: ${stepComparison.recordedAIDecision.simulationsRun}`
                      : ''}
                    <div>Motiv AI: {stepComparison.recordedAIDecision.chosenReason}</div>
                  </div>
                )}
              </div>

              <div style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                {locale === 'ro'
                  ? 'Top Acțiuni Candidate Legale (evaluate pe PlayerView) — click pe o acțiune pentru a o vedea pe hartă:'
                  : 'Top Legal Candidate Actions (evaluated on PlayerView) — click one to see it on the board:'}
              </div>
              {stepComparison.evaluatedAlternatives.map((cand, idx) => {
                const isChosen =
                  JSON.stringify(cand.action) === JSON.stringify(stepComparison.actualAction);
                const isGhosted = ghostCandidateIdx === idx;
                const hasTarget = Object.keys(actionBoardTarget(cand.action)).length > 0;
                // Sorted strongest-first so the factor actually driving this score (which is
                // not always "victoryPoints" - could be production, blocking an opponent,
                // a resource you're missing...) is the first thing read, not buried in a list.
                const sortedFactors = Object.entries(cand.factors)
                  .filter(([, v]) => v !== 0)
                  .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a));
                return (
                  <div
                    key={idx}
                    className={`candidate-row ${isChosen ? 'chosen' : ''}`}
                    onClick={() => hasTarget && setGhostCandidateIdx(isGhosted ? null : idx)}
                    style={{
                      cursor: hasTarget ? 'pointer' : 'default',
                      outline: isGhosted ? '2px solid #a78bfa' : undefined,
                      outlineOffset: isGhosted ? -2 : undefined
                    }}
                    title={
                      hasTarget
                        ? locale === 'ro'
                          ? 'Click pentru a evidenția această acțiune pe hartă (💡)'
                          : 'Click to highlight this action on the board (💡)'
                        : undefined
                    }
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>
                        <strong>#{idx + 1}</strong> {formatActionDescription(cand.action, locale)}{' '}
                        {hasTarget && <span title={locale === 'ro' ? 'Poate fi evidențiată pe hartă' : 'Can be highlighted on the board'}>💡</span>}{' '}
                        {isChosen && (
                          <span style={{ color: 'var(--accent-gold)', fontWeight: 700 }}>
                            [ALEASĂ]
                          </span>
                        )}
                      </span>
                      <strong>{cand.score}</strong>
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.73rem', marginTop: 2 }}>
                      {cand.explanation}
                    </div>
                    {sortedFactors.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                        {sortedFactors.map(([key, value]) => (
                          <span
                            key={key}
                            style={{
                              fontSize: '0.68rem',
                              padding: '1px 6px',
                              borderRadius: 10,
                              background: value > 0 ? 'rgba(74, 222, 128, 0.14)' : 'rgba(248, 113, 113, 0.14)',
                              border: `1px solid ${value > 0 ? 'rgba(74, 222, 128, 0.4)' : 'rgba(248, 113, 113, 0.4)'}`,
                              color: value > 0 ? '#4ade80' : '#f87171'
                            }}
                          >
                            {factorLabel(key, locale)}: {value > 0 ? '+' : ''}{value}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Compact Clickable Event List */}
        <div className="panel" style={{ flex: 0.85, minHeight: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
            <h2 style={{ margin: 0, border: 'none', padding: 0 }}>📜 {t.eventLogTitle}</h2>
            <select
              value={filterPlayerId}
              onChange={(e) => setFilterPlayerId(e.target.value)}
              style={{ padding: '2px 6px', fontSize: '0.76rem' }}
            >
              <option value="all">{locale === 'ro' ? 'Toți jucătorii' : 'All players'}</option>
              {replay.initialState.players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="panel-scroll event-list">
            {filteredEvents.map((ev) => {
              const pName =
                replay.initialState.players.find((p) => p.id === ev.playerId)?.name ?? ev.playerId;
              const isSelected = ev.sequence === currentSeq;
              return (
                <div
                  key={ev.sequence}
                  className="event-item"
                  onClick={() => setCurrentSeq(ev.sequence)}
                  style={{
                    cursor: 'pointer',
                    borderLeftColor: isSelected ? 'var(--accent-gold)' : 'var(--accent-blue)',
                    background: isSelected ? 'rgba(245, 158, 11, 0.16)' : '#0d1a29'
                  }}
                >
                  <strong>#{ev.sequence}</strong> [T{ev.turn}] <strong>{pName}</strong>:{' '}
                  {formatActionDescription(ev.action, locale, ev.details)}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* MODAL 1: SAVED GAMES HISTORY */}
      {activeModal === 'saved_games' && (
        <div className="modal-backdrop" onClick={() => setActiveModal('none')}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📚 Istoric Partide Salvate ({savedReplays.length})</h3>
              <button type="button" className="btn" onClick={() => setActiveModal('none')}>
                ✕ Închide
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    handleGenerateSampleReplay();
                    setActiveModal('none');
                  }}
                >
                  ⚡ Simulează & Salvează Partidă 4-AI Nouă
                </button>
              </div>
              {savedReplays.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>Nicio partidă salvată încă.</p>
              ) : (
                savedReplays.map((item) => (
                  <div
                    key={item.gameId}
                    className={`candidate-row ${item.gameId === replay.gameId ? 'chosen' : ''}`}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}
                  >
                    <div>
                      <strong>{item.gameId}</strong> · Seed: <code>{item.seed}</code> ·{' '}
                      <span style={{ color: 'var(--accent-gold)', fontWeight: 700 }}>
                        {item.winnerName ? `🏆 Câștigător: ${item.winnerName}` : 'În desfășurare'}
                      </span>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        {new Date(item.savedAt).toLocaleString()} · {item.turns} ture ({item.eventsCount} acțiuni) ·{' '}
                        {item.participants.map((p) => `${p.name}: ${p.finalScore} VP`).join(' | ')}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => handleSelectSavedReplay(item)}
                      >
                        Încarcă
                      </button>
                      <button type="button" className="btn" onClick={() => handleExportSaved(item)}>
                        💾
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => setSavedReplays(deleteSavedReplay(item.gameId))}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

            {/* MODAL 2: INTERACTIVE & DYNAMIC VISUAL STRATEGIC REPORT */}
      {activeModal === 'strategic_report' && strategicReport && (() => {
        const pColors: Record<string, string> = {
          red: '#ef4444',
          blue: '#3b82f6',
          orange: '#f97316',
          green: '#10b981',
          white: '#f1f5f9'
        };
        const profiles = Object.values(strategicReport.playerProfiles);
        const maxScoreAcross = Math.max(10, ...profiles.map((p) => p.finalScore));
        const totalGameTurns = Math.max(1, strategicReport.totalTurns);
        const winner = profiles.find((p) => p.isWinner) ?? profiles[0];

        // Chart coordinates computation
        const chartW = 760;
        const chartH = 220;
        const padL = 40;
        const padR = 25;
        const padT = 20;
        const padB = 30;
        const plotW = chartW - padL - padR;
        const plotH = chartH - padT - padB;

        const scaleX = (turn: number) => padL + (Math.max(1, Math.min(totalGameTurns, turn)) / totalGameTurns) * plotW;
        const scaleY = (score: number) => padT + plotH - ((Math.min(maxScoreAcross, Math.max(0, score)) / maxScoreAcross) * plotH);

        const yTicks = [2, 4, 6, 8, 10, maxScoreAcross > 10 ? maxScoreAcross : 10];
        const uniqueYTicks = Array.from(new Set(yTicks)).sort((a, b) => a - b);

        const xInterval = totalGameTurns <= 30 ? 5 : totalGameTurns <= 80 ? 10 : 20;
        const xTicks: number[] = [];
        for (let t = xInterval; t <= totalGameTurns; t += xInterval) {
          xTicks.push(t);
        }

        return (
          <div className="modal-backdrop" onClick={() => setActiveModal('none')}>
            <div
              className="modal-dialog"
              style={{ maxWidth: 940, width: '96vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header" style={{ padding: '0.65rem 1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: '1.05rem' }}>
                    📊 Raport Strategic & Analiză Partidă ({replay.gameId})
                  </h3>
                  {winner && (
                    <span
                      style={{
                        background: 'rgba(245, 158, 11, 0.15)',
                        border: '1px solid var(--accent-gold)',
                        color: 'var(--accent-gold)',
                        fontSize: '0.78rem',
                        padding: '2px 8px',
                        borderRadius: 12,
                        fontWeight: 700
                      }}
                    >
                      🏆 Câștigător: {winner.playerName} ({winner.finalScore} VP)
                    </span>
                  )}
                </div>
                <button type="button" className="btn" onClick={() => setActiveModal('none')}>
                  ✕ Închide
                </button>
              </div>

              {/* Sub-Navigation Tabs */}
              <div
                style={{
                  display: 'flex',
                  gap: 4,
                  padding: '0.45rem 0.85rem',
                  background: '#0a1520',
                  borderBottom: '1px solid var(--border-color)',
                  overflowX: 'auto',
                  flexShrink: 0
                }}
              >
                {[
                  { id: 'overview', label: '📈 Parcurs & Repere' },
                  { id: 'initial', label: '🎯 Poziție Inițială & Pips' },
                  { id: 'ports', label: '⚓ Porturi & Comerț' },
                  { id: 'cards', label: '🃏 Cărți & Armată' },
                  { id: 'dice', label: '🎲 Zaruri, Rată & Economie' },
                  { id: 'decisions', label: '🔍 Decizii AI & Ezitări' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`btn ${reportTab === tab.id ? 'btn-primary' : ''}`}
                    style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem', whiteSpace: 'nowrap' }}
                    onClick={() => setReportTab(tab.id as any)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '0.85rem' }}>
                {/* TAB 1: PARCURS & REPERE (DEVELOPMENT CURVE CHART + MILESTONES) */}
                {reportTab === 'overview' && (
                  <div>
                    {/* Winner Verdict Card */}
                    {winner && (
                      <div
                        style={{
                          background: 'rgba(245, 158, 11, 0.08)',
                          border: '1px solid var(--accent-gold)',
                          borderRadius: 8,
                          padding: '0.65rem 0.85rem',
                          marginBottom: '0.85rem'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontWeight: 700, color: 'var(--accent-gold)', fontSize: '0.88rem' }}>
                            🏆 Verdictul Partidei: Ce a determinat victoria lui {winner.playerName}?
                          </span>
                          <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                            {strategicReport.totalTurns} ture · {strategicReport.totalEvents} acțiuni
                          </span>
                        </div>
                        <p style={{ margin: '0 0 0.4rem 0', fontSize: '0.82rem', lineHeight: 1.45 }}>
                          {strategicReport.winningReason}
                        </p>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.76rem' }}>
                          <span style={{ background: '#112233', padding: '2px 8px', borderRadius: 4 }}>
                            Așezări: <strong>{winner.scoreBreakdown.settlements}</strong>
                          </span>
                          <span style={{ background: '#112233', padding: '2px 8px', borderRadius: 4 }}>
                            Orașe: <strong>{winner.scoreBreakdown.cities}</strong>
                          </span>
                          {winner.scoreBreakdown.largestArmy > 0 && (
                            <span style={{ background: '#1e3a2f', color: '#6ee7b7', padding: '2px 8px', borderRadius: 4 }}>
                              ⚔️ Cea mai mare Armată (+2 VP)
                            </span>
                          )}
                          {winner.scoreBreakdown.longestRoad > 0 && (
                            <span style={{ background: '#1e3a2f', color: '#6ee7b7', padding: '2px 8px', borderRadius: 4 }}>
                              🛣️ Cel mai lung Drum (+2 VP)
                            </span>
                          )}
                          {winner.scoreBreakdown.victoryPointCards > 0 && (
                            <span style={{ background: '#312e81', color: '#c7d2fe', padding: '2px 8px', borderRadius: 4 }}>
                              🃏 Cărți VP Ascunse (+{winner.scoreBreakdown.victoryPointCards} VP)
                            </span>
                          )}
                          <span style={{ background: '#112233', padding: '2px 8px', borderRadius: 4 }}>
                            Pips Inițiali: <strong>{winner.initialPlacement.totalPips}</strong>
                          </span>
                          <span style={{ background: '#112233', padding: '2px 8px', borderRadius: 4 }}>
                            Medie Resurse: <strong>{winner.economy.avgResourcesPerTurn}/tură</strong>
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Interactive Development SVG Line Chart */}
                    <div style={{ background: '#09131d', border: '1px solid var(--border-color)', borderRadius: 8, padding: '0.65rem 0.75rem', marginBottom: '0.85rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <strong style={{ fontSize: '0.84rem' }}>
                          📈 Parcursul Dezvoltării în Timp (Puncte de Victorie per Tură)
                        </strong>
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                          💡 Dă click pe orice punct de pe grafic pentru a derula la acea tură
                        </span>
                      </div>

                      <svg
                        viewBox={`0 0 ${chartW} ${chartH}`}
                        style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
                      >
                        {/* Horizontal Grid Lines */}
                        {uniqueYTicks.map((yVal) => {
                          const yPos = scaleY(yVal);
                          return (
                            <g key={yVal}>
                              <line
                                x1={padL}
                                y1={yPos}
                                x2={chartW - padR}
                                y2={yPos}
                                stroke="rgba(255,255,255,0.08)"
                                strokeDasharray={yVal === 10 ? 'none' : '3,3'}
                                strokeWidth={yVal === 10 ? 1.5 : 1}
                              />
                              <text
                                x={padL - 6}
                                y={yPos + 4}
                                textAnchor="end"
                                fontSize="10"
                                fill={yVal === 10 ? 'var(--accent-gold)' : 'var(--text-muted)'}
                              >
                                {yVal} VP
                              </text>
                            </g>
                          );
                        })}

                        {/* Vertical Grid Lines (Turns) */}
                        {xTicks.map((tVal) => {
                          const xPos = scaleX(tVal);
                          return (
                            <g key={tVal}>
                              <line
                                x1={xPos}
                                y1={padT}
                                x2={xPos}
                                y2={chartH - padB}
                                stroke="rgba(255,255,255,0.06)"
                                strokeDasharray="2,3"
                              />
                              <text
                                x={xPos}
                                y={chartH - padB + 14}
                                textAnchor="middle"
                                fontSize="10"
                                fill="var(--text-muted)"
                              >
                                T{tVal}
                              </text>
                            </g>
                          );
                        })}

                        {/* Player Lines */}
                        {profiles.map((prof) => {
                          const color = pColors[prof.color] ?? '#38bdf8';
                          const pts = prof.scoreTimeline;
                          if (pts.length === 0) return null;

                          const polyPoints = pts
                            .map((p) => `${scaleX(p.turn)},${scaleY(p.score)}`)
                            .join(' ');

                          return (
                            <g key={prof.playerId}>
                              <polyline
                                points={polyPoints}
                                fill="none"
                                stroke={color}
                                strokeWidth={prof.isWinner ? 3.5 : 2}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                opacity={prof.isWinner ? 1 : 0.8}
                              />
                              {pts.map((p, idx) => (
                                <circle
                                  key={idx}
                                  cx={scaleX(p.turn)}
                                  cy={scaleY(p.score)}
                                  r={prof.isWinner ? 4.5 : 3.5}
                                  fill={color}
                                  stroke="#09131d"
                                  strokeWidth={1.5}
                                  style={{ cursor: 'pointer' }}
                                  onClick={() => {
                                    setCurrentSeq(p.sequence);
                                    setActiveModal('none');
                                  }}
                                >
                                  <title>
                                    {`${prof.playerName} - Tura ${p.turn} (Pas #${p.sequence}): ${p.score} VP\nAșezări: ${p.settlements}, Orașe: ${p.cities}${p.largestArmy ? ', Armată' : ''}${p.longestRoad ? ', Drum' : ''}\n(Click pentru derulare)`}
                                  </title>
                                </circle>
                              ))}
                            </g>
                          );
                        })}
                      </svg>

                      {/* Chart Legend */}
                      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                        {profiles.map((prof) => (
                          <div key={prof.playerId} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem' }}>
                            <span
                              style={{
                                width: 12,
                                height: 12,
                                borderRadius: '50%',
                                background: pColors[prof.color] ?? '#38bdf8'
                              }}
                            />
                            <strong>{prof.playerName}</strong>: {prof.finalScore} VP
                            {prof.isWinner && ' 🏆'}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Milestones / Key Game Moments with scrub buttons */}
                    <div style={{ background: '#0d1a29', border: '1px solid var(--border-color)', borderRadius: 8, padding: '0.65rem 0.75rem' }}>
                      <div style={{ fontSize: '0.84rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                        📍 Repere Cheie ale Partidei (Click pentru salt la tură):
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.5rem' }}>
                        {strategicReport.milestones.map((m, idx) => {
                          const p = profiles.find((pr) => pr.playerId === m.playerId);
                          const pColor = p ? pColors[p.color] ?? '#38bdf8' : '#38bdf8';
                          const icon =
                            m.type === 'win'
                              ? '🏆'
                              : m.type === 'city'
                              ? '🏛️'
                              : m.type === 'port'
                              ? '⚓'
                              : m.type === 'largest_army'
                              ? '⚔️'
                              : m.type === 'longest_road'
                              ? '🛣️'
                              : '🏘️';
                          return (
                            <div
                              key={idx}
                              style={{
                                background: '#0a1420',
                                borderLeft: `4px solid ${pColor}`,
                                border: '1px solid var(--border-color)',
                                borderRadius: 6,
                                padding: '0.45rem 0.6rem',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: 6
                              }}
                            >
                              <div>
                                <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                                  {icon} Tura {m.turn}: {m.title}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                  {m.description}
                                </div>
                              </div>
                              <button
                                type="button"
                                className="btn"
                                style={{ padding: '2px 8px', fontSize: '0.74rem', whiteSpace: 'nowrap' }}
                                onClick={() => {
                                  setCurrentSeq(m.sequence);
                                  setActiveModal('none');
                                }}
                              >
                                Sari la #{m.sequence}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: POZIȚIE INIȚIALĂ & PIPS (INITIAL PLACEMENT COMPARISON) */}
                {reportTab === 'initial' && (
                  <div>
                    <div style={{ background: '#09131d', border: '1px solid var(--border-color)', borderRadius: 8, padding: '0.75rem', marginBottom: '0.85rem' }}>
                      <h4 style={{ margin: '0 0 0.35rem 0', color: 'var(--accent-gold)' }}>
                        🎯 A fost determinantă poziția inițială?
                      </h4>
                      <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                        Amplasarea inițială a primelor 2 așezări determină numărul total de pips (frecvența zarului) și diversitatea celor 5 resurse. Partidele cu diferențe mari de pips inițiali (ex. 19 pips vs 12 pips) conferă un avantaj de ritm aproape imposibil de recuperat fără porturi specializate sau noroc la cărți de dezvoltare.
                      </p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.65rem' }}>
                      {profiles.map((p) => {
                        const pColor = pColors[p.color] ?? '#38bdf8';
                        const pipPct = Math.round((p.initialPlacement.totalPips / 24) * 100);
                        return (
                          <div
                            key={p.playerId}
                            style={{
                              background: '#0d1a29',
                              border: p.isWinner ? '1.5px solid var(--accent-gold)' : '1px solid var(--border-color)',
                              borderRadius: 8,
                              padding: '0.75rem',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 6
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ width: 10, height: 10, borderRadius: '50%', background: pColor }} />
                                <strong>{p.playerName}</strong>
                              </div>
                              <span style={{ fontWeight: 700, color: p.isWinner ? 'var(--accent-gold)' : 'inherit', fontSize: '0.84rem' }}>
                                {p.finalScore} VP {p.isWinner && '🏆'}
                              </span>
                            </div>

                            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                              Stil: <strong>{p.aiStyle ?? 'Echilibrat'}</strong> · Dificultate: <strong>{p.aiDifficulty ?? 'Medium'}</strong>
                            </div>

                            {/* Pips Meter */}
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: 2 }}>
                                <span>Puncte Frecvență (Pips):</span>
                                <strong style={{ color: p.initialPlacement.totalPips >= 18 ? '#10b981' : p.initialPlacement.totalPips >= 14 ? '#38bdf8' : '#f87171' }}>
                                  {p.initialPlacement.totalPips} pips
                                </strong>
                              </div>
                              <div style={{ width: '100%', height: 6, background: '#112233', borderRadius: 3, overflow: 'hidden' }}>
                                <div
                                  style={{
                                    width: `${pipPct}%`,
                                    height: '100%',
                                    background: p.initialPlacement.totalPips >= 18 ? '#10b981' : p.initialPlacement.totalPips >= 14 ? '#38bdf8' : '#f87171'
                                  }}
                                />
                              </div>
                            </div>

                            {/* Resource Diversity */}
                            <div style={{ fontSize: '0.76rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                <span>Diversitate Resurse:</span>
                                <strong>{p.initialPlacement.resourceDiversity}/5 tipuri</strong>
                              </div>
                              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                                {p.initialPlacement.resources.map((res) => (
                                  <span
                                    key={res}
                                    style={{
                                      fontSize: '0.72rem',
                                      background: '#112233',
                                      padding: '1px 6px',
                                      borderRadius: 4
                                    }}
                                  >
                                    {res === 'wood' ? '🪵 Lemn' : res === 'brick' ? '🧱 Argilă' : res === 'wheat' ? '🌾 Grâu' : res === 'sheep' ? '🐑 Lână' : '⛰️ Minereu'}
                                  </span>
                                ))}
                              </div>
                            </div>

                            {/* Initial Hex Numbers */}
                            <div style={{ fontSize: '0.76rem' }}>
                              <span style={{ color: 'var(--text-muted)' }}>Numere inițiale: </span>
                              <strong>
                                {p.initialPlacement.numbers.length > 0 ? p.initialPlacement.numbers.join(', ') : 'N/A'}
                              </strong>
                            </div>

                            {/* Qualitative Analysis */}
                            <div
                              style={{
                                fontSize: '0.74rem',
                                background: '#0a1420',
                                padding: '0.45rem',
                                borderRadius: 4,
                                color: 'var(--text-muted)',
                                lineHeight: 1.4,
                                marginTop: 'auto'
                              }}
                            >
                              {p.initialPlacement.analysisText}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* TAB 3: PORTURI & COMERȚ (HARBORS & TRADING) */}
                {reportTab === 'ports' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    <div style={{ background: '#09131d', border: '1px solid var(--border-color)', borderRadius: 8, padding: '0.75rem' }}>
                      <h4 style={{ margin: '0 0 0.35rem 0', color: 'var(--accent-gold)' }}>
                        ⚓ Rolul Porturilor & Negocierilor în Partidă
                      </h4>
                      <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                        Porturile specializate (2:1) sau portul general (3:1) permit jucătorilor cu surplus de resurse să evite rata nefavorabilă de 4:1 a băncii. Urmăriți când a obținut fiecare jucător primul port și câte resurse a salvat.
                      </p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.65rem' }}>
                      {profiles.map((p) => {
                        const pColor = pColors[p.color] ?? '#38bdf8';
                        return (
                          <div
                            key={p.playerId}
                            style={{
                              background: '#0d1a29',
                              border: p.isWinner ? '1.5px solid var(--accent-gold)' : '1px solid var(--border-color)',
                              borderRadius: 8,
                              padding: '0.75rem',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 7
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ width: 10, height: 10, borderRadius: '50%', background: pColor }} />
                                <strong>{p.playerName}</strong>
                              </div>
                              <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>{p.finalScore} VP</span>
                            </div>

                            {/* Port Status */}
                            <div style={{ background: '#0a1420', padding: '0.5rem', borderRadius: 6, fontSize: '0.76rem' }}>
                              <div style={{ marginBottom: 3 }}>
                                Primul Port: <strong>{p.ports.firstPortTurn ? `Tura ${p.ports.firstPortTurn}` : 'Niciun port'}</strong>
                              </div>
                              {p.ports.firstPortType && (
                                <div style={{ color: 'var(--accent-gold)', marginBottom: 3 }}>
                                  Tip: <strong>{p.ports.firstPortType}</strong>
                                </div>
                              )}
                              <div>
                                Total Porturi Obținute: <strong>{p.ports.harborsAcquired.length}</strong>
                              </div>
                            </div>

                            {/* Harbors Acquired jump list */}
                            {p.ports.harborsAcquired.length > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                {p.ports.harborsAcquired.map((h, hIdx) => (
                                  <button
                                    key={hIdx}
                                    type="button"
                                    className="btn"
                                    style={{ padding: '2px 6px', fontSize: '0.72rem', textAlign: 'left' }}
                                    onClick={() => {
                                      setCurrentSeq(h.sequence);
                                      setActiveModal('none');
                                    }}
                                  >
                                    ⚓ Tura {h.turn} ({h.type}) ➔ Pas #{h.sequence}
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* Bank vs Port Trades */}
                            <div style={{ fontSize: '0.76rem', borderTop: '1px solid var(--border-color)', paddingTop: 5 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                <span>Schimburi Port (3:1 / 2:1):</span>
                                <strong style={{ color: '#10b981' }}>{p.ports.portTradesCount}</strong>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Schimburi Bancă (4:1):</span>
                                <strong>{p.ports.bankTradesCount}</strong>
                              </div>
                            </div>

                            {/* P2P Trading */}
                            <div style={{ fontSize: '0.76rem', borderTop: '1px solid var(--border-color)', paddingTop: 5 }}>
                              <div style={{ fontWeight: 600, marginBottom: 3 }}>Negocieri cu Jucători:</div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                                <span>Oferte propuse:</span>
                                <span>{p.trading.tradesProposed}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                                <span>Oferte acceptate:</span>
                                <span style={{ color: '#10b981' }}>{p.trading.tradesAccepted}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                                <span>Oferte refuzate:</span>
                                <span style={{ color: '#f87171' }}>{p.trading.tradesRejected}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                                <span>Schimburi reușite:</span>
                                <strong>{p.trading.successfulP2pTrades}</strong>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* TAB 4: CĂRȚI & ARMATĂ (DEV CARDS & VICTORY POINTS) */}
                {reportTab === 'cards' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    <div style={{ background: '#09131d', border: '1px solid var(--border-color)', borderRadius: 8, padding: '0.75rem' }}>
                      <h4 style={{ margin: '0 0 0.35rem 0', color: 'var(--accent-gold)' }}>
                        🃏 Strategia Cărților de Dezvoltare & Titluri Speciale
                      </h4>
                      <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                        Cărțile de dezvoltare asigură surprize decisive: Cavaleri pentru controlul hoțului și Cea mai mare armată (+2 VP), cărți de Progres (Monopol, Anul Abundenței, Drumuri) și Puncte de Victorie ascunse.
                      </p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.65rem' }}>
                      {profiles.map((p) => {
                        const pColor = pColors[p.color] ?? '#38bdf8';
                        return (
                          <div
                            key={p.playerId}
                            style={{
                              background: '#0d1a29',
                              border: p.isWinner ? '1.5px solid var(--accent-gold)' : '1px solid var(--border-color)',
                              borderRadius: 8,
                              padding: '0.75rem',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 6
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ width: 10, height: 10, borderRadius: '50%', background: pColor }} />
                                <strong>{p.playerName}</strong>
                              </div>
                              <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>{p.finalScore} VP</span>
                            </div>

                            {/* Dev Cards Bought & Played */}
                            <div style={{ background: '#0a1420', padding: '0.5rem', borderRadius: 6, fontSize: '0.76rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                <span>Cărți Cumpărate:</span>
                                <strong style={{ color: 'var(--accent-gold)' }}>{p.devCards.bought}</strong>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                <span>⚔️ Cavaleri Jucați:</span>
                                <strong>{p.devCards.playedKnights}</strong>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                <span>🌾 Anul Abundenței:</span>
                                <strong>{p.devCards.playedYearOfPlenty}</strong>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                <span>💰 Monopol Jucat:</span>
                                <strong>{p.devCards.playedMonopoly}</strong>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>🛣️ Drumuri Gratuite:</span>
                                <strong>{p.devCards.playedRoadBuilding}</strong>
                              </div>
                            </div>

                            {/* Special Titles & Hidden VP */}
                            <div style={{ fontSize: '0.76rem', display: 'flex', flexDirection: 'column', gap: 3 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Cea mai mare Armată (2 VP):</span>
                                <strong style={{ color: p.scoreBreakdown.largestArmy > 0 ? '#10b981' : 'var(--text-muted)' }}>
                                  {p.scoreBreakdown.largestArmy > 0 ? 'DA (+2)' : 'NU'}
                                </strong>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Cel mai lung Drum (2 VP):</span>
                                <strong style={{ color: p.scoreBreakdown.longestRoad > 0 ? '#10b981' : 'var(--text-muted)' }}>
                                  {p.scoreBreakdown.longestRoad > 0 ? 'DA (+2)' : 'NU'}
                                </strong>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Puncte de Victorie Ascunse:</span>
                                <strong style={{ color: p.scoreBreakdown.victoryPointCards > 0 ? '#c7d2fe' : 'var(--text-muted)' }}>
                                  +{p.scoreBreakdown.victoryPointCards} VP
                                </strong>
                              </div>
                            </div>

                            {/* Complete VP Breakdown */}
                            <div
                              style={{
                                background: '#112233',
                                padding: '0.45rem',
                                borderRadius: 4,
                                fontSize: '0.74rem',
                                marginTop: 'auto'
                              }}
                            >
                              <strong>Defalcare Puncte de Victorie:</strong>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                                <span>Așezări ({p.scoreBreakdown.settlements} × 1):</span>
                                <span>{p.scoreBreakdown.settlements} VP</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Orașe ({p.scoreBreakdown.cities} × 2):</span>
                                <span>{p.scoreBreakdown.cities * 2} VP</span>
                              </div>
                              {p.scoreBreakdown.largestArmy > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6ee7b7' }}>
                                  <span>Armată:</span>
                                  <span>+2 VP</span>
                                </div>
                              )}
                              {p.scoreBreakdown.longestRoad > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6ee7b7' }}>
                                  <span>Drum:</span>
                                  <span>+2 VP</span>
                                </div>
                              )}
                              {p.scoreBreakdown.victoryPointCards > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#c7d2fe' }}>
                                  <span>Cărți VP:</span>
                                  <span>+{p.scoreBreakdown.victoryPointCards} VP</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* TAB 5: ZARURI, RATĂ & ECONOMIE (DICE COVERAGE & PRODUCTION) */}
                {reportTab === 'dice' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.65rem' }}>
                      {profiles.map((p) => {
                        const pColor = pColors[p.color] ?? '#38bdf8';
                        return (
                          <div
                            key={p.playerId}
                            style={{
                              background: '#0d1a29',
                              border: p.isWinner ? '1.5px solid var(--accent-gold)' : '1px solid var(--border-color)',
                              borderRadius: 8,
                              padding: '0.75rem',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 6
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ width: 10, height: 10, borderRadius: '50%', background: pColor }} />
                                <strong>{p.playerName}</strong>
                              </div>
                              <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>{p.finalScore} VP</span>
                            </div>

                            {/* Dice Hit Rate */}
                            <div style={{ background: '#0a1420', padding: '0.5rem', borderRadius: 6, fontSize: '0.76rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                <span>Rată de Zar Favorabilă:</span>
                                <strong style={{ color: p.coverage.diceHitRatePct >= 45 ? '#10b981' : '#38bdf8' }}>
                                  {p.coverage.diceHitRatePct}%
                                </strong>
                              </div>
                              <div style={{ width: '100%', height: 6, background: '#112233', borderRadius: 3, overflow: 'hidden' }}>
                                <div
                                  style={{
                                    width: `${Math.min(100, p.coverage.diceHitRatePct * 1.5)}%`,
                                    height: '100%',
                                    background: p.coverage.diceHitRatePct >= 45 ? '#10b981' : '#38bdf8'
                                  }}
                                />
                              </div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 3 }}>
                                {p.coverage.diceHitsCount} aruncări au produs resurse
                              </div>
                            </div>

                            {/* Production & Economy */}
                            <div style={{ fontSize: '0.76rem', display: 'flex', flexDirection: 'column', gap: 3 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Total Resurse Produse:</span>
                                <strong style={{ color: 'var(--accent-gold)' }}>{p.economy.totalResourcesProduced}</strong>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Medie Resurse pe Tură:</span>
                                <strong>{p.economy.avgResourcesPerTurn} / tură</strong>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#f87171' }}>
                                <span>Aruncate la Hoț (7):</span>
                                <span>-{p.economy.resourcesDiscardedOn7} resurse</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                                <span>Furate de la adversari:</span>
                                <span>+{p.economy.resourcesStolenFromOthers}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                                <span>Furate de adversari:</span>
                                <span>-{p.economy.resourcesStolenByOthers}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: 3 }}>
                                <span>Hexagoane unice:</span>
                                <span>{p.coverage.uniqueHexCount} hexagoane</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Dice Histogram */}
                    <div style={{ background: '#09131d', border: '1px solid var(--border-color)', borderRadius: 8, padding: '0.75rem' }}>
                      <div style={{ fontSize: '0.84rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                        🎲 Distribuția Reală a Zarurilor în Partidă (2–12):
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 95, paddingTop: 12 }}>
                        {Object.entries(strategicReport.diceHistogram).map(([sumStr, count]) => {
                          const hPct = Math.round((count / maxDiceCount) * 65);
                          return (
                            <div
                              key={sumStr}
                              style={{
                                flex: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                fontSize: '0.75rem'
                              }}
                            >
                              <span style={{ color: 'var(--text-muted)' }}>{count}</span>
                              <div
                                style={{
                                  width: '100%',
                                  height: Math.max(4, hPct),
                                  background:
                                    sumStr === '6' || sumStr === '8'
                                      ? '#ef4444'
                                      : sumStr === '7'
                                      ? '#f59e0b'
                                      : '#38bdf8',
                                  borderRadius: '4px 4px 0 0'
                                }}
                              />
                              <strong>{sumStr}</strong>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 6: DECIZII AI & EZITĂRI (DECISION ACCURACY) */}
                {reportTab === 'decisions' && (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.65rem' }}>
                      {Object.values(strategicReport.playerSummaries).map((ps) => {
                        const totalEval = ps.optimalDecisionsCount + ps.suboptimalDecisionsCount;
                        const accuracy =
                          totalEval > 0 ? Math.round((ps.optimalDecisionsCount / totalEval) * 100) : 100;
                        return (
                          <div key={ps.playerId} className="candidate-row" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <strong>{ps.playerName}</strong>
                              <span>{ps.finalScore} VP</span>
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                              Acuratețe decizii: <strong style={{ color: accuracy >= 80 ? '#10b981' : '#f59e0b' }}>{accuracy}%</strong> ({ps.optimalDecisionsCount} optime / {totalEval} evaluate)
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                              Gap mediu scor: <strong>{ps.averageDecisionGap}</strong>
                            </div>
                            {ps.biggestMistakes.slice(0, 3).map((m, mIdx) => (
                              <button
                                key={mIdx}
                                type="button"
                                className="btn"
                                style={{ padding: '3px 8px', fontSize: '0.74rem', textAlign: 'left', marginTop: 2 }}
                                onClick={() => {
                                  setCurrentSeq(m.sequence);
                                  setActiveModal('none');
                                }}
                              >
                                🔍 Ezitarea #{m.sequence} (Tura {m.turn}, -{m.scoreGap} pct)
                              </button>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL 3: FULL FILTERABLE EVENT LOG */}
      {activeModal === 'event_log' && (
        <div className="modal-backdrop" onClick={() => setActiveModal('none')}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📜 Jurnalul Complet al Partidei ({filteredEvents.length} evenimente)</h3>
              <button type="button" className="btn" onClick={() => setActiveModal('none')}>
                ✕ Închide
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.65rem' }}>
                <select value={filterPlayerId} onChange={(e) => setFilterPlayerId(e.target.value)}>
                  <option value="all">Toți jucătorii</option>
                  {replay.initialState.players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <select value={filterActionType} onChange={(e) => setFilterActionType(e.target.value)}>
                  <option value="all">Toate acțiunile</option>
                  <option value="roll_dice">roll_dice</option>
                  <option value="build_settlement">build_settlement</option>
                  <option value="build_city">build_city</option>
                  <option value="build_road">build_road</option>
                  <option value="buy_dev_card">buy_dev_card</option>
                  <option value="play_knight">play_knight</option>
                  <option value="trade_bank">trade_bank</option>
                </select>
              </div>
              <div className="event-list">
                {filteredEvents.map((ev) => {
                  const pName =
                    replay.initialState.players.find((p) => p.id === ev.playerId)?.name ??
                    ev.playerId;
                  return (
                    <div
                      key={ev.sequence}
                      className="event-item"
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        setCurrentSeq(ev.sequence);
                        setActiveModal('none');
                      }}
                    >
                      <strong>#{ev.sequence}</strong> [T{ev.turn}] <strong>{pName}</strong>:{' '}
                      {formatActionDescription(ev.action, locale, ev.details)}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
