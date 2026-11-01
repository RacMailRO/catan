import React from 'react';

export interface ReleaseNoteEntry {
  hash: string;
  date: string;
  message: string;
}

export interface ReleaseNotesProps {
  /** Number of commits the running build is ahead of the project's first commit. */
  commitCount: number;
  /** Short hash of the currently deployed HEAD commit. */
  shortHash: string;
  /** Recent commit log entries to list, newest first. */
  releaseNotes: ReleaseNoteEntry[];
}

/** Commit-log release notes, read live from the server's /api/version endpoint and opened by
 *  clicking the version badge in the header. Available from any tab, not just in-game. */
export const ReleaseNotes: React.FC<ReleaseNotesProps> = ({ commitCount, shortHash, releaseNotes }) => {
  return (
    <>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 0 }}>
        {commitCount} commit-uri · HEAD <code>{shortHash}</code>
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {releaseNotes.map((note) => (
          <li
            key={note.hash}
            style={{
              borderBottom: '1px solid var(--border-color)',
              paddingBottom: '0.5rem',
              fontSize: '0.84rem'
            }}
          >
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
              <code style={{ color: 'var(--accent-gold)', fontSize: '0.74rem' }}>{note.hash}</code>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{note.date}</span>
            </div>
            <div>{note.message}</div>
          </li>
        ))}
      </ul>
    </>
  );
};
