/**
 * Cubo 3D. Muestra la orientación y los LEDs del cubo:
 *  - Simulador: la orientación verdadera del cubo simulado (se puede arrastrar).
 *  - Cubo real: solo la inclinación, reconstruida de la gravedad. El MPU6050
 *    no tiene magnetómetro, así que el giro horizontal no se conoce y no se
 *    inventa (ver core/orientation/frames.ts).
 * Los 6 × 7 × 7 píxeles salen del espejo de LEDs: lo mismo que dibuja el ESP32.
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { RGB } from '../../core/color/types';
import { INITIAL_LED_STATE, renderFaces, smoothColor, type LedState } from '../../core/leds/ledModel';
import { axisVector, topFace, type Axis } from '../../core/orientation/faces';
import { fwToThree, quatFromUp } from '../../core/orientation/frames';
import { cubeLink } from '../../store/cubeStore';
import { useSettings } from '../../store/settingsStore';
import { useStageScale } from '../components/Stage';
import { useReducedMotion } from '../hooks/useMotionPref';
import { createFaceTexture, createLedMaterial } from './ledMaterial';

interface CubeViewProps {
  className?: string;
  /** Giro lento de presentación (solo visual). */
  showcase?: boolean;
  /** Permite girar el cubo simulado arrastrando. */
  interactive?: boolean;
  /** Oculta el objetivo de la cara superior (Physical Target con el cubo real). */
  hideTarget?: boolean;
  /** Distancia de la cámara (más chico = más grande). */
  distance?: number;
  /** Halo detrás del cubo con el color promedio de sus LEDs. */
  glow?: boolean;
}

const IDLE_STATE: LedState = { ...INITIAL_LED_STATE, anim: 'IDLE', since: 0 };
const REST_COLOR: RGB = [127, 127, 255];
const SIZE = 1;
const PANEL = 0.8;

/** Transformación de una placa de LEDs para la cara que mira hacia `axis` (marco del firmware). */
function panelTransform(axis: Axis): { position: THREE.Vector3; rotation: THREE.Euler } {
  const d = fwToThree(axisVector(axis));
  const position = new THREE.Vector3(d.x, d.y, d.z).multiplyScalar(SIZE / 2 + 0.002);
  let rotation: THREE.Euler;
  if (d.y > 0.5) rotation = new THREE.Euler(-Math.PI / 2, 0, 0);
  else if (d.y < -0.5) rotation = new THREE.Euler(Math.PI / 2, 0, 0);
  else if (d.x > 0.5) rotation = new THREE.Euler(0, Math.PI / 2, 0);
  else if (d.x < -0.5) rotation = new THREE.Euler(0, -Math.PI / 2, 0);
  else if (d.z < -0.5) rotation = new THREE.Euler(0, Math.PI, 0);
  else rotation = new THREE.Euler(0, 0, 0);
  return { position, rotation };
}

