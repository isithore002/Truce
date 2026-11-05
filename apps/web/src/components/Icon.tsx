const PATHS = {
  check: <path d="M4 10.5l3.5 3.5L16 5.5" />,
  x: <path d="M5 5l10 10M15 5L5 15" />,
  alert: <><path d="M10 3l8 14H2L10 3z" /><path d="M10 8v4M10 14.5v.5" /></>,
  info: <><circle cx="10" cy="10" r="7.5" /><path d="M10 9v5M10 6v.5" /></>,
  copy: <><rect x="7" y="7" width="9" height="9" rx="1.5" /><path d="M13 4H5.5A1.5 1.5 0 004 5.5V13" /></>,
  external: <><path d="M11 4h5v5M16 4l-7 7" /><path d="M14 12v3.5a.5.5 0 01-.5.5h-9a.5.5 0 01-.5-.5v-9a.5.5 0 01.5-.5H8" /></>,
  arrow: <path d="M4 10h12M11 5l5 5-5 5" />,
  menu: <path d="M3 6h14M3 10h14M3 14h14" />,
  wallet: <><rect x="2.5" y="5" width="15" height="11" rx="1.5" /><path d="M2.5 8h15M13 12h1.5" /></>,
  shield: <><path d="M10 2.5l6 2.5v4.5c0 4-2.6 6.8-6 8-3.4-1.2-6-4-6-8V5l6-2.5z" /><path d="M7 10l2 2 4-4" /></>,
  clock: <><circle cx="10" cy="10" r="7.5" /><path d="M10 6v4l2.5 2" /></>,
  download: <path d="M10 3v10M5.5 8.5L10 13l4.5-4.5M4 16.5h12" />,
  plus: <path d="M10 4v12M4 10h12" />,
  trash: <path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10" />,
  globe: <><circle cx="10" cy="10" r="7.5" /><path d="M2.5 10h15M10 2.5c2 2.2 3 4.7 3 7.5s-1 5.3-3 7.5c-2-2.2-3-4.7-3-7.5s1-5.3 3-7.5z" /></>,
  file: <><path d="M5 2.5h6.5L15 6v11.5H5z" /><path d="M11 2.5V6h4" /></>,
  key: <><circle cx="7" cy="12" r="3.5" /><path d="M9.5 9.5L16 3M13.5 5.5l2 2" /></>,
  refresh: <><path d="M16 4v4h-4" /><path d="M15.5 8A6 6 0 104 12" /></>,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size, className, label }: { name: IconName; size?: number; className?: string; label?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

export function Logo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="3" fill="currentColor" />
      <path d="M6.5 12.5l3.5 3.5 7.5-8" fill="none" stroke="var(--p-bg)" strokeWidth="2.4" strokeLinecap="square" />
    </svg>
  );
}
