import { logoColors, logoPolygons, logoViewBox } from './logoShape'

/** The KivoPolis mark: a whole, a broken and a fallen column, drawn as isometric blocks. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox={logoViewBox} aria-hidden="true">
      {logoPolygons.map(({ face, points }, i) => (
        <polygon key={i} points={points} fill={logoColors[face]} stroke={logoColors[face]} strokeWidth={0.25} strokeLinejoin="round" />
      ))}
    </svg>
  )
}