function CubeModel({
  showcase,
  interactive,
  hideTarget,
  glowEl,
}: Required<Omit<CubeViewProps, 'className' | 'distance' | 'glow'>> & { glowEl: React.RefObject<HTMLDivElement | null> | null }) {
  const faceAxes = useSettings((s) => s.faceAxes);
  const spin = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const player = useRef<[number, number, number]>([...REST_COLOR]);
  const top = useRef<number | null>(null);
  const last = useRef(performance.now());
  const { camera, gl } = useThree();

  const faces = useMemo(() => Array.from({ length: 6 }, () => createFaceTexture()), []);
  const materials = useMemo(() => faces.map((f) => createLedMaterial(f.texture)), [faces]);
  const buffers = useMemo(() => faces.map((f) => f.data), [faces]);
  const geometry = useMemo(() => new RoundedBoxGeometry(SIZE, SIZE, SIZE, 4, 0.07), []);
  const panel = useMemo(() => new THREE.PlaneGeometry(PANEL, PANEL), []);
  const transforms = useMemo(() => faceAxes.map(panelTransform), [faceAxes]);
  const target = useMemo(() => new THREE.Quaternion(), []);
  const frame = useRef(0);

  useEffect(
    () => () => {
      faces.forEach((f) => f.texture.dispose());
      materials.forEach((m) => m.dispose());
      geometry.dispose();
      panel.dispose();
    },
    [faces, materials, geometry, panel],
  );

  // Arrastrar para girar el cubo simulado.
  useEffect(() => {
    if (!interactive) return;
    const el = gl.domElement;
    let prev: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      if (!cubeLink.mock) return;
      prev = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
      el.style.cursor = 'grabbing';
    };
    const move = (e: PointerEvent) => {
      const mock = cubeLink.mock;
      if (!prev || !mock) return;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      prev = { x: e.clientX, y: e.clientY };
      const len = Math.hypot(dx, dy);
      if (len < 0.5) return;
      const axis = new THREE.Vector3(dy, dx, 0).normalize().applyQuaternion(camera.quaternion);
      const dq = new THREE.Quaternion().setFromAxisAngle(axis, len * 0.011);
      const q = new THREE.Quaternion(...mock.getOrientation()).premultiply(dq);
      mock.setOrientation([q.x, q.y, q.z, q.w]);
    };
    const up = (e: PointerEvent) => {
      prev = null;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      el.style.cursor = 'grab';
    };
    el.style.cursor = 'grab';
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    return () => {
      el.style.cursor = '';
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
  }, [interactive, gl, camera]);

  useFrame(() => {
    const now = performance.now();
    const dt = Math.min(100, now - last.current);
    last.current = now;
    const sample = cubeLink.sample;
    const mock = cubeLink.mock;

    // Orientación
    if (body.current) {
      if (mock) target.set(...mock.getOrientation());
      else if (sample) target.set(...quatFromUp(sample.up));
      else target.identity();
      const k = 1 - Math.exp(-dt / (mock ? 40 : 90));
      body.current.quaternion.slerp(target, k);
    }
    if (spin.current && showcase) spin.current.rotation.y += dt * 0.00035;

    // LEDs
    player.current = smoothColor(player.current, sample?.playerRgb ?? REST_COLOR, dt);
    const rgb: RGB = [Math.round(player.current[0]), Math.round(player.current[1]), Math.round(player.current[2])];
    if (sample) top.current = topFace(sample.up, faceAxes, top.current);
    const state = cubeLink.connected ? cubeLink.ledState(now) : IDLE_STATE;
    const up = sample?.up;
    const faceUp = up
      ? faceAxes.map((a) => {
          const v = axisVector(a);
          return Math.round((v.x * up.x + v.y * up.y + v.z * up.z) * 255);
        })
      : undefined;
    renderFaces(state, now, { player: rgb, topFace: top.current ?? 0, faceUp }, buffers);
    // Halo: color promedio de los LEDs, unas 10 veces por segundo.
    if (glowEl?.current && frame.current++ % 6 === 0) {
      let r = 0, g = 0, b = 0, n = 0;
      for (const buf of buffers)
        for (let i = 0; i < buf.length; i += 4)
          if (buf[i + 3]) {
            r += buf[i]!;
            g += buf[i + 1]!;
            b += buf[i + 2]!;
            n++;
          }
      const k = n ? 1 / n : 0;
      glowEl.current.style.background = `radial-gradient(circle at 50% 50%, rgb(${Math.round(r * k)} ${Math.round(g * k)} ${Math.round(b * k)} / 0.55) 0%, transparent 62%)`;
    }
    if (hideTarget && state.anim === 'TARGET' && top.current !== null) {
      const buf = buffers[top.current];
      if (buf) {
        for (let y = 0; y < 7; y++)
          for (let x = 0; x < 7; x++) {
            const i = (y * 7 + x) * 4;
            if (buf[i + 3] === 0) continue;
            const edge = x === 0 || y === 0 || x === 6 || y === 6;
            const v = edge ? 210 : (x + y) % 2 ? 46 : 34;
            buf[i] = v;
            buf[i + 1] = v;
            buf[i + 2] = edge ? 230 : v + 18;
          }
      }
    }
    faces.forEach((f) => (f.texture.needsUpdate = true));
  });

  return (
    <group ref={spin} rotation={[0, showcase ? -0.5 : 0, 0]}>
      <group ref={body}>
        <mesh geometry={geometry}>
          <meshBasicMaterial color={new THREE.Color(0.055, 0.05, 0.1)} />
        </mesh>
        {transforms.map((t, i) => (
          <mesh key={i} geometry={panel} material={materials[i]} position={t.position} rotation={t.rotation} />
        ))}
      </group>
    </group>
  );
}

export function CubeView({ className = '', showcase = false, interactive = false, hideTarget = false, distance = 4.2, glow = false }: CubeViewProps) {
  const glowRef = useRef<HTMLDivElement>(null);
  const dir = new THREE.Vector3(0.62, 0.5, 0.6).normalize().multiplyScalar(distance);
  // El escenario se escala con CSS: subir la resolución del canvas para que no se vea borroso.
  const scale = useStageScale();
  const reduce = useReducedMotion();
  const dpr = Math.min(3, (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1) * Math.max(1, scale));
  return (
    <div className={`relative ${className}`}>
      {glow && <div ref={glowRef} aria-hidden className="pointer-events-none absolute inset-[-12%] transition-[background] duration-150" />}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[4%] left-1/2 h-[9%] w-[55%] -translate-x-1/2 rounded-[50%] bg-black/35 blur-xl"
      />
      <Canvas
        flat
        dpr={dpr}
        gl={{ antialias: true, alpha: true }}
        camera={{ position: [dir.x, dir.y, dir.z], fov: 30, near: 0.1, far: 50 }}
        onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
        aria-label="Vista 3D del cubo"
        role="img"
      >
        <CubeModel showcase={showcase && !reduce} interactive={interactive} hideTarget={hideTarget} glowEl={glow ? glowRef : null} />
      </Canvas>
    </div>
  );
}
