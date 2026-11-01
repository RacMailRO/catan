import React, { useEffect, useMemo, useState } from 'react';
import { DevCardType, PlayerColor, ResourceType } from '@catan/core';
import { DEV_CARD_LABELS, DEV_CARD_SHORT_LABELS, Locale, RESOURCE_LABELS } from '../i18n';

// Readable text color on top of each player's own board color as a filled badge background -
// 'blue'/'green'/'red'/'brown' are dark enough for white text, 'orange'/'white' need black
// instead (plain colored text on the app's own dark background was too low contrast to read at
// a glance - a blue name on navy panels in particular).
export const PLAYER_BADGE_TEXT_COLOR: Record<PlayerColor, string> = {
  red: '#ffffff',
  blue: '#ffffff',
  green: '#ffffff',
  brown: '#ffffff',
  orange: '#1a1206',
  white: '#1a1206'
};

// Shared "player name as a filled badge" style - used anywhere a player's name needs to be
// identifiable by board color at a glance (trade banners/modals, rejection lists, the AI
// Decision Inspector...) without the low-contrast "colored text on a dark panel" problem plain
// `color: p.color` text had.
export function playerBadgeStyle(color?: PlayerColor): React.CSSProperties {
  return color
    ? {
        display: 'inline-block',
        background: color,
        color: PLAYER_BADGE_TEXT_COLOR[color],
        fontWeight: 700,
        padding: '1px 7px',
        borderRadius: 999,
        fontSize: '0.92em'
      }
    : { fontWeight: 700 };
}

// Small colored dot instead of a filled badge - for dense lists (the event log) where a full
// badge per row, per player, reads as too much saturated color at once. Pair with a `title`
// attribute on the wrapping element for the player's name as a hover tooltip.
export function playerDotStyle(color?: PlayerColor): React.CSSProperties {
  return {
    display: 'inline-block',
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: color ?? 'var(--text-muted)',
    border: '1px solid rgba(255,255,255,0.35)',
    flexShrink: 0
  };
}

// Shared "value the player can currently change" rule for every +/- resource stepper: zero
// (nothing staged yet) is muted, a non-zero/changed value is full-contrast - both theme-aware
// via the existing --text-muted/--text-main tokens, so it reads correctly in every theme.
export function amountValueStyle(value: number): React.CSSProperties {
  return { color: value > 0 ? 'var(--text-main)' : 'var(--text-muted)' };
}

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

/**
 * Small picture of a resource (cropped from the same card sprite used for the player's hand)
 * - used instead of the emoji icons in trades, notifications, bank, etc. so a resource looks
 * the same everywhere in the game and is easy to recognise at a glance.
 */
export const ResourceIcon: React.FC<{ resource: ResourceType; height?: number; locale?: Locale }> = ({
  resource,
  height = 20,
  locale = 'ro'
}) => {
  const pos = RESOURCE_CARD_SPRITE_POS[resource];
  // One sprite cell is 322x500 px (1612x2000 / 5x4 grid).
  const width = Math.round(height * 0.645);
  return (
    <span
      className="resource-icon"
      title={RESOURCE_LABELS[locale][resource]}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        width,
        height,
        margin: '0 2px',
        borderRadius: height > 30 ? 5 : 3,
        backgroundImage: 'url("/cards.jpg")',
        backgroundSize: '500% 400%',
        backgroundPosition: `${pos.x} ${pos.y}`,
        boxShadow: height > 30 ? '0 3px 8px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.15)' : '0 0 0 1px rgba(0,0,0,0.55)'
      }}
    />
  );
};

/**
 * Turns "{{res:wood}}" tokens inside a plain notification string into ResourceIcon images,
 * so strings built with template literals can still show pictures instead of emoji.
 */
