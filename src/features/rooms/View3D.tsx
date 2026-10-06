import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { AMBIENCES, addLights, buildPlanGroup, disposeScene, skyTexture, softGround, type LightRig, type Quality } from './scene3d'
import type { PlanData, RoomPlan } from './types'

export interface View3DHandle {
  exportPng: () => string | null
  fit: () => void
  rotate: (dir: 1 | -1) => void
}

interface Props {
  data: PlanData
  ambience: RoomPlan['ambience']
  mode: 'iso' | 'free'
  cutWalls: boolean
  quality: Quality
}

/** Vue 3D générée depuis le plan (isométrique ou libre). */
export const View3D = forwardRef<View3DHandle, Props>(function View3D({ data, ambience, mode, cutWalls, quality }, ref) {
  const host = useRef<HTMLDivElement>(null)
  const st = useRef<{
    renderer: THREE.WebGLRenderer
    scene: THREE.Scene
    camera: THREE.Camera
    controls: OrbitControls
    content: THREE.Group | null
    isoAngle: number
    center: THREE.Vector3
    size: number
    raf: number
    dirty: boolean
    rig: LightRig | null
    lastAnim: number
    shadowFrames: number
  } | null>(null)

  /* ---------- initialisation ---------- */
  useEffect(() => {
    const el = host.current!
    const belle = quality === 'belle'
    const renderer = new THREE.WebGLRenderer({ antialias: belle, preserveDrawingBuffer: true, powerPreference: belle ? 'high-performance' : 'low-power' })
    // en mode éco on dessine moins de pixels : c'est ce qui coûte le plus sur un petit PC
    renderer.setPixelRatio(belle ? Math.min(1.75, window.devicePixelRatio) : Math.min(1, window.devicePixelRatio))
    renderer.shadowMap.enabled = belle
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.shadowMap.autoUpdate = false
    renderer.setClearColor('#f3ede4')
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.NeutralToneMapping
    renderer.toneMappingExposure = 1.05
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 200)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    st.current = { renderer, scene, camera, controls, content: null, isoAngle: Math.PI / 4, center: new THREE.Vector3(), size: 5, raf: 0, dirty: true, rig: null, lastAnim: 0, shadowFrames: 0 }
    controls.addEventListener('change', () => st.current && (st.current.dirty = true))
    const resize = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      renderer.setSize(w, h)
      const s = st.current!
      if (s.camera instanceof THREE.PerspectiveCamera) {
        s.camera.aspect = w / h
        s.camera.updateProjectionMatrix()
      } else if (s.camera instanceof THREE.OrthographicCamera) frameIso(false)
      s.dirty = true
    }
    const s0 = () => (st.current!.raf = requestAnimationFrame(loop))
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    // on ne redessine que si quelque chose a bougé : la carte graphique se repose le reste du temps
    const loop = (now: number) => {
      const s = st.current!
      s.controls.update()
      if (s.rig?.animated && now - s.lastAnim > 50) {
        s.rig.tick(now / 1000)
        s.lastAnim = now
        s.dirty = true
      }
      if (s.shadowFrames > 0) {
        s.renderer.shadowMap.needsUpdate = true
        s.shadowFrames--
        s.dirty = true
      }
      if (s.dirty) {
        s.renderer.render(s.scene, s.camera)
        s.dirty = false
      }
      s.raf = requestAnimationFrame(loop)
    }
    s0()
    resize()
    return () => {
      ro.disconnect()
      cancelAnimationFrame(st.current!.raf)
      controls.dispose()
      disposeScene(scene)
      renderer.dispose()
      el.removeChild(renderer.domElement)
      st.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- caméra isométrique cadrée automatiquement ---------- */
  const frameIso = (resetAngle: boolean) => {
    const s = st.current
    if (!s) return
    const el = host.current!
    const aspect = el.clientWidth / Math.max(1, el.clientHeight)
    if (resetAngle) s.isoAngle = Math.PI / 4
    let cam = s.camera
    if (!(cam instanceof THREE.OrthographicCamera)) {
      cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 200)
      s.camera = cam
      s.controls.object = cam
    }
    const oc = cam as THREE.OrthographicCamera
    const dist = 30
    const elev = Math.atan(1 / Math.SQRT2) // angle isométrique vrai (35,26°)
    oc.position.set(
      s.center.x + Math.cos(s.isoAngle) * Math.cos(elev) * dist,
      s.center.y + Math.sin(elev) * dist,
      s.center.z + Math.sin(s.isoAngle) * Math.cos(elev) * dist,
    )
    oc.lookAt(s.center)
    // cadrage : projette la boîte englobante dans le repère de la caméra
    const box = s.content ? new THREE.Box3().setFromObject(s.content) : new THREE.Box3(new THREE.Vector3(-2, 0, -2), new THREE.Vector3(2, 2.5, 2))
    oc.updateMatrixWorld()
    const inv = oc.matrixWorldInverse
    const pts = [0, 1].flatMap((i) => [0, 1].flatMap((j) => [0, 1].map((k) => new THREE.Vector3(i ? box.max.x : box.min.x, j ? box.max.y : box.min.y, k ? box.max.z : box.min.z).applyMatrix4(inv))))
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    let w = Math.max(...xs) - Math.min(...xs)
    let h = Math.max(...ys) - Math.min(...ys)
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2
    const cy = (Math.max(...ys) + Math.min(...ys)) / 2
    w *= 1.15
    h *= 1.15
    if (w / h > aspect) h = w / aspect
    else w = h * aspect
    oc.left = cx - w / 2
    oc.right = cx + w / 2
    oc.top = cy + h / 2
    oc.bottom = cy - h / 2
    oc.zoom = 1
    oc.updateProjectionMatrix()
    s.controls.target.copy(s.center)
    // en isométrique : on garde l'angle (rotation par quarts de tour via les boutons), zoom et déplacement libres
    s.controls.enableRotate = false
    s.controls.screenSpacePanning = true
    s.controls.update()
    s.dirty = true
  }

  const frameFree = () => {
    const s = st.current
    if (!s) return
    const el = host.current!
    const cam = new THREE.PerspectiveCamera(50, el.clientWidth / Math.max(1, el.clientHeight), 0.05, 200)
    cam.position.set(s.center.x + s.size * 0.55, s.size * 0.6, s.center.z + s.size * 0.65)
    s.camera = cam
    s.controls.object = cam
    s.controls.target.copy(s.center)
    s.controls.enableRotate = true
    s.controls.maxPolarAngle = Math.PI / 2 - 0.02
    s.controls.update()
    s.dirty = true
  }

  /* ---------- reconstruction de la scène quand le plan change ---------- */
  useEffect(() => {
    const s = st.current
    if (!s) return
    const t = window.setTimeout(() => {
      disposeScene(s.scene)
      s.scene.clear()
      const time = (ambience.time in AMBIENCES ? ambience.time : 'jour') as keyof typeof AMBIENCES
      s.scene.background = skyTexture(time)
      s.renderer.toneMappingExposure = AMBIENCES[time].exposure
      const { root, emitters } = buildPlanGroup(data, { cutWalls: cutWalls ? 110 : null, quality })
      s.content = root
      s.scene.add(root)
      const box = new THREE.Box3().setFromObject(root)
      const empty = box.isEmpty()
      s.center = empty ? new THREE.Vector3() : box.getCenter(new THREE.Vector3())
      s.center.y = 0.6
      s.size = empty ? 5 : Math.max(box.max.x - box.min.x, box.max.z - box.min.z, 3)
      s.scene.add(softGround(time, s.center, s.size))
      s.rig = addLights(s.scene, emitters, ambience, new THREE.Vector3(s.center.x, 0, s.center.z), s.size, quality)
      if (mode === 'iso') frameIso(false)
      s.shadowFrames = 2 // les ombres ne sont recalculées que quand la scène change
      s.dirty = true
    }, 120)
    return () => window.clearTimeout(t)
  }, [data, ambience, cutWalls]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = window.setTimeout(() => (mode === 'iso' ? frameIso(true) : frameFree()), 140)
    return () => window.clearTimeout(t)
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    exportPng: () => {
      const s = st.current
      if (!s) return null
      s.renderer.shadowMap.needsUpdate = true
      s.renderer.render(s.scene, s.camera)
      return s.renderer.domElement.toDataURL('image/png')
    },
    fit: () => (mode === 'iso' ? frameIso(false) : frameFree()),
    rotate: (dir) => {
      const s = st.current
      if (!s) return
      s.isoAngle += (dir * Math.PI) / 2
      frameIso(false)
    },
  }))

  return <div ref={host} className="r3d" />
})
