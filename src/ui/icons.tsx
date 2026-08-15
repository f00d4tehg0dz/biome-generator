// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Adrian Chrysanthou
/**
 * Inline icons. Drawn here rather than pulled from a set: the app ships no network calls at
 * runtime, and six glyphs are not worth a dependency.
 */

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function Svg({ size = 20, children }: { size?: number; children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}

/** The app mark: a hexagon, filled. */
export function MarkIcon() {
  return (
    <Svg size={20}>
      <path d="M12 2.8 19.6 7.2v9.6L12 21.2 4.4 16.8V7.2z" fill="currentColor" />
    </Svg>
  );
}

export function DesignIcon() {
  return (
    <Svg>
      <path d="M12 3.2 19.4 7.4v9.2L12 20.8 4.6 16.6V7.4z" {...stroke} />
      <path d="M12 3.2v17.6M4.6 7.4 12 11.6l7.4-4.2" {...stroke} opacity={0.45} />
    </Svg>
  );
}

export function ColoursIcon() {
  return (
    <Svg>
      <circle cx="9.2" cy="9.4" r="4.3" {...stroke} />
      <circle cx="14.8" cy="9.4" r="4.3" {...stroke} />
      <circle cx="12" cy="14.8" r="4.3" {...stroke} />
    </Svg>
  );
}

export function ExportIcon() {
  return (
    <Svg>
      <path d="M12 3.4v10.4m0 0 3.8-3.8M12 13.8 8.2 10" {...stroke} />
      <path d="M4.4 16.2v2.6c0 .9.7 1.6 1.6 1.6h12c.9 0 1.6-.7 1.6-1.6v-2.6" {...stroke} />
    </Svg>
  );
}

export function RerollIcon() {
  return (
    <Svg size={15}>
      <path d="M19.4 12a7.4 7.4 0 1 1-2.2-5.3" {...stroke} />
      <path d="M19.6 3.6v3.8h-3.8" {...stroke} />
    </Svg>
  );
}

export function UndoIcon() {
  return (
    <Svg size={15}>
      <path d="M5 9.4h9.6a4.6 4.6 0 0 1 0 9.2H8.4" {...stroke} />
      <path d="M8.4 5.4 4.4 9.4l4 4" {...stroke} />
    </Svg>
  );
}

export function RedoIcon() {
  return (
    <Svg size={15}>
      <path d="M19 9.4H9.4a4.6 4.6 0 0 0 0 9.2h6.2" {...stroke} />
      <path d="M15.6 5.4l4 4-4 4" {...stroke} />
    </Svg>
  );
}

export function LinkIcon() {
  return (
    <Svg size={15}>
      <path d="M10.4 13.6a3.6 3.6 0 0 0 5.2 0l2.8-2.8a3.7 3.7 0 0 0-5.2-5.2l-1.4 1.4" {...stroke} />
      <path d="M13.6 10.4a3.6 3.6 0 0 0-5.2 0l-2.8 2.8a3.7 3.7 0 0 0 5.2 5.2l1.4-1.4" {...stroke} />
    </Svg>
  );
}

export function SourceIcon() {
  return (
    <Svg size={17}>
      <path d="M14.4 4.2h5.4v5.4M19.8 4.2 11.6 12.4" {...stroke} />
      <path d="M17.4 14v4.6c0 .9-.7 1.6-1.6 1.6H5.4c-.9 0-1.6-.7-1.6-1.6V8.2c0-.9.7-1.6 1.6-1.6H10" {...stroke} />
    </Svg>
  );
}
