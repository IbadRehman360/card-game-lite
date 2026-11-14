"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import {
  type ReactNode,
  Suspense,
  memo,
  useEffect,
  useMemo,
  useRef,
} from "react";
import * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { CharacterId } from "@/lib/characters";
import { type Crop, type LookId, SEAT_RADIUS, shotFor } from "./view2d";

/**
 * The cast as real 3D figures (KayKit Adventurers by Kay Lousberg, CC0), drawn in a small transparent
 * canvas behind the 2D table's far rail. Loaded after first paint; the 2D room never waits for it.
 */
const MODEL_FILES: Partial<Record<CharacterId, string>> = {
  sal: "/models/sal.glb",
};

/** Body parts and clothing to keep; everything else in the pack (swords, shields, wands, mugs) is hidden. */
const KEEP = /Arm|Body|Head|Leg|Hat|Cape|Helmet/;
/** Standing height of a character, floor to the top of the head, in metres (as in the 3D app). */
const STANDING_HEIGHT = 1.75;
/** Seat height of the chairs in the 3D app. */
const BUST_BASE = 0.42;

/** A rigged character, scaled to sit at the table, feet on the floor, facing the camera. */
function CharacterModel({
  url,
  onLoaded,
}: {
  url: string;
  onLoaded?: () => void;
}) {
  const { scene, animations } = useGLTF(url);
  const group = useRef<THREE.Group>(null);
  const model = useMemo(() => {
    const m = clone(scene);
    m.traverse((o) => {
      const mesh = (o as THREE.Mesh).isMesh;
      if (mesh && !KEEP.test(o.name) && !KEEP.test(o.parent?.name ?? ""))
        o.visible = false;
    });
    const box = new THREE.Box3().setFromObject(m);
    const size = box.getSize(new THREE.Vector3());
    const s = STANDING_HEIGHT / Math.max(size.y, 0.001);
    m.scale.setScalar(s);
    m.position.y = -box.min.y * s;
    return m;
  }, [scene]);

  const { actions, names } = useAnimations(animations, group);
  // the callback can change on any re-render; the idle animation must only start once
  const loaded = useRef(onLoaded);
  useEffect(() => {
    loaded.current = onLoaded;
  }, [onLoaded]);
  useEffect(() => {
    const name =
      names.find((n) => n === "Sit_Chair_Idle") ??
      names.find((n) => /sit/i.test(n)) ??
      names.find((n) => /idle/i.test(n)) ??
      names[0];
    const action = name ? actions[name] : undefined;
    action?.reset().fadeIn(0.3).play();
    loaded.current?.();
    return () => {
      action?.fadeOut(0.3);
    };
  }, [actions, names]);

  return (
    <group ref={group}>
      <primitive object={model} />
    </group>
  );
}

