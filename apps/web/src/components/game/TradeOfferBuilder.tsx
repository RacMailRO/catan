import React from 'react';
import {
  ALL_RESOURCES,
  GameState,
  PlayerState,
  ResourceCount,
  ResourceType,
  getPlayerBankTradeRatio,
  totalResourceCount
} from '@catan/core';
import { ResourceCardSprite, ResourceIcon, amountValueStyle } from '../GameAssets';
import { Locale, RESOURCE_LABELS, TRANSLATIONS } from '../../i18n';

export interface TradeOfferBuilderProps {
  /** Active UI locale, used for labels and translated section titles. */
  locale: Locale;
  /** Current game state, used for board port ratios, bank stock, and trade-offer timeout. */
  gameState: GameState;
  /** The player building the offer (always the active player for this surface). */
  activePlayer: PlayerState;
  /** Resource the player is currently offering the bank in the maritime-trade selector. */
  bankGiveRes: ResourceType;
  /** Resource the player wants back from the bank. */
  bankReceiveRes: ResourceType;
  /** Updates the bank-trade "give" selection. */
  onBankGiveResChange: (resource: ResourceType) => void;
  /** Updates the bank-trade "receive" selection. */
  onBankReceiveResChange: (resource: ResourceType) => void;
  /** Executes a bank/port trade (used by both the manual selector and the quick-trade suggestions). */
  onBankTrade: (give: ResourceType, giveAmount: number, receive: ResourceType) => void;
  /** Resources currently staged to offer in the player-to-player trade builder. */
  p2pOffer: ResourceCount;
  /** Resources currently staged to request in the player-to-player trade builder. */
  p2pRequest: ResourceCount;
  /** Replaces the staged offer amounts. */
  onP2pOfferChange: (next: ResourceCount) => void;
  /** Replaces the staged request amounts. */
  onP2pRequestChange: (next: ResourceCount) => void;
  /** Sends the staged player-to-player trade offer to the table. */
  onProposeTrade: () => void;
}

/** Maritime/bank trade selector plus the player-to-player offer builder, shown in the
 *  trade AdaptiveSurface (building/sending the active player's own offer). */
