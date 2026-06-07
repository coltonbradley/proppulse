// Logo recolored via CSS filter: grayscale → invert (white bg becomes black) → sepia+hue-rotate → #D85A30 orange
const ORANGE_FILTER =
  'grayscale(1) invert(1) sepia(1) saturate(4) hue-rotate(-20deg) brightness(0.85)'

export default function HerdLogo({ size = 28 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/herd-logo.png"
      alt=""
      width={size}
      height={size}
      style={{ filter: ORANGE_FILTER, objectFit: 'contain', flexShrink: 0 }}
    />
  )
}
