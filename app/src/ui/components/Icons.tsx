/** Íconos propios (trazo grueso, coherentes con la identidad geométrica). */
const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const IconTarget = ({ size = 40 }: { size?: number }) => (
  <svg viewBox="0 0 32 32" width={size} height={size} {...base}>
    <circle cx="16" cy="16" r="12" />
    <circle cx="16" cy="16" r="6" />
    <circle cx="16" cy="16" r="1.2" fill="currentColor" />
  </svg>
);
export const IconStopwatch = ({ size = 40 }: { size?: number }) => (
  <svg viewBox="0 0 32 32" width={size} height={size} {...base}>
    <circle cx="16" cy="18" r="11" />
    <path d="M16 18V11M13 3h6M25 8l2-2" />
  </svg>
);
export const IconCube = ({ size = 40 }: { size?: number }) => (
  <svg viewBox="0 0 32 32" width={size} height={size} {...base}>
    <path d="M16 3 28 9.5v13L16 29 4 22.5v-13z" />
    <path d="M4 9.5 16 16l12-6.5M16 16v13" />
  </svg>
);
export const IconBolt = ({ size = 40 }: { size?: number }) => (
  <svg viewBox="0 0 32 32" width={size} height={size} {...base}>
    <path d="M18 3 6 18h9l-2 11 13-16h-9z" />
  </svg>
);
export const IconTrophy = ({ size = 28 }: { size?: number }) => (
  <svg viewBox="0 0 32 32" width={size} height={size} {...base}>
    <path d="M10 4h12v8a6 6 0 0 1-12 0zM10 7H5a4 4 0 0 0 5 5M22 7h5a4 4 0 0 1-5 5M16 18v5M11 28h10M12 23h8v5h-8z" />
  </svg>
);
export const IconGear = ({ size = 28 }: { size?: number }) => (
  <svg viewBox="0 0 32 32" width={size} height={size} {...base}>
    <circle cx="16" cy="16" r="4.5" />
    <path d="M16 3v4M16 25v4M3 16h4M25 16h4M6.8 6.8l2.8 2.8M22.4 22.4l2.8 2.8M6.8 25.2l2.8-2.8M22.4 9.6l2.8-2.8" />
  </svg>
);
export const IconBack = ({ size = 24 }: { size?: number }) => (
  <svg viewBox="0 0 32 32" width={size} height={size} {...base}>
    <path d="M19 6 9 16l10 10" />
  </svg>
);
export const IconPlay = ({ size = 36 }: { size?: number }) => (
  <svg viewBox="0 0 32 32" width={size} height={size}>
    <path d="M9 5.5v21a1.5 1.5 0 0 0 2.3 1.3l17-10.5a1.5 1.5 0 0 0 0-2.6l-17-10.5A1.5 1.5 0 0 0 9 5.5z" fill="currentColor" />
  </svg>
);
export const IconReplay = ({ size = 30 }: { size?: number }) => (
  <svg viewBox="0 0 32 32" width={size} height={size} {...base}>
    <path d="M6 16a10 10 0 1 0 3-7.1M6 4v5h5" />
  </svg>
);