/** The chair back behind the shoulders, as in the 3D app. */
function ChairBack() {
  return (
    <group position={[0, 0, -0.36]}>
      {[-0.3, 0.3].map((x) => (
        <mesh key={x} position={[x, 0.65, 0]}>
          <boxGeometry args={[0.06, 1.3, 0.06]} />
          <meshStandardMaterial color="#24160d" roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, 1.2, 0]}>
        <boxGeometry args={[0.72, 0.12, 0.06]} />
        <meshStandardMaterial color="#2b1a0f" roughness={0.55} />
      </mesh>
      <mesh position={[0, BUST_BASE - 0.03, 0.3]}>
        <boxGeometry args={[0.7, 0.06, 0.62]} />
        <meshStandardMaterial color="#2b1a0f" roughness={0.6} />
      </mesh>
    </group>
  );
}

/** One seat: chair and figure facing the middle, and the warm key light hanging in front of the face. */
/**
 * Shot in Bluff: the figure jerks back at the bang, then slumps forward over the table and stays there.
 * Pivots at the hips; the bluff drama fires "st-slump" when the gun goes off at this seat.
 */
function Slump({ on, children }: { on: boolean; children: ReactNode }) {
  const pivot = useRef<THREE.Group>(null);
  const hit = useRef<number | null>(null);
  const clock = useThree((s) => s.clock);
  useEffect(() => {
    if (!on) return;
    const go = () => (hit.current = clock.elapsedTime);
    window.addEventListener("st-slump", go);
    return () => window.removeEventListener("st-slump", go);
  }, [on, clock]);
  useFrame(({ clock: c }) => {
    const g = pivot.current;
    if (!g || hit.current === null) return;
    const t = c.elapsedTime - hit.current;
    // back hard in 0.12 s, hang a beat (slow), then fold forward and sink a little
    let a: number;
    if (t < 0.12) a = -0.42 * (t / 0.12);
    else if (t < 0.45) a = -0.42 + 0.05 * ((t - 0.12) / 0.33);
    else {
      const k = Math.min(1, (t - 0.45) / 0.9);
      const e = 1 - (1 - k) ** 3;
      a = -0.37 + 0.92 * e;
    }
    g.rotation.x = a;
    g.position.y = -0.1 * Math.min(1, Math.max(0, (t - 0.45) / 0.9));
    g.position.z = t < 0.12 ? -0.08 * (t / 0.12) : -0.08;
  });
  return (
    <group position={[0, 0.5, 0]}>
      <group ref={pivot}>
        <group position={[0, -0.5, 0]}>{children}</group>
      </group>
    </group>
  );
}

function Seat({
  id,
  x,
  z,
  rot,
  light,
  slump = false,
  onLoaded,
}: {
  id: CharacterId;
  x: number;
  z: number;
  rot: number;
  light: number;
  slump?: boolean;
  onLoaded?: () => void;
}) {
  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(x, BUST_BASE + 0.6, z);
    return o;
  }, [x, z]);
  // as the 3D app: the key light sits 0.75 m in from the seat, high up
  const k = (SEAT_RADIUS - 0.75) / SEAT_RADIUS;
  return (
    <group>
      <group position={[x, 0, z]} rotation={[0, rot, 0]}>
        <ChairBack />
        <Slump on={slump}>
          <Suspense fallback={null}>
            {MODEL_FILES[id] && (
              <CharacterModel url={MODEL_FILES[id]} onLoaded={onLoaded} />
            )}
          </Suspense>
        </Slump>
      </group>
      <primitive object={target} />
      <spotLight
        position={[x * k, 2.55, z * k]}
        target={target}
        angle={0.5}
        penumbra={0.8}
        distance={4}
        decay={1.6}
        intensity={light}
        color="#ffd7a0"
      />
    </group>
  );
}

/** The 3D app’s camera shot for this screen, picture shift included. */
/** Where the small canvas sits on the screen: its corner, and the whole screen's size. */
export interface FigBox {
  l: number;
  t: number;
  vw: number;
  vh: number;
}

function Frame({
  look,
  at,
  crop,
  box,
}: {
  look: LookId;
  at: number;
  crop?: Crop;
  box?: FigBox;
}) {
  const size = useThree((s) => s.size);
  const get = useThree((s) => s.get);
  useEffect(() => {
    const cam = get().camera as THREE.PerspectiveCamera;
    const { width, height } = size;
    // the canvas only covers the figure's box: show that window of the whole screen's view
    const l = box?.l ?? 0;
    const t = box?.t ?? 0;
    const vw = box?.vw ?? width;
    const vh = box?.vh ?? height;
    // we keep the aspect ourselves: on a captured picture the camera is the picture's own, cropped like it
    (cam as THREE.PerspectiveCamera & { manual?: boolean }).manual = true;
    if (crop) {
      const { bw, bh, s, ox, oy } = crop;
      const shot = shotFor(look, bw / bh, bh < 560, at);
      const fw = bw * s;
      const fh = bh * s;
      cam.aspect = bw / bh;
      cam.fov = shot.fov;
      cam.position.set(...shot.pos);
      cam.setViewOffset(
        fw,
        fh,
        -ox - shot.shift[0] * fw + l,
        shot.shift[1] * fh - oy + t,
        width,
        height,
      );
      cam.lookAt(...shot.look);
      cam.updateProjectionMatrix();
      get().invalidate();
      return;
    }
    const shot = shotFor(look, vw / Math.max(vh, 1), vh < 560, at);
    cam.aspect = vw / Math.max(vh, 1);
    cam.fov = shot.fov;
    cam.position.set(...shot.pos);
    cam.setViewOffset(
      vw,
      vh,
      -shot.shift[0] * vw + l,
      shot.shift[1] * vh + t,
      width,
      height,
    );
    cam.lookAt(...shot.look);
    cam.updateProjectionMatrix();
    get().invalidate();
  }, [get, size, look, at, crop, box]);
  return null;
}