export const TradeOfferBuilder: React.FC<TradeOfferBuilderProps> = ({
  locale,
  gameState,
  activePlayer,
  bankGiveRes,
  bankReceiveRes,
  onBankGiveResChange,
  onBankReceiveResChange,
  onBankTrade,
  p2pOffer,
  p2pRequest,
  onP2pOfferChange,
  onP2pRequestChange,
  onProposeTrade
}) => {
  const t = TRANSLATIONS[locale];

  return (
    <>
      <div className="candidate-row" style={{ marginBottom: '0.9rem', padding: '0.85rem' }}>
        <h4 style={{ color: 'var(--accent-gold)', marginBottom: '0.6rem' }}>
          1. 🏦 {t.tradeBankTitle}
        </h4>
        {(() => {
          const ratio = getPlayerBankTradeRatio(gameState.board, activePlayer.id, bankGiveRes);
          const canAfford =
            activePlayer.resources[bankGiveRes] >= ratio &&
            bankGiveRes !== bankReceiveRes &&
            gameState.bank[bankReceiveRes] >= 1;

          return (
            <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: 'rgba(0,0,0,0.3)', padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)' }}>
                <ResourceIcon resource={bankGiveRes} height={48} />
                <select
                  value={bankGiveRes}
                  onChange={(e) => onBankGiveResChange(e.target.value as ResourceType)}
                  style={{ margin: 0, fontWeight: 600 }}
                >
                  {ALL_RESOURCES.map((r) => {
                    const rRatio = getPlayerBankTradeRatio(gameState.board, activePlayer.id, r);
                    return (
                      <option key={r} value={r}>
                        Oferă {rRatio}x {RESOURCE_LABELS[locale][r]} (ai {activePlayer.resources[r]})
                      </option>
                    );
                  })}
                </select>
              </div>
              <span style={{ fontSize: '1.4rem', color: 'var(--accent-gold)' }}>➔</span>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: 'rgba(0,0,0,0.3)', padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)' }}>
                <ResourceIcon resource={bankReceiveRes} height={48} />
                <select
                  value={bankReceiveRes}
                  onChange={(e) => onBankReceiveResChange(e.target.value as ResourceType)}
                  style={{ margin: 0, fontWeight: 600 }}
                >
                  {ALL_RESOURCES.map((r) => (
                    <option key={r} value={r}>
                      Primește 1x {RESOURCE_LABELS[locale][r]} (bancă: {gameState.bank[r]})
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canAfford}
                onClick={() => onBankTrade(bankGiveRes, ratio, bankReceiveRes)}
              >
                Schimbă cu Banca ({ratio}:1)
              </button>
            </div>
          );
        })()}

        {/* Port Quick-Trade Suggestions (e.g. 3 Wood + 2:1 Wood Port -> 1 Brick for Road) */}
        {(() => {
          const portRatioWood = getPlayerBankTradeRatio(gameState.board, activePlayer.id, 'wood');
          const portRatioBrick = getPlayerBankTradeRatio(gameState.board, activePlayer.id, 'brick');
          const portRatioOre = getPlayerBankTradeRatio(gameState.board, activePlayer.id, 'ore');
          const portRatioWheat = getPlayerBankTradeRatio(gameState.board, activePlayer.id, 'wheat');

          const suggestions: { label: string; give: ResourceType; giveAmount: number; receive: ResourceType }[] = [];

          // Road suggestion: 1 Wood + 1 Brick needed
          if (activePlayer.resources.wood >= portRatioWood + 1 && activePlayer.resources.brick === 0 && gameState.bank.brick >= 1) {
            suggestions.push({
              label: 'Ai Port la Lemn (' + portRatioWood + ':1) și ' + activePlayer.resources.wood + ' Lemn! Schimbă ' + portRatioWood + ' Lemn ➔ 1 Argilă pentru Drum',
              give: 'wood',
              giveAmount: portRatioWood,
              receive: 'brick'
            });
          } else if (activePlayer.resources.brick >= portRatioBrick + 1 && activePlayer.resources.wood === 0 && gameState.bank.wood >= 1) {
            suggestions.push({
              label: 'Ai Port la Argilă (' + portRatioBrick + ':1) și ' + activePlayer.resources.brick + ' Argilă! Schimbă ' + portRatioBrick + ' Argilă ➔ 1 Lemn pentru Drum',
              give: 'brick',
              giveAmount: portRatioBrick,
              receive: 'wood'
            });
          }

          // City suggestion: 3 Ore + 2 Wheat needed
          if (activePlayer.resources.ore >= portRatioOre + 3 && activePlayer.resources.wheat < 2 && gameState.bank.wheat >= 1) {
            suggestions.push({
              label: 'Schimbă ' + portRatioOre + ' Piatră ➔ 1 Grâu pentru Oraș',
              give: 'ore',
              giveAmount: portRatioOre,
              receive: 'wheat'
            });
          }

          if (suggestions.length === 0) return null;

          return (
            <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid var(--accent-gold)', borderRadius: 6, padding: '0.45rem 0.65rem', marginTop: '0.6rem' }}>
              <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--accent-gold)', marginBottom: 4 }}>
                ⚓ Sugestii Rapide de Schimb la Porturi:
              </div>
              {suggestions.map((sug, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <ResourceIcon resource={sug.give} height={36} />
                    <strong>{sug.giveAmount}x</strong>
                    <span>➔</span>
                    <ResourceIcon resource={sug.receive} height={36} />
                    <strong>1x</strong>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>({sug.label})</span>
                  </span>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ fontSize: '0.74rem', padding: '0.2rem 0.5rem' }}
                    onClick={() => onBankTrade(sug.give, sug.giveAmount, sug.receive)}
                  >
                    Schimbă Rapid la Port
                  </button>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      <div className="candidate-row" style={{ padding: '0.85rem' }}>
        <h4 style={{ color: 'var(--accent-gold)', marginBottom: '0.5rem' }}>
          2. 🤝 {t.tradeP2PTitle} (Expirare ofertă: {gameState.rules.tradeOfferTimeoutSec}s)
        </h4>
        {/* Own hand shown once, ahead of both columns below - it's context for both what you
            can offer and what you can afford, not just the offer side. */}
        <div style={{ marginBottom: '0.75rem' }}>
          <strong style={{ fontSize: '0.85rem' }}>Resursele tale:</strong>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            {ALL_RESOURCES.map((r) => (
              <ResourceCardSprite
                key={r}
                resource={r}
                count={activePlayer.resources[r]}
                locale={locale}
                size="xs"
              />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-4">
          <div>
            <strong style={{ fontSize: '0.85rem' }}>Oferi din mână:</strong>
            {ALL_RESOURCES.map((r) => (
              <div
                key={r}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 6,
                  padding: '4px 8px',
                  background: 'rgba(0,0,0,0.22)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8
                }}
              >
                <span style={{ fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <ResourceIcon resource={r} height={42} />
                  <strong>{RESOURCE_LABELS[locale][r]}</strong>
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    type="button"
                    className="btn"
                    style={{ padding: '0.2rem 0.55rem', fontWeight: 800 }}
                    onClick={() => onP2pOfferChange({ ...p2pOffer, [r]: Math.max(0, p2pOffer[r] - 1) })}
                  >
                    -
                  </button>
                  <span style={{ minWidth: 24, textAlign: 'center', fontWeight: 900, fontSize: '1.1rem', ...amountValueStyle(p2pOffer[r]) }}>
                    {p2pOffer[r]}
                  </span>
                  <button
                    type="button"
                    className="btn"
                    style={{ padding: '0.2rem 0.55rem', fontWeight: 800 }}
                    onClick={() =>
                      onP2pOfferChange({
                        ...p2pOffer,
                        [r]: Math.min(activePlayer.resources[r], p2pOffer[r] + 1)
                      })
                    }
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div>
            <strong style={{ fontSize: '0.85rem' }}>Ceri la schimb:</strong>
            {ALL_RESOURCES.map((r) => (
              <div
                key={r}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 6,
                  padding: '4px 8px',
                  background: 'rgba(0,0,0,0.22)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8
                }}
              >
                <span style={{ fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <ResourceIcon resource={r} height={42} />
                  <strong>{RESOURCE_LABELS[locale][r]}</strong>
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    type="button"
                    className="btn"
                    style={{ padding: '0.2rem 0.55rem', fontWeight: 800 }}
                    onClick={() => onP2pRequestChange({ ...p2pRequest, [r]: Math.max(0, p2pRequest[r] - 1) })}
                  >
                    -
                  </button>
                  <span style={{ minWidth: 24, textAlign: 'center', fontWeight: 900, fontSize: '1.1rem', ...amountValueStyle(p2pRequest[r]) }}>
                    {p2pRequest[r]}
                  </span>
                  <button
                    type="button"
                    className="btn"
                    style={{ padding: '0.2rem 0.55rem', fontWeight: 800 }}
                    onClick={() => onP2pRequestChange({ ...p2pRequest, [r]: p2pRequest[r] + 1 })}
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          style={{ marginTop: '0.65rem', width: '100%' }}
          disabled={totalResourceCount(p2pOffer) === 0 || totalResourceCount(p2pRequest) === 0}
          onClick={onProposeTrade}
        >
          Trimite Oferta de Schimb Jucătorilor
        </button>
      </div>
    </>
  );
};
