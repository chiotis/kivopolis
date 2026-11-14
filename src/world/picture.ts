/** Filled in by the <Capture /> component inside the canvas; null while no world is drawn. */
export const capture: { take: (() => Promise<Blob | null>) | null } = { take: null }

const pad = (value: number) => String(value).padStart(2, '0')

/** Saves the current view as a PNG named after the moment it was taken. */
export async function savePicture() {
  const blob = await capture.take?.()
  if (!blob) return false
  const now = new Date()
  const name = `kivopolis-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.png`
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return true
}
