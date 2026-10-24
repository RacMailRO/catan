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
import {
  Locale,
  PHASE_LABELS,
  RESOURCE_ICONS,
  RESOURCE_LABELS,
  TRANSLATIONS,
  formatActionDescription
} from '../i18n';

export interface ReplayAndAnalysisViewProps {
  replay: ReplayFile | null;
  onSelectReplay: (replay: ReplayFile) => void;
  locale: Locale;
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
      onSelectReplay(sim.replay);
    }
  };

  const handleExport = () => {
    if (!replay) return;
    const json = exportReplayJson(replay, true);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `catan-replay-${replay.gameId}.json`;
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
        onSelectReplay(imported);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : 'Fișier replay invalid.');
      }
    };
    reader.readAsText(file);
  };

  if (!replay || !reconstructedState) {
    return (
      <div className="panel" style={{ maxWidth: 760, margin: '2rem auto', textAlign: 'center' }}>
        <h2>{t.navReplay}</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1.2rem' }}>
          {locale === 'ro'
            ? 'Nicio partidă încărcată în Replay Viewer. Poți genera o partidă completă 4-AI cu telemetrie de decizie sau importa un fișier JSON.'
            : 'No game loaded in Replay Viewer. Generate a full 4-AI game with decision telemetry or import a JSON file.'}
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={handleGenerateSampleReplay}>
            ⚡ {t.quickAiMatch}
          </button>
          <label className="btn" style={{ cursor: 'pointer' }}>
            📂 {t.importReplay}
            <input type="file" accept=".json" onChange={handleImportFile} style={{ display: 'none' }} />
          </label>
        </div>
        {importError && <p style={{ color: 'var(--accent-red)', marginTop: '0.75rem' }}>{importError}</p>}
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
    <div className="replay-layout">
      {/* Left Column: Board & Timeline Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div className="panel" style={{ padding: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <strong>ID: {replay.gameId}</strong> · Seed: <code>{replay.seed}</code> ·{' '}
              <span style={{ color: 'var(--accent-gold)' }}>
                {locale === 'ro' ? 'Tura' : 'Turn'} {reconstructedState.turn} ·{' '}
                {locale === 'ro' ? 'Evenimentul' : 'Event'} {currentSeq} / {replay.events.length}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn" onClick={handleGenerateSampleReplay}>
                ⚡ {t.quickAiMatch}
              </button>
              <button type="button" className="btn" onClick={handleExport}>
                💾 {t.exportReplay}
              </button>
              <label className="btn" style={{ cursor: 'pointer' }}>
                📂 {t.importReplay}
                <input type="file" accept=".json" onChange={handleImportFile} style={{ display: 'none' }} />
              </label>
            </div>
          </div>

          {/* Transport Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.65rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn" onClick={() => setCurrentSeq(0)} disabled={currentSeq === 0}>
              ⏮
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setCurrentSeq((s) => Math.max(0, s - 1))}
              disabled={currentSeq === 0}
            >
              ◀ {locale === 'ro' ? 'Pas Înapoi' : 'Step Back'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setIsPlaying((p) => !p)}
            >
              {isPlaying ? '⏸ Pause' : '▶ Play'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setCurrentSeq((s) => Math.min(replay.events.length, s + 1))}
              disabled={currentSeq >= replay.events.length}
            >
              {locale === 'ro' ? 'Pas Înainte' : 'Step Fwd'} ▶
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
              style={{ flex: 1, minWidth: 140 }}
            />
          </div>
        </div>

        {/* Board at Selected Sequence */}
        <div className="board-stage" style={{ minHeight: 480 }}>
          <div className="board-top-banner">
            <div className="phase-pill">
              {PHASE_LABELS[locale][reconstructedState.phase]}
              {reconstructedState.lastDiceRoll && (
                <span style={{ marginLeft: '0.6rem', color: 'var(--accent-gold)' }}>
                  🎲 {reconstructedState.lastDiceRoll.die1} + {reconstructedState.lastDiceRoll.die2} ={' '}
                  {reconstructedState.lastDiceRoll.total}
                </span>
              )}
            </div>
          </div>
          <BoardSvg
            board={reconstructedState.board}
            playerColors={playerColors}
            locale={locale}
          />
        </div>

        {/* Player Inventories at Selected Moment */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: '0.6rem'
          }}
        >
          {reconstructedState.players.map((p) => {
            const sc = calculateScore(reconstructedState, p.id);
            const isActive = reconstructedState.activePlayerId === p.id;
            return (
              <div key={p.id} className={`player-card ${isActive ? 'active-turn' : ''}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>
                    <span
                      className="color-dot"
                      style={{
                        backgroundColor: p.color,
                        marginRight: 6,
                        verticalAlign: 'middle'
                      }}
                    />
                    <strong>{p.name}</strong>
                  </span>
                  <span style={{ color: 'var(--accent-gold)', fontWeight: 700 }}>
                    {sc.totalScore} VP ({sc.publicScore} pub)
                  </span>
                </div>
                <div className="res-badges">
                  {ALL_RESOURCES.map((r) => (
                    <span key={r} className="res-badge" title={RESOURCE_LABELS[locale][r]}>
                      {RESOURCE_ICONS[r]} {p.resources[r]}
                    </span>
                  ))}
                </div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                  ⚔️ {p.knightsPlayed} · 🛣️ {p.longestRoadLength} · 🃏 {p.devCards.filter((c) => !c.played).length}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Column: Decision Inspector, Event Log & Strategic Report */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {/* AI & Strategic Decision Inspector for Current Step */}
        <div className="panel">
          <h2>
            🧠{' '}
            {locale === 'ro'
              ? `Inspector Decizie & Alternative (Pasul #${currentSeq})`
              : `Decision & Alternatives Inspector (Step #${currentSeq})`}
          </h2>
          {!stepComparison ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem' }}>
              {locale === 'ro'
                ? 'Selectează un eveniment (pas >= 1) pentru a vedea evaluarea mutării și alternativele legale.'
                : 'Select an event (step >= 1) to inspect the move evaluation and legal alternatives.'}
            </p>
          ) : (
            <div>
              <div
                style={{
                  background: '#0d1a29',
                  padding: '0.65rem',
                  borderRadius: 8,
                  marginBottom: '0.65rem',
                  borderLeft: `4px solid ${
                    stepComparison.isOptimal ? 'var(--accent-green)' : 'var(--accent-gold)'
                  }`
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <strong>
                    {stepComparison.playerName}:{' '}
                    {formatActionDescription(stepComparison.actualAction, locale)}
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
                      : `(Gap: -${stepComparison.scoreGap} față de cea mai bună alternativă)`}
                  </span>
                </div>
                {stepComparison.recordedAIDecision && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                    Profil AI: <strong>{stepComparison.recordedAIDecision.difficulty}</strong> · Stil:{' '}
                    <strong>{stepComparison.recordedAIDecision.style}</strong> · Timp calcul:{' '}
                    {stepComparison.recordedAIDecision.computeTimeMs}ms
                    {stepComparison.recordedAIDecision.simulationsRun
                      ? ` · Simulări Monte Carlo: ${stepComparison.recordedAIDecision.simulationsRun}`
                      : ''}
                    <div>Motiv AI: {stepComparison.recordedAIDecision.chosenReason}</div>
                  </div>
                )}
              </div>

              <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                {locale === 'ro'
                  ? 'Top Acțiuni Candidate Legale în acel moment (evaluate pe PlayerView):'
                  : 'Top Legal Candidate Actions at that moment (evaluated on PlayerView):'}
              </div>
              <div style={{ maxHeight: 210, overflowY: 'auto' }}>
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
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem', marginTop: 2 }}>
                        {cand.explanation} · Factori:{' '}
                        {Object.entries(cand.factors)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(', ')}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Interactive Event Timeline with Filter */}
        <div className="panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.4rem' }}>
            <h2 style={{ margin: 0, border: 'none', padding: 0 }}>📜 {t.eventLogTitle}</h2>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <select
                value={filterPlayerId}
                onChange={(e) => setFilterPlayerId(e.target.value)}
                aria-label="Filter by player"
              >
                <option value="all">{locale === 'ro' ? 'Toți jucătorii' : 'All players'}</option>
                {replay.initialState.players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select
                value={filterActionType}
                onChange={(e) => setFilterActionType(e.target.value)}
                aria-label="Filter by action"
              >
                <option value="all">{locale === 'ro' ? 'Toate acțiunile' : 'All actions'}</option>
                <option value="roll_dice">roll_dice</option>
                <option value="build_settlement">build_settlement</option>
                <option value="build_city">build_city</option>
                <option value="build_road">build_road</option>
                <option value="buy_dev_card">buy_dev_card</option>
                <option value="play_knight">play_knight</option>
                <option value="trade_bank">trade_bank</option>
              </select>
            </div>
          </div>

          <div className="event-list" style={{ maxHeight: 220 }}>
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
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>
                      <strong>#{ev.sequence}</strong> [T{ev.turn}] <strong>{pName}</strong>:{' '}
                      {formatActionDescription(ev.action, locale)}
                    </span>
                    <code style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {ev.stateHashAfter}
                    </code>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Post-Game Strategic Report & Dice Histogram */}
        {strategicReport && (
          <div className="panel">
            <h2>
              📊{' '}
              {locale === 'ro'
                ? 'Raport Strategic & Statistici Partidă'
                : 'Strategic Report & Game Statistics'}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.5rem', marginBottom: '0.75rem' }}>
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
                        style={{ marginTop: 4, padding: '2px 6px', fontSize: '0.74rem' }}
                        onClick={() => setCurrentSeq(ps.biggestMistakes[0]!.sequence)}
                      >
                        🔍 Vezi ezitarea la #{ps.biggestMistakes[0]!.sequence} (-
                        {ps.biggestMistakes[0]!.scoreGap})
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Dice Histogram */}
            <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
              🎲 {locale === 'ro' ? 'Distribuția Zarurilor (2–12):' : 'Dice Roll Distribution (2–12):'}
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 70, paddingTop: 10 }}>
              {Object.entries(strategicReport.diceHistogram).map(([sumStr, count]) => {
                const hPct = Math.round((count / maxDiceCount) * 44);
                return (
                  <div
                    key={sumStr}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      fontSize: '0.72rem'
                    }}
                  >
                    <span style={{ color: 'var(--text-muted)' }}>{count}</span>
                    <div
                      style={{
                        width: '100%',
                        height: Math.max(3, hPct),
                        background:
                          sumStr === '6' || sumStr === '8'
                            ? '#ef4444'
                            : sumStr === '7'
                            ? '#f59e0b'
                            : '#38bdf8',
                        borderRadius: '3px 3px 0 0'
                      }}
                    />
                    <strong>{sumStr}</strong>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
