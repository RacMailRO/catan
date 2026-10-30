import React, { useEffect, useState } from 'react';
import { ReplayFile } from '@catan/core';
import { HallOfFamePlayerEntry, HallOfFameWonGame } from '@catan/protocol';
import { Locale } from '../i18n';

export interface HallOfFameViewProps {
  locale: Locale;
  onOpenReplay: (replay: ReplayFile) => void;
}

export const HallOfFameView: React.FC<HallOfFameViewProps> = ({ locale, onOpenReplay }) => {
  const [players, setPlayers] = useState<HallOfFamePlayerEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [loadingGameId, setLoadingGameId] = useState<string | null>(null);

  const load = () => {
    setError(null);
    fetch('/api/hall-of-fame')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setPlayers(data.players ?? []))
      .catch(() =>
        setError(
          locale === 'ro'
            ? 'Nu s-a putut încărca Hall of Fame de pe server.'
            : 'Could not load the Hall of Fame from the server.'
        )
      );
  };

  useEffect(() => {
    load();
  }, []);

  const handleOpenWin = async (won: HallOfFameWonGame) => {
    setLoadingGameId(won.gameId);
    try {
      const res = await fetch(`/api/games/${won.gameId}/replay`);
      if (res.ok) {
        const data = await res.json();
        if (data.replay) {
          onOpenReplay(data.replay as ReplayFile);
        }
      }
    } catch {
      // Game may have since been pruned from the games table - the Hall of Fame tally itself
      // is unaffected (see recordHallOfFameResultIfNew), only the replay link goes stale.
    } finally {
      setLoadingGameId(null);
    }
  };

  return (
    <main className="lobby-container">
      <section className="panel">
        <h2>🏆 {locale === 'ro' ? 'Hall of Fame' : 'Hall of Fame'}</h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.65rem' }}>
          {locale === 'ro'
            ? 'Victorii și partide jucate per jucător uman, pe toate partidele finalizate. Scorul nu scade dacă o partidă salvată e ștearsă din istoric - este ținut separat, o singură dată per partidă.'
            : "Wins and games played per human player, across every finished game. A player's score never decreases if a saved game is later deleted from history - it's tracked separately, once per game."}
        </p>

        {error && (
          <div style={{ color: 'var(--accent-red)', marginBottom: '0.6rem', fontSize: '0.85rem' }}>
            {error}{' '}
            <button type="button" className="btn" onClick={load} style={{ marginLeft: 6 }}>
              {locale === 'ro' ? 'Reîncearcă' : 'Retry'}
            </button>
          </div>
        )}

        {!error && players === null && (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '1rem 0' }}>
            {locale === 'ro' ? 'Se încarcă...' : 'Loading...'}
          </div>
        )}

        {players !== null && players.length === 0 && !error && (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '1rem 0' }}>
            {locale === 'ro'
              ? 'Nicio partidă umană finalizată încă. Joacă o partidă până la final pentru a apărea aici.'
              : 'No finished human games yet. Play a game to completion to show up here.'}
          </div>
        )}

        {players !== null && players.length > 0 && (
          <div className="panel-scroll">
            {players.map((p, idx) => {
              const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
              const expanded = expandedKey === p.playerKey;
              return (
                <div key={p.playerKey} className="candidate-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                    <div>
                      <strong style={{ marginRight: 6 }}>{medal}</strong>
                      <strong>{p.displayName}</strong>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        {locale === 'ro'
                          ? `${p.gamesWon} victorii din ${p.gamesPlayed} partide · ${Math.round(p.winRate * 100)}% rată de câștig`
                          : `${p.gamesWon} wins out of ${p.gamesPlayed} games · ${Math.round(p.winRate * 100)}% win rate`}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn"
                      disabled={p.wonGames.length === 0}
                      onClick={() => setExpandedKey(expanded ? null : p.playerKey)}
                    >
                      {expanded ? '▲' : '▼'} {locale === 'ro' ? 'Victorii' : 'Wins'} ({p.wonGames.length})
                    </button>
                  </div>

                  {expanded && (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {p.wonGames.map((won) => (
                        <div
                          key={won.gameId}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '0.78rem',
                            background: 'var(--bg-inset)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '0.4rem 0.6rem'
                          }}
                        >
                          <span>
                            {new Date(won.finishedAtMs).toLocaleString()} · {won.turns}{' '}
                            {locale === 'ro' ? 'ture' : 'turns'}
                            {won.opponentNames.length > 0 && (
                              <span style={{ color: 'var(--text-muted)' }}>
                                {' '}
                                vs {won.opponentNames.join(', ')}
                              </span>
                            )}
                          </span>
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ padding: '2px 8px', fontSize: '0.74rem' }}
                            disabled={loadingGameId === won.gameId}
                            onClick={() => handleOpenWin(won)}
                          >
                            🔍 {loadingGameId === won.gameId ? '...' : locale === 'ro' ? 'Replay' : 'Replay'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
};
