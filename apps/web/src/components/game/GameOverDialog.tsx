import React from 'react';
import { GameState, calculateScore, getPlayerById } from '@catan/core';
import { Confetti } from '../GameAssets';
import { Locale } from '../../i18n';

export interface GameOverDialogProps {
  /** Active UI locale, used for the winner announcement's phrasing. */
  locale: Locale;
  /** Final game state, used to compute the winner's score breakdown. Rendered only once
   *  `gameState.winnerId` is set. */
  gameState: GameState;
}

/** Winner-announcement content shown in the game-over Dialog once a match ends — a VP
 *  breakdown (settlements/cities/longest-road/largest-army/hidden-VP cards) and a note that
 *  the game was auto-saved to Game History for replay/analysis. The Dialog forces an "Open
 *  Replay" or "New Game" choice via its footer (owned by App.tsx), so this has no onClose. */
export const GameOverDialog: React.FC<GameOverDialogProps> = ({ locale, gameState }) => {
  const winnerId = gameState.winnerId;
  if (!winnerId) return null;

  const winner = getPlayerById(gameState, winnerId);
  const scoreInfo = calculateScore(gameState, winnerId);
  let settlementCount = 0;
  let cityCount = 0;
  for (const b of Object.values(gameState.board.buildings)) {
    if (b.ownerId === winnerId) {
      if (b.type === 'city') cityCount++;
      else settlementCount++;
    }
  }
  const hasLongestRoad = gameState.longestRoadOwnerId === winnerId;
  const hasLargestArmy = gameState.largestArmyOwnerId === winnerId;

  return (
    <>
      <Confetti />
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ color: 'var(--accent-gold)', marginBottom: '0.4rem' }}>
          🏆 {winner?.name}{' '}
          {locale === 'ro' ? 'a câștigat partida!' : 'won the game!'}
        </h2>

        {/* Winner Points Breakdown */}
        <div
          style={{
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid var(--accent-gold)',
            borderRadius: 8,
            padding: '0.75rem',
            margin: '0.75rem 0',
            textAlign: 'left'
          }}
        >
          <div style={{ fontWeight: 700, color: 'var(--accent-gold)', marginBottom: 6, textAlign: 'center', fontSize: '0.95rem' }}>
            📊 Detaliu Puncte de Victorie (Total: {scoreInfo.totalScore} / {gameState.rules.victoryPointsToWin} VP)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', fontSize: '0.84rem' }}>
            <div>🏠 {settlementCount}x Așezări: <strong>+{settlementCount} VP</strong></div>
            <div>🏰 {cityCount}x Orașe: <strong>+{cityCount * 2} VP</strong></div>
            {hasLongestRoad && <div>🛣️ Drumul cel mai lung: <strong>+2 VP</strong></div>}
            {hasLargestArmy && <div>⚔️ Armata cea mai mare: <strong>+2 VP</strong></div>}
            {scoreInfo.hiddenVictoryPoints > 0 && (
              <div style={{ color: '#4ade80', fontWeight: 600 }}>
                🏆 {scoreInfo.hiddenVictoryPoints}x Punct de Victorie: <strong>+{scoreInfo.hiddenVictoryPoints} VP</strong>
              </div>
            )}
          </div>
          {scoreInfo.hiddenVictoryPoints > 0 && (
            <div style={{ marginTop: 8, fontSize: '0.82rem', color: '#4ade80', background: 'rgba(34, 197, 94, 0.15)', padding: '0.4rem 0.6rem', borderRadius: 4, textAlign: 'center', fontWeight: 600 }}>
              ✨ Victoria a fost decisă prin tragerea cărții de dezvoltare: 🏆 Punct de Victorie!
            </div>
          )}
        </div>

        <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem', marginBottom: '1rem' }}>
          Partida ({gameState.gameId}) a fost salvată automat în Istoricul Partidelor pentru analiză pas-cu-pas, evaluarea deciziilor și statistici.
        </p>
      </div>
    </>
  );
};
