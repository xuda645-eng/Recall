export function MemoryPaperArt({ variant = 0, compact = false }: { variant?: number; compact?: boolean }): JSX.Element {
  return <svg className={`m-paper-art ${compact ? 'is-compact' : ''}`} viewBox="0 0 340 180" role="img" aria-label="书页与枝叶，慢慢积累的知识" data-variant={variant}>
    <ellipse cx="174" cy="158" rx="118" ry="6" fill="var(--paper-line)"/>
    <path d="M67 123h159v26H67z" fill="var(--paper-leaf)"/>
    <path d="M78 123v26m6-26v26" stroke="var(--paper-brand)" opacity=".35"/>
    <path d="M82 110h150v12H82z" fill="var(--paper-clay)"/>
    <g className="m-paper-art-book">
      <path d="m90 81 79-30 83 28-78 33z" fill="var(--card-paper)" stroke="var(--paper-brand)" strokeWidth="1.1"/>
      <path d="m174 112 78-33v12l-78 32-84-30V81" fill="var(--paper-sand)" stroke="var(--paper-brand)" strokeWidth="1.1"/>
      <path d="m117 77 49-17m-38 23 48-17m-22 25 43-15" stroke="var(--paper-line)" strokeWidth="2"/>
    </g>
    <g className="m-paper-art-branch">
      <path d="M260 143c-4-29-3-58 4-80m-3 57c-25-6-31-18-27-27 18 1 23 13 27 27m2-20c20-7 26-20 23-31-16 5-22 15-23 31m1-22c-16-6-21-16-17-25 13 2 17 11 17 25" fill="var(--paper-leaf)" stroke="var(--paper-brand)" strokeWidth="1.1"/>
    </g>
    <circle className="m-paper-art-sun" cx={variant === 1 ? 64 : 66} cy={variant === 2 ? 48 : 60} r={variant === 1 ? 22 : 17} fill="var(--paper-sand)"/>
    <path d="M43 159h247" stroke="var(--paper-brand)" strokeWidth="1" opacity=".4"/>
  </svg>;
}
