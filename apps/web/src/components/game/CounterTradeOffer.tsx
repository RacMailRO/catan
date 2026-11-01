import React from 'react';
import { ALL_RESOURCES, PlayerState, ResourceCount, TradeOffer, totalResourceCount } from '@catan/core';
import { ResourceCardSprite, ResourceIcon, amountValueStyle } from '../GameAssets';
import { Locale, RESOURCE_LABELS } from '../../i18n';

export interface CounterTradeOfferProps {
  /** Active UI locale, used for labels and bilingual copy. */
  locale: Locale;
  /** The still-open trade offer being countered. */
  originalOffer: TradeOffer;
  /** The responder building the counter-offer (not necessarily the active player). */
  viewerPlayer: PlayerState;
  /** Resources currently staged to offer in the counter-offer. */
  p2pOffer: ResourceCount;
  /** Resources currently staged to request in the counter-offer. */
  p2pRequest: ResourceCount;
  /** Replaces the staged offer amounts. */
  onP2pOfferChange: (next: ResourceCount) => void;
  /** Replaces the staged request amounts. */
  onP2pRequestChange: (next: ResourceCount) => void;
  /** Sends the counter-offer (rejects the original and opens the new one). */
  onSendCounterOffer: () => void;
}

/** Full offer-builder variant shown in the counter_trade AdaptiveSurface, letting a
 *  responder put their own terms on the table instead of a flat accept/reject. */
export const CounterTradeOffer: React.FC<CounterTradeOfferProps> = ({
  locale,
  originalOffer,
  viewerPlayer,
  p2pOffer,
  p2pRequest,
  onP2pOfferChange,
  onP2pRequestChange,
  onSendCounterOffer
}) => {
  return (
    <>
      <div
        style={{
          fontSize: '0.85rem',
          color: 'var(--text-muted)',
          marginBottom: '0.85rem',
          textAlign: 'center',
          background: 'rgba(0,0,0,0.25)',
          padding: '8px 12px',
          borderRadius: 8
        }}
      >
        {locale === 'ro' ? 'Oferta lor: oferă' : 'Their offer: offers'}{' '}
        {ALL_RESOURCES.filter((r) => originalOffer.offering[r] > 0).map((r) => (
          <span key={r} className="res-count" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, margin: '0 4px' }}>
            <ResourceIcon resource={r} height={34} />
            <strong style={{ fontSize: '1.1rem' }}>{originalOffer.offering[r]}</strong>
          </span>
        ))}{' '}
        · {locale === 'ro' ? 'cere' : 'asks'}{' '}
        {ALL_RESOURCES.filter((r) => originalOffer.requesting[r] > 0).map((r) => (
          <span key={r} className="res-count" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, margin: '0 4px' }}>
            <ResourceIcon resource={r} height={34} />
            <strong style={{ fontSize: '1.1rem' }}>{originalOffer.requesting[r]}</strong>
          </span>
        ))}
        {' — '}
        {locale === 'ro'
          ? 'alege mai jos ce vrei TU să oferi/ceri în loc:'
          : 'pick what YOU want to offer/ask instead below:'}
      </div>
      {/* Own hand shown once, ahead of both columns below. */}
      <div style={{ marginBottom: '0.75rem' }}>
        <strong style={{ fontSize: '0.85rem' }}>
          {locale === 'ro' ? 'Resursele tale:' : 'Your resources:'}
        </strong>
        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          {ALL_RESOURCES.map((r) => (
            <ResourceCardSprite
              key={r}
              resource={r}
              count={viewerPlayer.resources[r]}
              locale={locale}
              size="xs"
            />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-4">
        <div>
          <strong style={{ fontSize: '0.85rem' }}>
            {locale === 'ro' ? 'Oferi din mână:' : 'You offer:'}
          </strong>
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
                      [r]: Math.min(viewerPlayer.resources[r], p2pOffer[r] + 1)
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
          <strong style={{ fontSize: '0.85rem' }}>
            {locale === 'ro' ? 'Ceri la schimb:' : 'You ask for:'}
          </strong>
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
        style={{ marginTop: '0.75rem', width: '100%' }}
        disabled={totalResourceCount(p2pOffer) === 0 || totalResourceCount(p2pRequest) === 0}
        onClick={onSendCounterOffer}
      >
        {locale === 'ro' ? 'Trimite Contra-oferta' : 'Send Counter-offer'}
      </button>
    </>
  );
};
