import type { CSSProperties } from 'react'

/** Icônes au trait, dessinées pour Minion (24×24, trait 1.6). */
const PATHS: Record<string, string> = {
  home: 'M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z',
  inbox: 'M4 13h4.5l1.5 2.5h4l1.5-2.5H20M5.5 5h13L20 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6z',
  book: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5m0-15v15m0 0A1.5 1.5 0 0 0 6.5 21H19v-3',
  scroll:
    'M7 4h11a2 2 0 0 1 2 2v1h-4M7 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7M7 4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2M12 10h4M12 14h4',
  image: 'M4 5h16v14H4zM4 16l4.5-4.5 4 4L15 13l5 5M15.5 9.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0',
  calendar: 'M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5zM4 10h16M8 3v4M16 3v4',
  feather: 'M20 4c-6 0-11 4-12.5 10.5L6 20M20 4c0 6-4 10-10 11M20 4l-9 9M9 15.5h5',
  cloud: 'M7 18h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 7 9.5 4.25 4.25 0 0 0 7 18',
  heart: 'M12 20s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 10c0 5.65-7 10-7 10',
  folder: 'M3.5 7A1.5 1.5 0 0 1 5 5.5h4l2 2h8A1.5 1.5 0 0 1 20.5 9v8.5A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z',
  kanban: 'M4 5h4.5v14H4zM9.75 5h4.5v9h-4.5zM15.5 5H20v11h-4.5z',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 13.5l1.3 1-2 3.4-1.5-.6a7 7 0 0 1-1.7 1l-.3 1.7h-4l-.3-1.7a7 7 0 0 1-1.7-1l-1.5.6-2-3.4 1.3-1a7 7 0 0 1 0-3l-1.3-1 2-3.4 1.5.6a7 7 0 0 1 1.7-1L10 2.8h4l.3 1.7a7 7 0 0 1 1.7 1l1.5-.6 2 3.4-1.3 1a7 7 0 0 1 0 3',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13M20 20l-4.5-4.5',
  plus: 'M12 5v14M5 12h14',
  star: 'm12 4 2.3 4.9 5.2.6-3.9 3.6 1 5.2L12 15.7l-4.6 2.6 1-5.2-3.9-3.6 5.2-.6z',
  trash: 'M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13M10 11v5M14 11v5',
  x: 'M6 6l12 12M18 6 6 18',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  chevronRight: 'm10 6 6 6-6 6',
  chevronLeft: 'm14 6-6 6 6 6',
  chevronDown: 'm6 10 6 6 6-6',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  link: 'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  sparkle: 'M12 3c.6 4.2 2.4 6.3 6.5 7-4.1.7-5.9 2.8-6.5 7-.6-4.2-2.4-6.3-6.5-7 4.1-.7 5.9-2.8 6.5-7M19 15c.25 1.5.9 2.2 2 2.5-1.1.3-1.75 1-2 2.5-.25-1.5-.9-2.2-2-2.5 1.1-.3 1.75-1 2-2.5',
  music: 'M9 18V6l11-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0M20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  pen: 'M4 20l4-1 11-11-3-3L5 16zM14 7l3 3',
  tag: 'M4 12V5a1 1 0 0 1 1-1h7l8 8-8 8zM8.5 8.5h.01',
  menu: 'M4 7h16M4 12h16M4 17h16',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'm15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  unlock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 6.8-1.2',
  type: 'M5 6V5h14v1M12 5v14M9 19h6',
  palette:
    'M12 3a9 9 0 0 0 0 18c1.1 0 1.5-.8 1.5-1.5 0-1.2-1-1.5-1-2.5s.8-1.5 2-1.5H17a4 4 0 0 0 4-4c0-4.7-4-8.5-9-8.5M7.5 12h.01M9.5 7.5h.01M14.5 7.5h.01',
  square: 'M5 5h14v14H5z',
  sticky: 'M5 5h14v9l-5 5H5zM14 19v-5h5',
  layers: 'm12 4 8 4.5-8 4.5-8-4.5zM4 12.5l8 4.5 8-4.5M4 16.5l8 4.5 8-4.5',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  printer: 'M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M7 14h10v6H7z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2',
  repeat: 'M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8M12 12h.01',
  smile: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01',
  copy: 'M9 9h11v11H9zM5 15V4h11',
  eye: 'M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  move: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
  bringFront: 'M9 9h11v11H9zM4 4h11v3M4 4v11h3',
  sendBack: 'M4 4h11v11H4zM9 20h11V9h-3',
  zoomIn: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13M20 20l-4.5-4.5M8 10.5h5M10.5 8v5',
  zoomOut: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13M20 20l-4.5-4.5M8 10.5h5',
  archive: 'M4 5h16v4H4zM5.5 9v10h13V9M10 13h4',
  rotate: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
}

interface Props {
  name: keyof typeof PATHS | string
  size?: number
  className?: string
  style?: CSSProperties
  strokeWidth?: number
  fill?: string
}

export function Icon({ name, size = 18, className, style, strokeWidth = 1.6, fill = 'none' }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ flexShrink: 0, ...style }}
      aria-hidden
    >
      <path d={PATHS[name] ?? PATHS.sparkle} />
    </svg>
  )
}
