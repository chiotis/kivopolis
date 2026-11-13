import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { capture } from './picture'

/**
 * Renders one frame and reads the canvas in the same task, while the drawing buffer is still
 * filled, so the canvas does not need preserveDrawingBuffer (which would slow every frame).
 */
export function Capture() {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    capture.take = () => {
      gl.render(scene, camera)
      return new Promise((resolve) => gl.domElement.toBlob(resolve, 'image/png'))
    }
    return () => { capture.take = null }
  }, [gl, scene, camera])
  return null
}