export function renderResourceTokens(text: string): React.ReactNode {
  const parts = text.split(/\{\{res:(wood|brick|sheep|wheat|ore)\}\}/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? <ResourceIcon key={i} resource={part as ResourceType} /> : <React.Fragment key={i}>{part}</React.Fragment>
  );
}
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
      className={`sprite-card sprite-card-${size} ${selected ? 'selected' : ''} ${count === 0 ? 'empty-card' : ''}`}
      onClick={onClick}
      title={`${RESOURCE_LABELS[locale][resource]}: ${count}`}
      style={{
        width: dimensions.width,
        height: dimensions.height,
        // Reserves room for the count badge below the card (see .sprite-card-count), as part
        // of the card's own box so normal document flow pushes whatever comes after it down -
        // a caller that forgets this can no longer let the badge get obscured by content below.
        marginBottom: 22,
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

  // The full descriptive label (e.g. "Progres: Anul Abundenței") reads as blank once CSS
  // ellipsis cuts it down to 3-4 characters at these card widths — show the short form
  // instead, keeping the full one as the hover tooltip.
  const fullLabel = type === 'back' ? 'Catan' : DEV_CARD_LABELS[locale][type];
  const label = type === 'back' ? 'Catan' : DEV_CARD_SHORT_LABELS[locale][type];

  return (
    <div
      className={`dev-card-wrapper ${canPlay ? 'playable' : ''}`}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
    >
      <div
        className={`sprite-card ${canPlay ? 'selected' : ''}`}
        onClick={canPlay && onPlay ? onPlay : undefined}
        title={fullLabel}
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
        <span className={`sprite-card-label ${size === 'xs' ? 'sprite-card-label-xs' : ''}`}>{label}</span>
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
  /** false (replay viewer) shows die1/die2 immediately, as they actually landed, with no spin -
   * scrubbing to a step should show what was rolled right then, not replay a roll animation
   * that implies this is happening live. Defaults to true for live gameplay. */
  animate?: boolean;
}

export const AnimatedDiceWidget: React.FC<AnimatedDiceWidgetProps> = ({
  die1,
  die2,
  total,
  turn,
  rollTriggerKey,
  canRoll = false,
  onRollClick,
  locale,
  animate = true
}) => {
  const [isRolling, setIsRolling] = useState(false);
  const [displayDie1, setDisplayDie1] = useState<number>(die1 ?? 3);
  const [displayDie2, setDisplayDie2] = useState<number>(die2 ?? 4);

  useEffect(() => {
    if (die1 === undefined || die2 === undefined) return;

    if (!animate) {
      setDisplayDie1(die1);
      setDisplayDie2(die2);
      setIsRolling(false);
      return;
    }

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
  }, [rollTriggerKey, die1, die2, turn, animate]);

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

const CONFETTI_COLORS = ['#f59e0b', '#ef4444', '#22c55e', '#3b82f6', '#a855f7', '#facc15', '#ec4899', '#14b8a6'];

export interface ConfettiProps {
  pieceCount?: number;
}

/**
 * One-shot confetti burst for the game-over celebration - pure CSS (no animation library),
 * pointer-events: none throughout so it never blocks clicking the modal buttons underneath it.
 * Each piece gets a random column, color, size, fall duration/delay and drift/rotation via CSS
 * custom properties so the single shared @keyframes in styles.css can animate them all.
 */
export const Confetti: React.FC<ConfettiProps> = ({ pieceCount = 90 }) => {
  const pieces = useMemo(
    () =>
      Array.from({ length: pieceCount }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
        delay: Math.random() * 1.1,
        duration: 2.6 + Math.random() * 2,
        rotation: 180 + Math.random() * 540,
        drift: (Math.random() - 0.5) * 220,
        width: 6 + Math.random() * 6,
        round: Math.random() > 0.5
      })),
    [pieceCount]
  );

  return (
    <div className="confetti-overlay" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={
            {
              left: `${p.left}%`,
              width: p.width,
              height: p.width * 0.42,
              background: p.color,
              borderRadius: p.round ? '50%' : '2px',
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              '--confetti-rotate': `${p.rotation}deg`,
              '--confetti-drift': `${p.drift}px`
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
};
