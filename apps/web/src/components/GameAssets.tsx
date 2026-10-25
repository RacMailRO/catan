import React, { useEffect, useState } from 'react';
import { DevCardType, ResourceType } from '@catan/core';
import { DEV_CARD_LABELS, Locale, RESOURCE_LABELS } from '../i18n';

/**
 * Exact sprite coordinates in /cards.jpg (1612x2000, 5 columns x 4 rows).
 * For a 5x4 grid, CSS background-size is '500% 400%'.
 * Column percentages: col 0 = 0%, col 1 = 25%, col 2 = 50%, col 3 = 75%, col 4 = 100%.
 * Row percentages: row 0 = 0%, row 1 = 33.3333%, row 2 = 66.6667%, row 3 = 100%.
 */
export const RESOURCE_CARD_SPRITE_POS: Record<ResourceType, { x: string; y: string }> = {
  wheat: { x: '0%', y: '0%' },
  brick: { x: '25%', y: '0%' },
  wood: { x: '50%', y: '0%' },
  ore: { x: '75%', y: '0%' },
  sheep: { x: '100%', y: '0%' }
};

export const DEV_CARD_SPRITE_POS: Record<DevCardType | 'back', { x: string; y: string }> = {
  road_building: { x: '0%', y: '33.3333%' },
  knight: { x: '25%', y: '33.3333%' },
  year_of_plenty: { x: '50%', y: '33.3333%' },
  victory_point: { x: '75%', y: '33.3333%' },
  monopoly: { x: '25%', y: '66.6667%' },
  back: { x: '100%', y: '66.6667%' }
};

export interface ResourceCardSpriteProps {
  resource: ResourceType;
  count: number;
  locale: Locale;
  size?: 'xs' | 'sm' | 'md';
  onClick?: () => void;
  selected?: boolean;
}

export const ResourceCardSprite: React.FC<ResourceCardSpriteProps> = ({
  resource,
  count,
  locale,
  size = 'md',
  onClick,
  selected = false
}) => {
  const pos = RESOURCE_CARD_SPRITE_POS[resource];
  const dimensions =
    size === 'xs'
      ? { width: 38, height: 56 }
      : size === 'sm'
      ? { width: 50, height: 74 }
      : { width: 64, height: 96 };

  return (
    <div
      className={`sprite-card ${selected ? 'selected' : ''} ${count === 0 ? 'empty-card' : ''}`}
      onClick={onClick}
      title={`${RESOURCE_LABELS[locale][resource]}: ${count}`}
      style={{
        width: dimensions.width,
        height: dimensions.height,
        backgroundImage: 'url("/cards.jpg")',
        backgroundSize: '500% 400%',
        backgroundPosition: `${pos.x} ${pos.y}`,
        cursor: onClick ? 'pointer' : 'default'
      }}
    >
      <span className={`sprite-card-count ${count > 0 ? 'has-items' : ''}`}>{count}</span>
      {size !== 'xs' && (
        <span className="sprite-card-label">{RESOURCE_LABELS[locale][resource]}</span>
      )}
    </div>
  );
};

export interface DevCardSpriteProps {
  type: DevCardType | 'back';
  locale: Locale;
  count?: number;
  isNew?: boolean;
  canPlay?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  onPlay?: () => void;
  actionLabel?: string;
}

export const DevCardSprite: React.FC<DevCardSpriteProps> = ({
  type,
  locale,
  count,
  isNew = false,
  canPlay = false,
  size = 'md',
  onPlay,
  actionLabel
}) => {
  const pos = DEV_CARD_SPRITE_POS[type];
  const dimensions =
    size === 'xs'
      ? { width: 38, height: 56 }
      : size === 'sm'
      ? { width: 50, height: 74 }
      : size === 'md'
      ? { width: 84, height: 126 }
      : { width: 108, height: 162 };

  const label = type === 'back' ? 'Catan' : DEV_CARD_LABELS[locale][type];

  return (
    <div
      className={`dev-card-wrapper ${canPlay ? 'playable' : ''}`}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
    >
      <div
        className={`sprite-card ${canPlay ? 'selected' : ''}`}
        onClick={canPlay && onPlay ? onPlay : undefined}
        title={label}
        style={{
          width: dimensions.width,
          height: dimensions.height,
          backgroundImage: 'url("/cards.jpg")',
          backgroundSize: '500% 400%',
          backgroundPosition: `${pos.x} ${pos.y}`,
          cursor: canPlay && onPlay ? 'pointer' : 'default'
        }}
      >
        {count !== undefined && (
          <span className="sprite-card-count has-items">x{count}</span>
        )}
        {isNew && (
          <span
            style={{
              position: 'absolute',
              top: 4,
              left: 4,
              background: 'rgba(15, 23, 42, 0.88)',
              color: '#facc15',
              fontSize: '0.62rem',
              padding: '1px 5px',
              borderRadius: 4,
              fontWeight: 700,
              border: '1px solid #facc15'
            }}
          >
            {locale === 'ro' ? 'NOUĂ' : 'NEW'}
          </span>
        )}
        <span className="sprite-card-label">{label}</span>
      </div>

      {canPlay && onPlay && (
        <button
          type="button"
          className="btn btn-primary"
          style={{ padding: '0.25rem 0.55rem', fontSize: '0.74rem', width: '100%' }}
          onClick={onPlay}
        >
          {actionLabel ?? (locale === 'ro' ? 'Joacă' : 'Play')}
        </button>
      )}
    </div>
  );
};

