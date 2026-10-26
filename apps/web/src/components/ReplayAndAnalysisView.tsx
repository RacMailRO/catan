import React, { useState, useEffect, useMemo } from 'react';
import {
  ALL_RESOURCES,
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

type ReplayModalType = 'none' | 'saved_games' | 'strategic_report' | 'event_log';

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
  const [savedReplays, setSavedReplays] = useState<SavedReplaySummary[]>(() =>
    loadSavedReplays()
  );

  // Refresh saved games list when replay changes
  useEffect(() => {
    setSavedReplays(loadSavedReplays());
  }, [replay?.gameId]);

  useEffect(() => {
    if (replay) {
      setCurrentSeq(replay.events.length);
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
                      onClick={() => onSelectReplay(item.replay)}
                    >
                      🔍 Analizează
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => handleExport(item.replay)}
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', minHeight: 0, overflow: 'hidden' }}>
        <div className="panel" style={{ padding: '0.55rem 0.75rem', flexShrink: 0 }}>
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
        <div className="board-stage">
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
          <BoardSvg
            board={reconstructedState.board}
            playerColors={playerColors}
            locale={locale}
          />
        </div>

        {/* Compact 4-Player Resource Cards Row at bottom of Replay Board */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '0.45rem',
            flexShrink: 0
          }}
        >
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', minHeight: 0, overflow: 'hidden' }}>
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
                Top Acțiuni Candidate Legale (evaluate pe PlayerView):
              </div>
              {stepComparison.evaluatedAlternatives.map((cand, idx) => {
                const isChosen =
                  JSON.stringify(cand.action) === JSON.stringify(stepComparison.actualAction);
                return (
                  <div key={idx} className={`candidate-row ${isChosen ? 'chosen' : ''}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>
                        <strong>#{idx + 1}</strong> {formatActionDescription(cand.action, locale)}{' '}
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
                        onClick={() => {
                          onSelectReplay(item.replay);
                          setActiveModal('none');
                        }}
                      >
                        Încarcă
                      </button>
                      <button type="button" className="btn" onClick={() => handleExport(item.replay)}>
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

      {/* MODAL 2: STRATEGIC REPORT & DICE HISTOGRAM */}
      {activeModal === 'strategic_report' && strategicReport && (
        <div className="modal-backdrop" onClick={() => setActiveModal('none')}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📊 Raport Strategic & Statistici Partidă ({replay.gameId})</h3>
              <button type="button" className="btn" onClick={() => setActiveModal('none')}>
                ✕ Închide
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.9rem' }}>
                {Object.values(strategicReport.playerSummaries).map((ps) => {
                  const totalEval = ps.optimalDecisionsCount + ps.suboptimalDecisionsCount;
                  const accuracy =
                    totalEval > 0 ? Math.round((ps.optimalDecisionsCount / totalEval) * 100) : 100;
                  return (
                    <div key={ps.playerId} className="candidate-row">
                      <strong>{ps.playerName}</strong> ({ps.finalScore} VP)
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Acuratețe decizii: <strong>{accuracy}%</strong> · Gap mediu:{' '}
                        {ps.averageDecisionGap}
                      </div>
                      {ps.biggestMistakes[0] && (
                        <button
                          type="button"
                          className="btn"
                          style={{ marginTop: 6, padding: '2px 8px', fontSize: '0.74rem' }}
                          onClick={() => {
                            setCurrentSeq(ps.biggestMistakes[0]!.sequence);
                            setActiveModal('none');
                          }}
                        >
                          🔍 Mergi la ezitarea #{ps.biggestMistakes[0]!.sequence} (-
                          {ps.biggestMistakes[0]!.scoreGap})
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ fontSize: '0.84rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                🎲 Distribuția Zarurilor (2–12):
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
        </div>
      )}

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
