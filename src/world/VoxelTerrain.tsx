import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, Group, Mesh, MeshLambertMaterial } from 'three'
import { sharedAtlas } from '../voxel/atlas'
import { meshChunk } from '../voxel/mesher'
import { CX, CZ, getWorld } from '../voxel/world'

/** Chunks re-meshed per frame; edits touch at most four, a reset touches all. */
const BUDGET = 6

function buildGeometry(cx: number, cz: number) {
  const mesh = meshChunk(getWorld(), cx, cz)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(mesh.normals, 3))
  geometry.setAttribute('uv', new BufferAttribute(mesh.uvs, 2))
  geometry.setAttribute('color', new BufferAttribute(mesh.colors, 3))
  geometry.setIndex(new BufferAttribute(mesh.indices, 1))
  geometry.computeBoundingSphere()
  return geometry
}

export function VoxelTerrain({ shadows }: { shadows: boolean }) {
  const group = useRef<Group>(null)
  const material = useMemo(() => new MeshLambertMaterial({ map: sharedAtlas(), vertexColors: true, alphaTest: 0.5 }), [])
  const meshes = useRef<Mesh[]>([])
  const dirty = useRef(new Set<number>())

  useEffect(() => {
    const root = group.current!
    const world = getWorld()
    const list: Mesh[] = []
    for (let cz = 0; cz < CZ; cz++) {
      for (let cx = 0; cx < CX; cx++) {
        const mesh = new Mesh(buildGeometry(cx, cz), material)
        mesh.receiveShadow = true
        mesh.name = `chunk-${cx}-${cz}`
        list.push(mesh)
        root.add(mesh)
      }
    }
    meshes.current = list
    const unsubscribe = world.subscribe((chunks) => { for (const chunk of chunks) dirty.current.add(chunk) })
    return () => {
      unsubscribe()
      for (const mesh of list) {
        root.remove(mesh)
        mesh.geometry.dispose()
      }
      meshes.current = []
    }
  }, [material])

  useEffect(() => {
    for (const mesh of meshes.current) mesh.castShadow = shadows
  }, [shadows])

  useEffect(() => () => { material.dispose() }, [material])

  useFrame(() => {
    if (!dirty.current.size) return
    let budget = BUDGET
    for (const chunk of dirty.current) {
      if (budget-- <= 0) break
      dirty.current.delete(chunk)
      const mesh = meshes.current[chunk]
      if (!mesh) continue
      mesh.geometry.dispose()
      mesh.geometry = buildGeometry(chunk % CX, Math.floor(chunk / CX))
    }
  })

  return <group ref={group} />
}
