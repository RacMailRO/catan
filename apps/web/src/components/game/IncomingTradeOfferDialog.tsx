import React, { useEffect, useState } from 'react';
import { ALL_RESOURCES, ResourceCount, TradeOffer } from '@catan/core';
import { ResourceCardSprite, ResourceIcon } from '../GameAssets';
import { Locale, RESOURCE_LABELS } from '../../i18n';
import { Dialog } from '../ui/Dialog';

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
  /** Seconds left before automatic refusal (typically 30s countdown). */
  secondsRemaining?: number;
  /** Total countdown window in seconds (default 30). */
  totalSeconds?: number;
}

/** Body of the incoming-trade-offer Dialog: offered/requested summary, countdown progress
 *  timer, and the viewer's own hand with per-resource affordability badges. The accept/reject/
 *  counter buttons are the Dialog's `footer` prop, owned by App.tsx along with the rest of the wrapper. */
export const IncomingTradeOfferDialog: React.FC<IncomingTradeOfferDialogProps> = ({
  locale,
  offer,
  viewerResources,
  canAfford,
  secondsRemaining,
  totalSeconds = 30
}) => {
  return (
    <>
      {secondsRemaining !== undefined && (
        <div
          style={{
            marginBottom: '0.85rem',
            padding: '0.6rem 0.75rem',
            borderRadius: 8,
            background: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.35)'
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.8rem',
              fontWeight: 700,
              color: '#fbbf24',
              marginBottom: 6
            }}
          >
            <span>⏱️ {locale === 'ro' ? 'Timp de decizie rămas:' : 'Decision time left:'}</span>
            <span style={{ fontFamily: 'monospace', fontSize: '0.95rem' }}>{secondsRemaining}s</span>
          </div>
          <div
            style={{
              width: '100%',
              height: 6,
              background: 'rgba(0, 0, 0, 0.35)',
              borderRadius: 999,
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                width: `${Math.max(0, Math.min(100, (secondsRemaining / totalSeconds) * 100))}%`,
                height: '100%',
                background: secondsRemaining <= 5 ? '#ef4444' : '#f59e0b',
                transition: 'width 1s linear, background-color 0.3s ease',
                borderRadius: 999
              }}
            />
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 4 }}>
            {locale === 'ro'
              ? 'Dacă nu răspunzi în 30s, oferta se va refuza automat.'
              : 'Offer will be automatically declined in 30s.'}
          </div>
        </div>
      )}
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

export interface IncomingTradeOfferModalProps {
  incomingOffer: TradeOffer;
  proposerName: string;
  locale: Locale;
  viewerResources: ResourceCount;
  canAfford: boolean;
  onAccept: () => void;
  onReject: (reason: string) => void;
  onCounter: () => void;
}

export const IncomingTradeOfferModal: React.FC<IncomingTradeOfferModalProps> = ({
  incomingOffer,
  proposerName,
  locale,
  viewerResources,
  canAfford,
  onAccept,
  onReject,
  onCounter
}) => {
  const TOTAL_SECONDS = 30;
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() => {
    if (incomingOffer.expiresAtMs && incomingOffer.expiresAtMs > Date.now()) {
      return Math.max(1, Math.min(TOTAL_SECONDS, Math.round((incomingOffer.expiresAtMs - Date.now()) / 1000)));
    }
    return TOTAL_SECONDS;
  });
  const [rejectDropdownOpen, setRejectDropdownOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onReject(locale === 'ro' ? 'Timp expirat (30s)' : 'Time expired (30s)');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [incomingOffer.id, locale, onReject]);

  return (
    <Dialog
      open
      disableBackdropClick
      onClose={() => {}}
      title={`Ofertă de Schimb de la ${proposerName}`}
      footer={
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canAfford}
            onClick={onAccept}
          >
            ✅ Acceptă Schimbul
          </button>
          {/* Split Reject Button with Reason Dropdown */}
          <div style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle' }}>
            <button
              type="button"
              className="btn"
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
                borderColor: 'rgba(239, 68, 68, 0.5)',
                color: '#fca5a5',
                borderTopRightRadius: 0,
                borderBottomRightRadius: 0,
                borderRight: '1px solid rgba(239, 68, 68, 0.3)'
              }}
              onClick={() => onReject(locale === 'ro' ? 'Refuz' : 'Decline')}
              title={locale === 'ro' ? 'Refuză oferta (rapid)' : 'Reject offer (quick)'}
            >
              ❌ {locale === 'ro' ? 'Refuză' : 'Reject'}
            </button>
            <button
              type="button"
              className="btn"
              style={{
                background: 'rgba(239, 68, 68, 0.25)',
                borderColor: 'rgba(239, 68, 68, 0.5)',
                color: '#fca5a5',
                borderTopLeftRadius: 0,
                borderBottomLeftRadius: 0,
                padding: '0 0.55rem',
                fontSize: '0.82rem',
                fontWeight: 700
              }}
              onClick={(e) => {
                e.stopPropagation();
                setRejectDropdownOpen((curr) => !curr);
              }}
              title={locale === 'ro' ? 'Alege motivul refuzului' : 'Select reason for refusal'}
            >
              ▾
            </button>

            {rejectDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '115%',
                  right: 0,
                  zIndex: 120,
                  background: '#132337',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  borderRadius: 8,
                  padding: '6px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.7)',
                  minWidth: 220,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', padding: '2px 6px', fontWeight: 600 }}>
                  {locale === 'ro' ? 'Motivul refuzului:' : 'Reason for decline:'}
                </div>
                {[
                  { label: locale === 'ro' ? '🚫 Nu am resursa cerută' : '🚫 Missing requested resource', reason: 'Nu am resursa cerută' },
                  { label: locale === 'ro' ? '🔒 Nu pot să dau' : '🔒 Cannot give', reason: 'Nu pot să dau' },
                  { label: locale === 'ro' ? '❌ Refuz' : '❌ Just decline', reason: 'Refuz' },
                  { label: locale === 'ro' ? '⚖️ Prea scump' : '⚖️ Too expensive', reason: 'Prea scump' }
                ].map((item) => (
                  <button
                    key={item.reason}
                    type="button"
                    className="btn"
                    style={{
                      textAlign: 'left',
                      fontSize: '0.78rem',
                      padding: '0.35rem 0.6rem',
                      background: 'rgba(255, 255, 255, 0.05)',
                      borderColor: 'transparent',
                      color: '#e2e8f0',
                      justifyContent: 'flex-start',
                      width: '100%'
                    }}
                    onClick={() => {
                      setRejectDropdownOpen(false);
                      onReject(item.reason);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            className="btn"
            style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}
            onClick={onCounter}
          >
            🔄 Negociază / Contra-ofertă
          </button>
        </div>
      }
    >
      <IncomingTradeOfferDialog
        locale={locale}
        offer={incomingOffer}
        viewerResources={viewerResources}
        canAfford={canAfford}
        secondsRemaining={secondsRemaining}
        totalSeconds={TOTAL_SECONDS}
      />
    </Dialog>
  );
};