const PIP_COORDS: Record<number, Array<[number, number]>> = {
  1: [[24, 24]],
  2: [
    [13, 13],
    [35, 35]
  ],
  3: [
    [12, 12],
    [24, 24],
    [36, 36]
  ],
  4: [
    [13, 13],
    [35, 13],
    [13, 35],
    [35, 35]
  ],
  5: [
    [12, 12],
    [36, 12],
    [24, 24],
    [12, 36],
    [36, 36]
  ],
  6: [
    [13, 11],
    [35, 11],
    [13, 24],
    [35, 24],
    [13, 37],
    [35, 37]
  ]
};

const DieFaceSvg: React.FC<{ value: number; isRolling: boolean; accentRed?: boolean }> = ({
  value,
  isRolling,
  accentRed = false
}) => {
  const pips = PIP_COORDS[value] ?? PIP_COORDS[1]!;
  return (
    <svg
      width={44}
      height={44}
      viewBox="0 0 48 48"
      className={isRolling ? 'die-rolling-anim' : 'die-settled-anim'}
      style={{
        filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.55))',
        flexShrink: 0
      }}
    >
      <defs>
        <linearGradient id={accentRed ? 'dieGradRed' : 'dieGradIvory'} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={accentRed ? '#dc2626' : '#fffbeb'} />
          <stop offset="100%" stopColor={accentRed ? '#991b1b' : '#fde68a'} />
        </linearGradient>
      </defs>
      <rect
        x={2}
        y={2}
        width={44}
        height={44}
        rx={9}
        fill={`url(#${accentRed ? 'dieGradRed' : 'dieGradIvory'})`}
        stroke={accentRed ? '#fca5a5' : '#b45309'}
        strokeWidth={2.5}
      />
      {pips.map(([cx, cy], idx) => (
        <circle
          key={idx}
          cx={cx}
          cy={cy}
          r={4.2}
          fill={accentRed ? '#fef08a' : value === 6 || value === 1 ? '#dc2626' : '#1e293b'}
        />
      ))}
    </svg>
  );
};

export interface AnimatedDiceWidgetProps {
  die1?: number;
  die2?: number;
  total?: number;
  turn: number;
  rollTriggerKey: string;
  canRoll?: boolean;
  onRollClick?: () => void;
  locale: Locale;
}

export const AnimatedDiceWidget: React.FC<AnimatedDiceWidgetProps> = ({
  die1,
  die2,
  total,
  turn,
  rollTriggerKey,
  canRoll = false,
  onRollClick,
  locale
}) => {
  const [isRolling, setIsRolling] = useState(false);
  const [displayDie1, setDisplayDie1] = useState<number>(die1 ?? 3);
  const [displayDie2, setDisplayDie2] = useState<number>(die2 ?? 4);

  useEffect(() => {
    if (die1 === undefined || die2 === undefined) return;
    setIsRolling(true);

    let tick = 0;
    const interval = setInterval(() => {
      tick++;
      setDisplayDie1(((tick * 3 + turn) % 6) + 1);
      setDisplayDie2(((tick * 5 + turn) % 6) + 1);
    }, 65);

    const timeout = setTimeout(() => {
      clearInterval(interval);
      setDisplayDie1(die1);
      setDisplayDie2(die2);
      setIsRolling(false);
    }, 520);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [rollTriggerKey, die1, die2, turn]);

  const isSeven = total === 7 && !isRolling;

  return (
    <div
      className={`dice-widget-box ${isRolling ? 'rolling' : ''} ${canRoll ? 'can-roll-pulse' : ''}`}
      onClick={canRoll && onRollClick ? onRollClick : undefined}
      style={{ cursor: canRoll ? 'pointer' : 'default' }}
      title={canRoll ? (locale === 'ro' ? 'Apasă pentru a da cu zarul!' : 'Click to roll dice!') : undefined}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <DieFaceSvg value={displayDie1} isRolling={isRolling} accentRed={false} />
        <DieFaceSvg value={displayDie2} isRolling={isRolling} accentRed={true} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 78 }}>
        {isRolling ? (
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-gold)' }}>
            🎲 {locale === 'ro' ? 'Se învârt...' : 'Rolling...'}
          </span>
        ) : total !== undefined ? (
          <>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              {locale === 'ro' ? `Zar Tura ${turn}` : `Turn ${turn} Roll`}
            </span>
            <span
              style={{
                fontSize: '1.05rem',
                fontWeight: 800,
                color: isSeven ? '#ef4444' : total === 6 || total === 8 ? '#f59e0b' : '#38bdf8'
              }}
            >
              {die1} + {die2} = {total} {isSeven ? '🥷' : ''}
            </span>
          </>
        ) : (
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {locale === 'ro' ? 'Așteptare zar' : 'Waiting roll'}
          </span>
        )}

        {canRoll && onRollClick && (
          <button
            type="button"
            className="btn btn-primary"
            style={{ padding: '2px 8px', fontSize: '0.74rem', marginTop: 3 }}
            onClick={(e) => {
              e.stopPropagation();
              onRollClick();
            }}
          >
            🎲 {locale === 'ro' ? 'Dă cu zarul!' : 'Roll Dice!'}
          </button>
        )}
      </div>
    </div>
  );
};