/** The hanging lamp’s light (in a game it is lifted up out of the picture, and burns brighter). */
function LampLight({ lifted }: { lifted: boolean }) {
  const y = 2.94 + (lifted ? 1.4 : 0);
  const target = useMemo(() => new THREE.Object3D(), []);
  return (
    <>
      <primitive object={target} />
      <spotLight
        position={[0, y, 0]}
        target={target}
        angle={0.66}
        penumbra={0.75}
        distance={4.4}
        intensity={34 * (lifted ? 1.5 : 1)}
        decay={1.5}
        color="#ffcf8f"
      />
      <pointLight
        position={[0, y - 0.27, 0]}
        intensity={2.6}
        distance={5}
        decay={2}
        color="#ffc983"
      />
    </>
  );
}

/** Draws at a steady low frame rate (the idle animation is slow), and not at all in a hidden tab. */
function Ticker({ fps }: { fps: number }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    let id: number | undefined;
    const run = () => {
      window.clearInterval(id);
      id = document.hidden
        ? undefined
        : window.setInterval(() => invalidate(), 1000 / fps);
    };
    run();
    document.addEventListener("visibilitychange", run);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", run);
    };
  }, [fps, invalidate]);
  return null;
}

export default memo(function Figures({
  look,
  ids,
  seats,
  focus = -1,
  at = 0,
  fps = 30,
  crop,
  box,
  onReady,
}: {
  look: LookId;
  /** Where the select camera is (a seat index, fractional while it moves). */
  at?: number;
  ids: CharacterId[];
  seats: { x: number; z: number; rot: number }[];
  /** Index (in ids) of the lit one; -1 for none. */
  focus?: number;
  fps?: number;
  /** Standing on a captured picture: frame the figures through that picture's camera and crop. */
  crop?: Crop;
  /** The canvas covers only this box of the screen (much less to draw than the whole screen). */
  box?: FigBox;
  onReady?: () => void;
}) {
  const light = (i: number) =>
    look === "select"
      ? i === focus
        ? 16
        : 0.6
      : i === focus
        ? 16
        : look === "play"
          ? 4
          : 5;
  return (
    <Canvas
      dpr={1}
      frameloop="demand"
      gl={{
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
        stencil: false,
      }}
      camera={{ fov: 40, near: 0.1, far: 40, position: [0, 2, 6] }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.2;
      }}
    >
      <Frame look={look} at={at} crop={crop} box={box} />
      <Ticker fps={fps} />
      <ambientLight intensity={0.1} color="#ffd9aa" />
      <hemisphereLight args={["#4a3420", "#000000", 0.35]} />
      <LampLight lifted={look === "play"} />
      {ids.map((id, i) => (
        <Seat
          key={id}
          id={id}
          x={seats[i]?.x ?? 0}
          z={seats[i]?.z ?? -SEAT_RADIUS}
          rot={seats[i]?.rot ?? 0}
          light={light(i)}
          slump={look === "play"}
          onLoaded={i === 0 ? onReady : undefined}
        />
      ))}
    </Canvas>
  );
});
