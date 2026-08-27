import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, Lightformer, ContactShadows } from "@react-three/drei";
import {
  resolveDenominator,
  type FaceKey,
  type PlanModel,
  type PlanOpening,
  type ScaleSettings,
} from "@/lib/plan-model";

const WOOD = "#d9bf94";
const WOOD_DARK = "#b9975f";
const ROOF = "#8a6a4a";
const GLASS = "#3f5b78";
const DOOR = "#7a4a35";
const BASE = "#a98a5c";

interface Props {
  model: PlanModel;
  scale: ScaleSettings;
  /** Material thickness in model inches, used for panel thickness. */
  thicknessIn: number;
}

interface Dims {
  w: number;
  d: number;
  h: number;
  wall: number;
  t: number;
}

function Opening({
  o,
  dims,
  denominator,
}: {
  o: PlanOpening;
  dims: Dims;
  denominator: number;
}) {
  const w = o.widthIn / denominator;
  const h = o.heightIn / denominator;
  const x = o.xIn / denominator;
  const y = o.yIn / denominator;
  const face: FaceKey = o.face;
  const color = o.kind === "door" ? DOOR : GLASS;
  const inset = dims.t * 0.4;
  const depth = dims.t * 0.5;

  // Position on the correct wall, measured from that face's left edge looking at it.
  let position: [number, number, number];
  let rotationY = 0;
  const cy = y + h / 2;

  if (face === "front") {
    position = [-dims.w / 2 + x + w / 2, cy, dims.d / 2 - inset];
  } else if (face === "back") {
    position = [dims.w / 2 - x - w / 2, cy, -dims.d / 2 + inset];
    rotationY = Math.PI;
  } else if (face === "left") {
    position = [-dims.w / 2 + inset, cy, -dims.d / 2 + x + w / 2];
    rotationY = -Math.PI / 2;
  } else {
    position = [dims.w / 2 - inset, cy, dims.d / 2 - x - w / 2];
    rotationY = Math.PI / 2;
  }

  const cols = Math.max(1, o.paneCols ?? 1);
  const rows = Math.max(1, o.paneRows ?? 1);
  const mullion = Math.min(w, h) * 0.045;

  return (
    <group position={position} rotation-y={rotationY}>
      <mesh castShadow>
        <boxGeometry args={[w, h, depth]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.05} />
      </mesh>
      {/* casing / trim */}
      <mesh position={[0, 0, depth * 0.5]}>
        <boxGeometry args={[w + mullion * 3, h + mullion * 3, depth * 0.4]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0, depth * 0.62]}>
        <boxGeometry args={[w, h, depth * 0.42]} />
        <meshStandardMaterial color={color} roughness={0.3} />
      </mesh>
      {o.kind === "window" &&
        Array.from({ length: cols - 1 }, (_, i) => (
          <mesh key={`c${i}`} position={[-w / 2 + (w * (i + 1)) / cols, 0, depth * 0.85]}>
            <boxGeometry args={[mullion, h, depth * 0.3]} />
            <meshStandardMaterial color={WOOD} roughness={0.8} />
          </mesh>
        ))}
      {o.kind === "window" &&
        Array.from({ length: rows - 1 }, (_, i) => (
          <mesh key={`r${i}`} position={[0, -h / 2 + (h * (i + 1)) / rows, depth * 0.85]}>
            <boxGeometry args={[w, mullion, depth * 0.3]} />
            <meshStandardMaterial color={WOOD} roughness={0.8} />
          </mesh>
        ))}
    </group>
  );
}

