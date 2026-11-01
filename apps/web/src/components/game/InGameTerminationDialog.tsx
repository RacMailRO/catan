import React from 'react';

export interface InGameTerminationDialogProps {
  /** Seconds remaining before the pending termination auto-confirms (turns red at ≤10s). */
  countdown: number;
}

/** Urgent alert shown to in-game human players when a spectator/lobby user has requested the
 *  match be terminated — explains the request and shows the response countdown. The Dialog's
 *  "Nu, continuă partida" / "Da, închide" footer buttons are owned by App.tsx; this is just the
 *  explanatory body. */
export const InGameTerminationDialog: React.FC<InGameTerminationDialogProps> = ({ countdown }) => {
  return (
    <>
      <p style={{ margin: 0, fontSize: '0.93rem', lineHeight: 1.5 }}>
        Cineva (un spectator sau un utilizator din lobby) a solicitat oprirea acestei partide. Ești de acord să fie închisă definitiv?
      </p>
      <div style={{ background: 'var(--bg-inset)', padding: '0.65rem 0.9rem', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0.9rem 0' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Timp rămas pentru răspuns:</span>
        <span style={{ fontWeight: 700, fontSize: '1.15rem', color: countdown <= 10 ? '#ef4444' : 'var(--accent-gold)' }}>
          ⏱️ {countdown}s
        </span>
      </div>
      <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
        * Dacă nimeni nu răspunde până la expirarea celor 30 de secunde, partida se va închide automat. Dacă alegi <strong>„Nu, continuă partida”</strong>, cererea este respinsă definitiv, iar butonul de oprire dispare pentru toată lumea.
      </p>
    </>
  );
};
