import type { CSSProperties } from 'react'

/** La mascotte de Minion (icône de l'app), redessinée en vectoriel. */
export const MASCOT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="200 130 854 1000">
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path class="m-sprout" d="M545 175 C 590 185 615 215 627 252 M722 210 C 682 210 656 230 640 252" stroke="#E8B60F" stroke-width="26"/>
    <path class="m-body" fill="#FFFDF6" stroke="#E8B60F" stroke-width="26" d="M630 262 C 800 262 905 390 925 525 L 935 640 C 945 700 1000 740 1000 820 C 1000 890 955 925 915 925 C 890 990 850 1020 830 1030 C 860 1060 860 1100 800 1100 L 740 1100 C 700 1100 690 1060 715 1040 L 545 1040 C 570 1060 560 1100 510 1100 L 450 1100 C 390 1100 390 1060 420 1030 C 400 1020 360 990 340 925 C 300 925 255 890 255 820 C 255 740 310 700 320 640 L 330 525 C 350 390 460 262 630 262 Z"/>
    <path d="M350 768 C 370 812 398 830 425 830 C 455 834 458 868 424 880 C 412 905 388 925 340 925 M905 768 C 885 812 857 830 830 830 C 800 834 797 868 831 880 C 843 905 867 925 915 925" stroke="#E8B60F" stroke-width="26"/>
    <rect x="302" y="510" width="56" height="62" rx="10" fill="#4A3D35"/>
    <rect x="884" y="516" width="56" height="58" rx="10" fill="#4A3D35"/>
    <circle cx="498" cy="540" r="140" fill="#FFFDF6" stroke="#4A3D35" stroke-width="30"/>
    <circle cx="764" cy="556" r="113" fill="#FFFDF6" stroke="#4A3D35" stroke-width="30"/>
    <g class="m-eyes">
      <ellipse cx="545" cy="541" rx="38" ry="42" fill="#4A3D35"/>
      <ellipse cx="740" cy="566" rx="30" ry="35" fill="#4A3D35"/>
      <circle cx="535" cy="526" r="9" fill="#FFFDF6"/>
      <circle cx="733" cy="552" r="7.5" fill="#FFFDF6"/>
    </g>
    <path d="M586 702 C 612 744 660 744 682 699" stroke="#4A3D35" stroke-width="24"/>
  </g>
</svg>`

export function Mascot({ size = 40, className, style }: { size?: number; className?: string; style?: CSSProperties }) {
  return (
    <span
      className={className}
      style={{ display: 'inline-block', width: size, height: size * (1000 / 854), lineHeight: 0, ...style }}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: MASCOT_SVG.replace('<svg ', '<svg width="100%" height="100%" ') }}
    />
  )
}
