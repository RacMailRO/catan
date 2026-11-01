import React from 'react';
import { ALL_RESOURCES, INITIAL_PLAYER_PIECES, PlayerView, ResourceType } from '@catan/core';
import { ResourceCardSprite, ResourceIcon } from '../GameAssets';
import { Locale, RESOURCE_LABELS, TRANSLATIONS } from '../../i18n';

export interface ScoreBankProps {
  /** Active UI locale, used for labels and to look up button translations. */
  locale: Locale;
  /** Current player-view snapshot (players, bank stock, dev-card deck count, etc.). */
  playerView: PlayerView;
  /** Per-player per-resource "+N" gain amounts, shown as a brief flash badge on resource cards. */
  resourceGainFlash: Record<string, Partial<Record<ResourceType, number>>>;
  /** Whether the active scenario uses ships, so the Ships piece-count pill is shown. */
  hasShipsInScenario: boolean;
  /** Whether the match has ended (disables the Step AI button). */
  isGameOver: boolean;
  /** Whether the local human occupies the active turn (disables the Step AI button). */
  isHumanTurn: boolean;
  /** Whether AI auto-play is currently enabled. */
  autoPlayAi: boolean;
  /** Toggles AI auto-play on/off. */
  onToggleAutoPlayAi: () => void;
  /** Executes a single AI step (Step AI button). */
  onStepAi: () => void;
  /** Number of events recorded so far, shown on the Event Log button. */
  eventCount: number;
  /** Opens the Event Log surface. */
  onOpenEventLog: () => void;
  /** Opens the Costs Help surface. */
  onOpenCostsHelp: () => void;
}

/** Leaderboard, per-player resource/piece/score grid, bank stock, and match controls
 *  (step AI / auto-play / event log / costs table) shown in the score_bank AdaptiveSurface. */
export const ScoreBank: React.FC<ScoreBankProps> = ({
  locale,
  playerView,
  resourceGainFlash,
  hasShipsInScenario,
  isGameOver,
  isHumanTurn,
  autoPlayAi,
  onToggleAutoPlayAi,
  onStepAi,
  eventCount,
  onOpenEventLog,
  onOpenCostsHelp
}) => {
  const t = TRANSLATIONS[locale];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
      {/* Responsive Grid of Players */}
      <div className="score-bank-grid">
        {playerView.players.map((p) => {
          const isCurrent = playerView.activePlayerId === p.id;
          const hasLongestRoad = playerView.longestRoadOwnerId === p.id;
          const hasLargestArmy = playerView.largestArmyOwnerId === p.id;
          return (
            <div
              key={p.id}
              className={`player-grid-card ${isCurrent ? 'active-turn' : ''}`}
            >
              {isCurrent && <span className="player-grid-turn-badge">⚡ La rând</span>}
              <div className="player-grid-header">
                <div className="player-grid-title">
                  <span
                    className="color-dot"
                    style={{ backgroundColor: p.color, width: 12, height: 12 }}
                  />
                  <span className="player-grid-name">{p.name}</span>
                  <span className="player-grid-type">{p.type.toUpperCase()}</span>
                </div>
                <span className="player-grid-score">
                  {p.totalScore !== undefined ? `${p.totalScore} VP` : `${p.publicScore} VP`}
                </span>
              </div>

              {p.resources ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, justifyContent: 'center', marginTop: 2 }}>
                  {ALL_RESOURCES.map((r) => {
                    const gain = resourceGainFlash[p.id]?.[r];
                    return (
                      <div key={r} style={{ position: 'relative' }}>
                        <ResourceCardSprite resource={r} count={p.resources![r]} locale={locale} size="xs" />
                        {gain ? <span className="resource-gain-flash">+{gain}</span> : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textAlign: 'center', padding: '0.2rem 0' }}>
                  🎴 {p.resourceCount} resurse · 🃏 {p.devCardCount} dezvoltare
                </div>
              )}

              <div className="player-grid-stats">
                {/* Pieces placed vs the fixed physical supply (5 settlements / 4
                    cities / 15 roads) — so "why can't I build a settlement" has an
                    answer right here: 5/5 means none left, not a resource problem. */}
                <div className="player-grid-pieces">
                  {(
                    [
                      ['settlements', '🏠', locale === 'ro' ? 'Așezări' : 'Settlements'] as const,
                      ['cities', '🏰', locale === 'ro' ? 'Orașe' : 'Cities'] as const,
                      ['roads', '🛣️', locale === 'ro' ? 'Drumuri' : 'Roads'] as const,
                      ...(hasShipsInScenario && p.remainingPieces.ships !== undefined
                        ? [['ships', '⛵', locale === 'ro' ? 'Corăbii' : 'Ships'] as const]
                        : [])
                    ]
                  ).map(([key, icon, title]) => {
                    const total = INITIAL_PLAYER_PIECES[key];
                    const used = total - (p.remainingPieces[key] ?? 0);
                    const exhausted = used >= total;
                    return (
                      <span
                        key={key}
                        className={`piece-count-pill ${exhausted ? 'exhausted' : ''}`}
                        title={`${title}: ${used}/${total}`}
                      >
                        {icon} {used}/{total}
                      </span>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>🏆 Drum Lung: {p.longestRoadLength}</span>
                  <span>⚔️ Cavaleri: {p.knightsPlayed}</span>
                </div>
                {(hasLongestRoad || hasLargestArmy) && (
                  <div className="player-grid-badges">
                    {hasLongestRoad && <span className="achievement-badge">🏅 +2 Drum</span>}
                    {hasLargestArmy && <span className="achievement-badge">🛡️ +2 Armată</span>}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bank Stock */}
      <div style={{ background: '#0d1a29', padding: '0.5rem', borderRadius: 8, border: '1px solid var(--border-color)' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-gold)', marginBottom: '0.3rem' }}>
          🏦 Stoc Bancă & Pachet Cărți
        </div>
        <div className="bank-single-row" style={{ margin: 0 }}>
          {ALL_RESOURCES.map((r) => (
            <span key={r} className="res-badge" title={RESOURCE_LABELS[locale][r]}>
              <ResourceIcon resource={r} /> {playerView.bank[r]}
            </span>
          ))}
          <span className="res-badge" title="Cărți de dezvoltare în pachet">
            🃏 {playerView.devCardDeckCount}
          </span>
        </div>
      </div>

      {/* Match Controls — stacks to 1 column on narrow phones (room for full button labels
          instead of clipping the 4th button), 2 on a bit more width, 4 from tablet up. */}
      <div className="grid grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-4 gap-2">
        <button
          type="button"
          className="btn"
          onClick={onStepAi}
          disabled={isGameOver || isHumanTurn}
        >
          ⏭ {t.stepAi}
        </button>
        <button
          type="button"
          className={`btn ${autoPlayAi ? 'btn-primary' : ''}`}
          onClick={onToggleAutoPlayAi}
        >
          {autoPlayAi ? `⏸ ${t.pauseAi}` : `▶ ${t.autoPlayAi}`}
        </button>
        <button
          type="button"
          className="btn"
          onClick={onOpenEventLog}
        >
          📜 Jurnal ({eventCount})
        </button>
        <button
          type="button"
          className="btn"
          onClick={onOpenCostsHelp}
        >
          📋 Tabel Costuri
        </button>
      </div>
    </div>
  );
};
