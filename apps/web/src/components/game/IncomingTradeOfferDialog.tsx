import React from 'react';
import { ALL_RESOURCES, ResourceCount, TradeOffer } from '@catan/core';
import { ResourceCardSprite, ResourceIcon } from '../GameAssets';
import { Locale, RESOURCE_LABELS } from '../../i18n';

export interface IncomingTradeOfferDialogProps {
  /** Active UI locale, used for labels and bilingual copy. */
  locale: Locale;
  /** The open incoming trade offer being shown (accept/reject/counter). */
  offer: TradeOffer;
  /** The viewer's own resources, used for the hand display and the affordability check. */
  viewerResources: ResourceCount;
  /** Whether the viewer currently holds everything the offer requests (gates the accept
   *  button, which lives in App.tsx's Dialog `footer` prop alongside reject/counter). */
  canAfford: boolean;
}

/** Body of the incoming-trade-offer Dialog: offered/requested summary and the viewer's own
 *  hand with per-resource affordability badges. The accept/reject/counter buttons are the
 *  Dialog's `footer` prop, owned by App.tsx along with the rest of the wrapper. */
export const IncomingTradeOfferDialog: React.FC<IncomingTradeOfferDialogProps> = ({
  locale,
  offer,
  viewerResources,
  canAfford
}) => {
  return (
    <>
      {!canAfford && (
        <span
          style={{
            background: 'rgba(239, 68, 68, 0.2)',
            color: '#f87171',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            padding: '2px 8px',
            borderRadius: 12,
            fontSize: '0.78rem',
            fontWeight: 700,
            display: 'inline-block',
            marginBottom: '0.6rem'
          }}
        >
          ⚠️ Resurse insuficiente
        </span>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.85rem',
          marginBottom: '1rem'
        }}
      >
        <div
          style={{
            background: 'rgba(34, 197, 94, 0.12)',
            padding: '0.6rem',
            borderRadius: 8,
            border: '1px solid rgba(34, 197, 94, 0.3)'
          }}
        >
          <h4 style={{ color: '#4ade80', fontSize: '0.84rem', margin: '0 0 0.4rem 0' }}>
            Primești (îți oferă):
          </h4>
          {ALL_RESOURCES.filter((r) => offer.offering[r] > 0).map((r) => (
            <div key={r} style={{ fontSize: '0.84rem', fontWeight: 600, marginTop: 2 }}>
              <ResourceIcon resource={r} /> {offer.offering[r]}x {RESOURCE_LABELS[locale][r]}
            </div>
          ))}
        </div>
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.12)',
            padding: '0.6rem',
            borderRadius: 8,
            border: '1px solid rgba(239, 68, 68, 0.3)'
          }}
        >
          <h4 style={{ color: '#f87171', fontSize: '0.84rem', margin: '0 0 0.4rem 0' }}>
            Dai (îți cere):
          </h4>
          {ALL_RESOURCES.filter((r) => offer.requesting[r] > 0).map((r) => (
            <div key={r} style={{ fontSize: '0.84rem', fontWeight: 600, marginTop: 2 }}>
              <ResourceIcon resource={r} /> {offer.requesting[r]}x {RESOURCE_LABELS[locale][r]}
            </div>
          ))}
        </div>
      </div>

      {/* Resursele din mână ale jucătorului receptor */}
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: 8,
          padding: '0.6rem 0.65rem',
          marginBottom: '0.85rem'
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.45rem'
          }}
        >
          <h4 style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
            {locale === 'ro' ? '🃏 Cărțile tale în mână:' : '🃏 Your cards in hand:'}
          </h4>
          <span style={{ fontSize: '0.78rem', opacity: 0.75 }}>
            {Object.values(viewerResources).reduce((a, b) => a + b, 0)}{' '}
            {locale === 'ro' ? 'cărți în total' : 'cards total'}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 6,
            justifyContent: 'center',
            flexWrap: 'wrap'
          }}
        >
          {ALL_RESOURCES.map((r) => {
            const count = viewerResources[r] ?? 0;
            const req = offer.requesting[r] ?? 0;
            const off = offer.offering[r] ?? 0;
            const isRequested = req > 0;
            const isOffered = off > 0;
            const hasEnough = count >= req;

            return (
              <div
                key={r}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  position: 'relative'
                }}
              >
                <ResourceCardSprite
                  resource={r}
                  count={count}
                  locale={locale}
                  size="sm"
                  selected={isRequested}
                />
                {isRequested && (
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      marginTop: 3,
                      padding: '1px 4px',
                      borderRadius: 4,
                      background: hasEnough
                        ? 'rgba(34, 197, 94, 0.22)'
                        : 'rgba(239, 68, 68, 0.25)',
                      color: hasEnough ? '#4ade80' : '#f87171',
                      border: `1px solid ${hasEnough ? 'rgba(34, 197, 94, 0.45)' : 'rgba(239, 68, 68, 0.5)'}`,
                      whiteSpace: 'nowrap'
                    }}
                    title={hasEnough ? `Deții ${count} din ${req} cerute` : `Îți lipsesc ${req - count} resurse`}
                  >
                    {hasEnough ? (req === 1 ? 'cere 1' : `cere ${req}`) : `lipsesc ${req - count}`}
                  </span>
                )}
                {isOffered && !isRequested && (
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      marginTop: 3,
                      padding: '1px 4px',
                      borderRadius: 4,
                      background: 'rgba(59, 130, 246, 0.2)',
                      color: '#60a5fa',
                      border: '1px solid rgba(59, 130, 246, 0.4)',
                      whiteSpace: 'nowrap'
                    }}
                    title={`Vei primi +${off}`}
                  >
                    +{off}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {!canAfford && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: 8,
            padding: '0.6rem 0.75rem',
            textAlign: 'center',
            marginBottom: '0.85rem'
          }}
        >
          <div
            style={{
              color: '#f87171',
              fontSize: '0.84rem',
              fontWeight: 700,
              marginBottom: 4
            }}
          >
            ⚠️ Nu ai în mână toate resursele cerute pentru a accepta acest schimb.
          </div>
        </div>
      )}
    </>
  );
};