function House({ model, scale, thicknessIn }: Props) {
  const d = resolveDenominator(model, scale);
  const dims: Dims = useMemo(() => {
    const w = model.overall.widthIn / d;
    const dep = model.overall.depthIn / d;
    const h = model.overall.heightIn / d;
    const wall = Math.min(model.overall.wallHeightIn / d, h);
    return { w, d: dep, h, wall, t: Math.max(thicknessIn, 0.05) };
  }, [model, d, thicknessIn]);

  const roofRise = Math.max(dims.h - dims.wall, 0);
  const gabled = roofRise > dims.h * 0.04;
  const overhang = Math.max(model.roof.overhangIn / d, 0);
  const floors = Math.max(1, Math.min(model.stories, 5)) - 1;

  const slopeLen = Math.sqrt((dims.d / 2 + overhang) ** 2 + roofRise ** 2);
  const slopeAngle = Math.atan2(roofRise, dims.d / 2 + overhang);

  return (
    <group position={[0, -dims.h / 2, 0]}>
      {/* base plate */}
      <mesh position={[0, -dims.t / 2, 0]} receiveShadow castShadow>
        <boxGeometry args={[dims.w + dims.t * 2, dims.t, dims.d + dims.t * 2]} />
        <meshStandardMaterial color={BASE} roughness={0.85} />
      </mesh>

      {/* four walls, built as panels of the real stock thickness */}
      <mesh position={[0, dims.wall / 2, dims.d / 2 - dims.t / 2]} castShadow receiveShadow>
        <boxGeometry args={[dims.w, dims.wall, dims.t]} />
        <meshStandardMaterial color={WOOD} roughness={0.75} />
      </mesh>
      <mesh position={[0, dims.wall / 2, -dims.d / 2 + dims.t / 2]} castShadow receiveShadow>
        <boxGeometry args={[dims.w, dims.wall, dims.t]} />
        <meshStandardMaterial color={WOOD} roughness={0.75} />
      </mesh>
      <mesh position={[-dims.w / 2 + dims.t / 2, dims.wall / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[dims.t, dims.wall, dims.d - dims.t * 2]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.75} />
      </mesh>
      <mesh position={[dims.w / 2 - dims.t / 2, dims.wall / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[dims.t, dims.wall, dims.d - dims.t * 2]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.75} />
      </mesh>

      {/* intermediate floors */}
      {Array.from({ length: floors }, (_, i) => (
        <mesh
          key={i}
          position={[0, (dims.wall * (i + 1)) / (floors + 1), 0]}
          castShadow
        >
          <boxGeometry args={[dims.w - dims.t * 2, dims.t, dims.d - dims.t * 2]} />
          <meshStandardMaterial color={BASE} roughness={0.85} />
        </mesh>
      ))}

      {/* gable end panels (front & back triangles) */}
      {gabled &&
        [dims.d / 2 - dims.t / 2, -dims.d / 2 + dims.t / 2].map((z, i) => (
          <mesh key={i} position={[0, dims.wall, z]} castShadow>
            <extrudeGeometry
              args={[gableShape(dims.w, roofRise), { depth: dims.t, bevelEnabled: false }]}
            />
            <meshStandardMaterial color={WOOD} roughness={0.75} />
          </mesh>
        ))}


      {/* roof */}
      {gabled ? (
        <>
          <mesh
            position={[0, dims.wall + roofRise / 2, (dims.d / 2 + overhang) / 2]}
            rotation-x={-slopeAngle}
            castShadow
          >
            <boxGeometry args={[dims.w + overhang * 2, dims.t, slopeLen]} />
            <meshStandardMaterial color={ROOF} roughness={0.9} />
          </mesh>
          <mesh
            position={[0, dims.wall + roofRise / 2, -(dims.d / 2 + overhang) / 2]}
            rotation-x={slopeAngle}
            castShadow
          >
            <boxGeometry args={[dims.w + overhang * 2, dims.t, slopeLen]} />
            <meshStandardMaterial color={ROOF} roughness={0.9} />
          </mesh>
        </>
      ) : (
        <mesh position={[0, dims.wall + dims.t / 2, 0]} castShadow>
          <boxGeometry args={[dims.w + overhang * 2, dims.t, dims.d + overhang * 2]} />
          <meshStandardMaterial color={ROOF} roughness={0.9} />
        </mesh>
      )}

      {/* windows & doors */}
      {model.openings.map((o, i) => (
        <Opening key={i} o={o} dims={dims} denominator={d} />
      ))}
    </group>
  );
}

/** Interactive 3D mock-up of the finished miniature, built from the same plan data. */
export function PlanPreview3D({ model, scale, thicknessIn }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const d = resolveDenominator(model, scale);
  const span = Math.max(
    model.overall.widthIn / d,
    model.overall.depthIn / d,
    model.overall.heightIn / d,
    1,
  );

  if (!mounted) {
    return (
      <div className="flex h-[460px] items-center justify-center rounded-md border border-border bg-card">
        <span className="tech-label text-muted-foreground">Loading 3D view…</span>
      </div>
    );
  }

  return (
    <div className="h-[460px] overflow-hidden rounded-md border border-border bg-card">
      <Canvas shadows dpr={[1, 2]} camera={{ position: [span * 1.5, span * 1.1, span * 1.9], fov: 42 }}>
        <color attach="background" args={["#f2ece0"]} />
        <ambientLight intensity={0.55} />
        <directionalLight
          position={[span * 2, span * 3, span * 2]}
          intensity={1.7}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <Suspense fallback={null}>
          <Environment>
            <Lightformer intensity={1.8} position={[0, span * 2, 0]} scale={[span * 3, span * 3, 1]} />
            <Lightformer
              intensity={0.9}
              color="#cfe0ea"
              position={[-span * 2, span, -span]}
              rotation-y={Math.PI / 2}
              scale={[span * 4, span, 1]}
            />
          </Environment>
          <House model={model} scale={scale} thicknessIn={thicknessIn} />
          <ContactShadows
            position={[0, -span * 0.5 - 0.01, 0]}
            opacity={0.35}
            scale={span * 4}
            blur={2.4}
            far={span}
          />
        </Suspense>
        <OrbitControls
          enablePan={false}
          minDistance={span * 0.9}
          maxDistance={span * 5}
          maxPolarAngle={Math.PI / 2.05}
          autoRotate
          autoRotateSpeed={0.7}
        />
      </Canvas>
    </div>
  );
}
