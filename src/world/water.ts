import { CanvasTexture, Color, DoubleSide, MeshLambertMaterial, NearestFilter, RepeatWrapping, SRGBColorSpace } from 'three'

const PX = 16

/** A seamless 16 px ripple tile drawn in code, like the block atlas. */
function waterTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = PX
  const g = canvas.getContext('2d')!
  const base = new Color('#5aa3ad'), light = new Color('#9fd6d6'), deep = new Color('#3f8592')
  const tint = new Color()
  for (let y = 0; y < PX; y++) {
    for (let x = 0; x < PX; x++) {
      // Two sine ripples with whole periods across the tile, so it repeats without seams.
      const a = Math.sin((x / PX) * Math.PI * 2 * 2 + (y / PX) * Math.PI * 2)
      const b = Math.sin((y / PX) * Math.PI * 2 * 3 - (x / PX) * Math.PI * 2)
      const wave = (a + b) / 2
      tint.copy(base)
      if (wave > 0.55) tint.lerp(light, (wave - 0.55) / 0.45 * 0.8)
      else if (wave < -0.4) tint.lerp(deep, (-wave - 0.4) / 0.6 * 0.7)
      g.fillStyle = `#${tint.getHexString()}`
      g.fillRect(x, y, 1, 1)
    }
  }
  const texture = new CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.magFilter = NearestFilter
  texture.colorSpace = SRGBColorSpace
  return texture
}

let shared: { material: MeshLambertMaterial; texture: CanvasTexture } | null = null

/** One material for the voxel water and the flat sea beyond, so both look and move the same. */
export function waterMaterial() {
  if (!shared) {
    const texture = waterTexture()
    const material = new MeshLambertMaterial({
      map: texture, transparent: true, opacity: 0.74, depthWrite: false, side: DoubleSide,
    })
    shared = { material, texture }
  }
  return shared.material
}

/** Drifts the ripples; called once per frame. Reduced motion keeps the water still. */
export function animateWater(dt: number, still: boolean) {
  if (!shared || still) return
  const { offset } = shared.texture
  offset.x = (offset.x + dt * 0.06) % 1
  offset.y = (offset.y + dt * 0.035) % 1
}
