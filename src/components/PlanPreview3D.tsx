import { Suspense, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";

import { OrbitControls, Environment, Lightformer, ContactShadows } from "@react-three/drei";
import {
  ensureMasses,
  expandOpenings,
  massBounds,
  resolveDenominator,
  type FaceKey,
  type PlanFeature,
  type PlanMass,
  type PlanModel,
  type PlanOpening,
  type ScaleSettings,
} from "@/lib/plan-model";

const WOOD = "#d9bf94";
const WOOD_DARK = "#c2a473";
const ROOF = "#8a6a4a";
const GLASS = "#3f5b78";
const DOOR = "#7a4a35";
const BASE = "#a98a5c";
const TRIM = "#cbb28a";

interface Props {
  model: PlanModel;
  scale: ScaleSettings;
  /** Material thickness in model inches, used for panel thickness. */
  thicknessIn: number;
}

/* ------------------------------------------------------------------ */
/* Shape helpers                                                       */
/* ------------------------------------------------------------------ */

/** Outline of an opening, drawn in panel coordinates (x right, y up). */
function openingPath(o: PlanOpening, x: number, y: number, w: number, h: number) {
  const p = new THREE.Path();
  const shape = o.shape ?? "rectangle";
  const rise = Math.min(Math.max(o.archRiseIn ?? 0, 0) * (h / Math.max(o.heightIn, 0.001)), h * 0.9);
  const cx = x + w / 2;

  if (shape === "circle") {
    p.absellipse(cx, y + h / 2, w / 2, h / 2, 0, Math.PI * 2, false, 0);
    return p;
  }
  if (shape === "rectangle" || rise <= 0.0001) {
    p.moveTo(x, y);
    p.lineTo(x + w, y);
    p.lineTo(x + w, y + h);
    p.lineTo(x, y + h);
    p.closePath();
    return p;
  }

  const springing = y + h - rise;
  if (shape === "pointed-arch") {
    p.moveTo(x, y);
    p.lineTo(x + w, y);
    p.lineTo(x + w, springing);
    p.quadraticCurveTo(x + w * 0.75, springing + rise * 0.75, cx, y + h);
    p.quadraticCurveTo(x + w * 0.25, springing + rise * 0.75, x, springing);
    p.closePath();
    return p;
  }
  if (shape === "horseshoe-arch") {
    // Horseshoe: the arch is more than a half circle, so it bulges wider than
    // the jambs before it returns to them.
    const bulge = w * 0.09;
    p.moveTo(x, y);
    p.lineTo(x + w, y);
    p.lineTo(x + w, springing * 0.999);
    p.bezierCurveTo(
      x + w + bulge,
      springing + rise * 0.35,
      x + w * 0.72,
      y + h,
      cx,
      y + h,
    );
    p.bezierCurveTo(
      x + w * 0.28,
      y + h,
      x - bulge,
      springing + rise * 0.35,
      x,
      springing * 0.999,
    );
    p.closePath();
    return p;
  }
  // round arch
  p.moveTo(x, y);
  p.lineTo(x + w, y);
  p.lineTo(x + w, springing);
  p.absarc(cx, springing, w / 2, 0, Math.PI, false);
  p.closePath();
  return p;
}

/** Flat wall panel of the given face size, with its openings cut out. */
function wallShape(w: number, h: number, holes: THREE.Path[]) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h);
  s.lineTo(-w / 2, h);
  s.closePath();
  s.holes = holes;
  return s;
}

function gableShape(width: number, rise: number) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, 0);
  s.lineTo(width / 2, 0);
  s.lineTo(0, rise);
  s.closePath();
  return s;
}

/* ------------------------------------------------------------------ */
/* Openings                                                            */
/* ------------------------------------------------------------------ */

/** The glazing/door leaf and casing that sits inside a cut opening. */
function OpeningInfill({
  o,
  w,
  h,
  t,
}: {
  o: PlanOpening;
  w: number;
  h: number;
  t: number;
}) {
  const cols = Math.max(1, o.paneCols ?? 1);
  const rows = Math.max(1, o.paneRows ?? 1);
  const mullion = Math.min(w, h) * 0.05;
  const color = o.kind === "door" ? DOOR : GLASS;
  const arched = (o.shape ?? "rectangle") !== "rectangle";

  return (
    <group>
      {/* leaf / glazing set back inside the opening */}
      <mesh position={[0, 0, -t * 0.35]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial
          color={color}
          roughness={o.kind === "door" ? 0.6 : 0.15}
          metalness={o.kind === "door" ? 0 : 0.25}
          side={THREE.DoubleSide}
        />
      </mesh>
      {o.kind === "window" && !arched && (
        <>
          {Array.from({ length: cols - 1 }, (_, i) => (
            <mesh key={`c${i}`} position={[-w / 2 + (w * (i + 1)) / cols, 0, -t * 0.2]}>
              <boxGeometry args={[mullion, h, t * 0.25]} />
              <meshStandardMaterial color={TRIM} roughness={0.8} />
            </mesh>
          ))}
          {Array.from({ length: rows - 1 }, (_, i) => (
            <mesh key={`r${i}`} position={[0, -h / 2 + (h * (i + 1)) / rows, -t * 0.2]}>
              <boxGeometry args={[w, mullion, t * 0.25]} />
              <meshStandardMaterial color={TRIM} roughness={0.8} />
            </mesh>
          ))}
        </>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Masses                                                              */
/* ------------------------------------------------------------------ */

interface MassProps {
  mass: PlanMass;
  openings: PlanOpening[];
  features: PlanFeature[];
  /** Scale divisor: real-world inches -> model inches. */
  d: number;
  t: number;
  /** Footprint centre of the whole subject, in real-world inches. */
  originX: number;
  originZ: number;
}

/** Square teeth around the top of a mass. */
function Crenellation({ mass, d, t }: { mass: PlanMass; d: number; t: number }) {
  const teeth = useMemo(() => {
    const tooth = Math.max((mass.top.merlonWidthIn || 8) / d, t);
    const gap = Math.max((mass.top.merlonGapIn || 6) / d, t);
    const th = Math.max((mass.top.merlonHeightIn || mass.top.riseIn || 10) / d, t);
    const out: Array<{ pos: [number, number, number]; size: [number, number, number] }> = [];

    if (mass.kind === "cylinder") {
      const r = mass.diameterIn / d / 2;
      const pitch = tooth + gap;
      const count = Math.max(4, Math.round((Math.PI * 2 * r) / pitch));
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        out.push({
          pos: [Math.cos(a) * (r - t / 2), th / 2, Math.sin(a) * (r - t / 2)],
          size: [tooth, th, t],
        });
      }
      return { out, rotate: true, th };
    }

    const w = mass.widthIn / d;
    const dp = mass.depthIn / d;
    const run = (length: number) => {
      const pitch = tooth + gap;
      const count = Math.max(2, Math.floor(length / pitch));
      const start = -length / 2 + (length - (count * pitch - gap)) / 2 + tooth / 2;
      return Array.from({ length: count }, (_, i) => start + i * pitch);
    };
    for (const x of run(w)) {
      out.push({ pos: [x, th / 2, dp / 2 - t / 2], size: [tooth, th, t] });
      out.push({ pos: [x, th / 2, -dp / 2 + t / 2], size: [tooth, th, t] });
    }
    for (const z of run(dp)) {
      out.push({ pos: [w / 2 - t / 2, th / 2, z], size: [t, th, tooth] });
      out.push({ pos: [-w / 2 + t / 2, th / 2, z], size: [t, th, tooth] });
    }
    return { out, rotate: false, th };
  }, [mass, d, t]);

  return (
    <group>
      {teeth.out.map((m, i) => (
        <mesh
          key={i}
          position={m.pos}
          rotation-y={
            teeth.rotate ? -Math.atan2(m.pos[2], m.pos[0]) + Math.PI / 2 : 0
          }
          castShadow
        >
          <boxGeometry args={m.size} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

function BlockMass({ mass, openings, d, t, originX, originZ }: MassProps) {
  const w = mass.widthIn / d;
  const dp = mass.depthIn / d;
  const h = mass.heightIn / d;
  const rise = Math.max(mass.top.riseIn / d, 0);
  const top = mass.top.type;
  const gabled = top === "gable" && rise > 0.01;
  const shed = top === "shed" && rise > 0.01;
  const hipped = top === "hip" && rise > 0.01;
  const overhang = Math.max(mass.top.overhangIn / d, 0);
  const ridgeX = mass.top.ridgeAxis === "x";

  /** Openings grouped per face, as extrude holes. */
  const faces: Array<{
    face: FaceKey;
    width: number;
    position: [number, number, number];
    rotationY: number;
    color: string;
  }> = [
    { face: "front", width: w, position: [0, 0, dp / 2 - t / 2], rotationY: 0, color: WOOD },
    { face: "back", width: w, position: [0, 0, -dp / 2 + t / 2], rotationY: Math.PI, color: WOOD },
    { face: "left", width: dp, position: [-w / 2 + t / 2, 0, 0], rotationY: -Math.PI / 2, color: WOOD_DARK },
    { face: "right", width: dp, position: [w / 2 - t / 2, 0, 0], rotationY: Math.PI / 2, color: WOOD_DARK },
  ];

  const runToEave = ridgeX ? dp / 2 : w / 2;
  const slopeAngle = Math.atan2(rise, runToEave);
  const slopeLen = Math.sqrt(runToEave ** 2 + rise ** 2) + overhang;
  const halfRun = (slopeLen / 2) * Math.cos(slopeAngle);
  const halfRise = (slopeLen / 2) * Math.sin(slopeAngle);

  return (
    <group position={[mass.xIn / d - originX / d, mass.baseYIn / d, mass.zIn / d - originZ / d]} rotation-y={(mass.rotationDeg * Math.PI) / 180}>
      {faces.map((f) => {
        const faceOpenings = expandOpenings(openings.filter((o) => o.face === f.face));
        const holes = faceOpenings.map((o) =>
          openingPath(
            o,
            -f.width / 2 + o.xIn / d,
            o.yIn / d,
            o.widthIn / d,
            Math.min(o.heightIn / d, h - o.yIn / d),
          ),
        );
        return (
          <group key={f.face} position={f.position} rotation-y={f.rotationY}>
            <mesh castShadow receiveShadow position={[0, 0, -t / 2]}>
              <extrudeGeometry args={[wallShape(f.width, h, holes), { depth: t, bevelEnabled: false }]} />
              <meshStandardMaterial color={f.color} roughness={0.8} side={THREE.DoubleSide} />
            </mesh>
            {faceOpenings.map((o, i) => (
              <group
                key={i}
                position={[
                  -f.width / 2 + o.xIn / d + o.widthIn / d / 2,
                  o.yIn / d + Math.min(o.heightIn / d, h - o.yIn / d) / 2,
                  0,
                ]}
              >
                <OpeningInfill
                  o={o}
                  w={o.widthIn / d}
                  h={Math.min(o.heightIn / d, h - o.yIn / d)}
                  t={t}
                />
              </group>
            ))}
          </group>
        );
      })}

      {/* top treatment */}
      {(top === "flat" || top === "parapet") && (
        <mesh position={[0, h + t / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[w + overhang * 2, t, dp + overhang * 2]} />
          <meshStandardMaterial color={ROOF} roughness={0.9} />
        </mesh>
      )}
      {top === "parapet" && <group position={[0, h + t, 0]}><Crenellation mass={{ ...mass, top: { ...mass.top, merlonWidthIn: mass.widthIn, merlonGapIn: 0, merlonHeightIn: mass.top.riseIn } }} d={d} t={t} /></group>}
      {top === "crenellated" && (
        <>
          <mesh position={[0, h + t / 2, 0]} receiveShadow>
            <boxGeometry args={[w, t, dp]} />
            <meshStandardMaterial color={BASE} roughness={0.9} />
          </mesh>
          <group position={[0, h + t, 0]}>
            <Crenellation mass={mass} d={d} t={t} />
          </group>
        </>
      )}
      {gabled && (
        <>
          {[ridgeX ? 1 : 0].map(() => null)}
          {[1, -1].map((sign) => (
            <mesh
              key={sign}
              position={
                ridgeX
                  ? [0, h + rise - halfRise, sign * halfRun]
                  : [sign * halfRun, h + rise - halfRise, 0]
              }
              rotation-x={ridgeX ? sign * slopeAngle : 0}
              rotation-z={ridgeX ? 0 : -sign * slopeAngle}
              castShadow
            >
              <boxGeometry
                args={
                  ridgeX
                    ? [w + overhang * 2, t, slopeLen]
                    : [slopeLen, t, dp + overhang * 2]
                }
              />
              <meshStandardMaterial color={ROOF} roughness={0.9} />
            </mesh>
          ))}
          {/* gable end triangles close the walls under the ridge */}
          {[1, -1].map((sign) => (
            <mesh
              key={`g${sign}`}
              position={
                ridgeX
                  ? [sign * (w / 2 - t / 2), h, 0]
                  : [0, h, sign * (dp / 2 - t / 2)]
              }
              rotation-y={ridgeX ? Math.PI / 2 : 0}
              castShadow
            >
              <extrudeGeometry
                args={[gableShape(ridgeX ? dp : w, rise), { depth: t, bevelEnabled: false }]}
              />
              <meshStandardMaterial color={WOOD_DARK} roughness={0.8} />
            </mesh>
          ))}
        </>
      )}
      {shed && (
        <mesh
          position={[0, h + rise / 2, 0]}
          rotation-x={ridgeX ? slopeAngle / 1 : 0}
          rotation-z={ridgeX ? 0 : slopeAngle}
          castShadow
        >
          <boxGeometry args={[w + overhang * 2, t, dp + overhang * 2]} />
          <meshStandardMaterial color={ROOF} roughness={0.9} />
        </mesh>
      )}
      {hipped && (
        <mesh position={[0, h + rise / 2, 0]} castShadow>
          <coneGeometry args={[Math.max(w, dp) * 0.62, rise, 4, 1]} />
          <meshStandardMaterial color={ROOF} roughness={0.9} />
        </mesh>
      )}
      {top === "dome" && (
        <mesh position={[0, h, 0]} castShadow>
          <sphereGeometry args={[Math.min(w, dp) / 2, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={ROOF} roughness={0.6} />
        </mesh>
      )}
      {top === "cone" && (
        <mesh position={[0, h + rise / 2, 0]} castShadow>
          <coneGeometry args={[Math.min(w, dp) / 2, rise, 24]} />
          <meshStandardMaterial color={ROOF} roughness={0.8} />
        </mesh>
      )}
    </group>
  );
}

function CylinderMass({ mass, openings, d, t, originX, originZ }: MassProps) {
  const r = mass.diameterIn / d / 2;
  const h = mass.heightIn / d;
  const rise = Math.max(mass.top.riseIn / d, 0);
  const top = mass.top.type;
  const list = expandOpenings(openings);

  return (
    <group position={[mass.xIn / d - originX / d, mass.baseYIn / d, mass.zIn / d - originZ / d]}>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[r, r, h, 40, 1, true]} />
        <meshStandardMaterial color={WOOD} roughness={0.85} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, t / 2, 0]} receiveShadow>
        <cylinderGeometry args={[r, r, t, 40]} />
        <meshStandardMaterial color={BASE} roughness={0.9} />
      </mesh>

      {/* openings sit on the tower face, placed by angle */}
      {list.map((o, i) => {
        const a = ((o.angleDeg ?? 0) * Math.PI) / 180;
        const ow = Math.min(o.widthIn / d, r * 1.2);
        const oh = Math.min(o.heightIn / d, h - o.yIn / d);
        return (
          <group
            key={i}
            position={[Math.sin(a) * (r - t * 0.3), o.yIn / d + oh / 2, Math.cos(a) * (r - t * 0.3)]}
            rotation-y={a}
          >
            <mesh>
              <planeGeometry args={[ow, oh]} />
              <meshStandardMaterial
                color={o.kind === "door" ? DOOR : GLASS}
                roughness={0.25}
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>
        );
      })}

      {top === "crenellated" && (
        <>
          <mesh position={[0, h + t / 2, 0]} receiveShadow>
            <cylinderGeometry args={[r + t, r + t, t, 40]} />
            <meshStandardMaterial color={BASE} roughness={0.9} />
          </mesh>
          <group position={[0, h + t, 0]}>
            <Crenellation mass={mass} d={d} t={t} />
          </group>
        </>
      )}
      {top === "cone" && (
        <mesh position={[0, h + Math.max(rise, r) / 2, 0]} castShadow>
          <coneGeometry args={[r + t, Math.max(rise, r), 28]} />
          <meshStandardMaterial color={ROOF} roughness={0.8} />
        </mesh>
      )}
      {top === "dome" && (
        <mesh position={[0, h, 0]} castShadow>
          <sphereGeometry args={[r, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={ROOF} roughness={0.6} />
        </mesh>
      )}
      {(top === "flat" || top === "parapet" || top === "hip" || top === "gable" || top === "shed") && (
        <mesh position={[0, h + t / 2, 0]} castShadow>
          <cylinderGeometry args={[r + t * 0.5, r + t * 0.5, t, 40]} />
          <meshStandardMaterial color={ROOF} roughness={0.9} />
        </mesh>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Richer shape kinds                                                  */
/* ------------------------------------------------------------------ */

/** Battered / splayed volume: footprint changes from base to top. */
function TaperedMass({ mass, d, t, originX, originZ }: MassProps) {
  const w = mass.widthIn / d;
  const dp = mass.depthIn / d;
  const h = mass.heightIn / d;
  const topW = (mass.topWidthIn && mass.topWidthIn > 0 ? mass.topWidthIn : mass.widthIn) / d;
  const ratio = w > 0 ? topW / w : 1;
  const rise = Math.max(mass.top.riseIn / d, 0);
  const top = mass.top.type;

  return (
    <group
      position={[mass.xIn / d - originX / d, mass.baseYIn / d, mass.zIn / d - originZ / d]}
      rotation-y={(mass.rotationDeg * Math.PI) / 180}
    >
      <mesh position={[0, h / 2, 0]} scale={[w / Math.SQRT2, 1, dp / Math.SQRT2]} castShadow receiveShadow>
        <cylinderGeometry args={[ratio * Math.SQRT2 * 0.5, Math.SQRT2 * 0.5, h, 4, 1]} />
        <meshStandardMaterial color={WOOD} roughness={0.85} flatShading />
      </mesh>
      {top === "crenellated" && (
        <group position={[0, h, 0]}>
          <Crenellation mass={{ ...mass, widthIn: topW * d, depthIn: dp * d * ratio }} d={d} t={t} />
        </group>
      )}
      {top === "cone" && (
        <mesh position={[0, h + Math.max(rise, topW / 2) / 2, 0]} castShadow>
          <coneGeometry args={[topW / 2, Math.max(rise, topW / 2), 24]} />
          <meshStandardMaterial color={ROOF} roughness={0.8} />
        </mesh>
      )}
      {(top === "flat" || top === "parapet") && (
        <mesh position={[0, h + t / 2, 0]} castShadow>
          <boxGeometry args={[topW, t, dp * ratio]} />
          <meshStandardMaterial color={ROOF} roughness={0.9} />
        </mesh>
      )}
    </group>
  );
}

/** Polygonal tower or bay. */
function PrismMass({ mass, d, t, originX, originZ }: MassProps) {
  const sides = Math.max(3, Math.min(mass.sides ?? 6, 16));
  const r = (mass.diameterIn || mass.widthIn) / d / 2;
  const h = mass.heightIn / d;
  const rise = Math.max(mass.top.riseIn / d, 0);
  const top = mass.top.type;

  return (
    <group
      position={[mass.xIn / d - originX / d, mass.baseYIn / d, mass.zIn / d - originZ / d]}
      rotation-y={(mass.rotationDeg * Math.PI) / 180}
    >
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[r, r, h, sides, 1]} />
        <meshStandardMaterial color={WOOD} roughness={0.85} flatShading />
      </mesh>
      {top === "cone" && (
        <mesh position={[0, h + Math.max(rise, r) / 2, 0]} castShadow>
          <coneGeometry args={[r + t, Math.max(rise, r), sides]} />
          <meshStandardMaterial color={ROOF} roughness={0.8} flatShading />
        </mesh>
      )}
      {top === "dome" && (
        <mesh position={[0, h, 0]} castShadow>
          <sphereGeometry args={[r, sides * 2, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={ROOF} roughness={0.6} />
        </mesh>
      )}
      {top === "crenellated" && (
        <group position={[0, h, 0]}>
          <Crenellation mass={mass} d={d} t={t} />
        </group>
      )}
      {(top === "flat" || top === "parapet" || top === "hip") && (
        <mesh position={[0, h + t / 2, 0]} castShadow>
          <cylinderGeometry args={[r + t * 0.5, r + t * 0.5, t, sides]} />
          <meshStandardMaterial color={ROOF} roughness={0.9} flatShading />
        </mesh>
      )}
    </group>
  );
}

/** Revolved silhouette: dome, turret cap, baluster, urn, column. */
function SweptMass({ mass, d, t, originX, originZ }: MassProps) {
  const geometry = useMemo(() => {
    const pts = (mass.profile ?? [])
      .map((p) => new THREE.Vector2(Math.max(Math.abs(p.xIn) / d, 0.0005), p.yIn / d))
      .sort((a, b) => a.y - b.y);
    if (pts.length < 2) {
      const r = Math.max(mass.diameterIn / d / 2, 0.01);
      const h = Math.max(mass.heightIn / d, 0.01);
      pts.push(new THREE.Vector2(r, 0), new THREE.Vector2(r, h * 0.6), new THREE.Vector2(r * 0.2, h));
    }
    return new THREE.LatheGeometry(pts, 40);
  }, [mass, d]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <group position={[mass.xIn / d - originX / d, mass.baseYIn / d, mass.zIn / d - originZ / d]}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial color={WOOD} roughness={0.7} side={THREE.DoubleSide} />
      </mesh>
      {mass.top.type === "cone" && (
        <mesh position={[0, mass.heightIn / d + t, 0]} castShadow>
          <coneGeometry args={[t * 1.5, t * 4, 16]} />
          <meshStandardMaterial color={ROOF} roughness={0.7} />
        </mesh>
      )}
    </group>
  );
}

/** Drawn cross-section pushed along the mass width: cornice, sill, ridge cap. */
function ExtrudedMass({ mass, d, originX, originZ }: MassProps) {
  const shape = useMemo(() => {
    const pts = mass.profile ?? [];
    const s = new THREE.Shape();
    if (pts.length < 3) {
      const hh = Math.max(mass.heightIn / d, 0.02);
      const pp = Math.max(mass.depthIn / d, 0.02);
      s.moveTo(0, 0);
      s.lineTo(pp, 0);
      s.lineTo(pp * 0.5, hh);
      s.lineTo(0, hh);
      s.closePath();
      return s;
    }
    s.moveTo(pts[0]!.xIn / d, pts[0]!.yIn / d);
    for (const p of pts.slice(1)) s.lineTo(p.xIn / d, p.yIn / d);
    s.closePath();
    return s;
  }, [mass, d]);

  const length = Math.max(mass.widthIn / d, 0.02);

  return (
    <group
      position={[mass.xIn / d - originX / d, mass.baseYIn / d, mass.zIn / d - originZ / d]}
      rotation-y={(mass.rotationDeg * Math.PI) / 180}
    >
      <mesh position={[-length / 2, 0, 0]} rotation-y={Math.PI / 2} castShadow receiveShadow>
        <extrudeGeometry args={[shape, { depth: length, bevelEnabled: false }]} />
        <meshStandardMaterial color={TRIM} roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** Arcade wall: a block whose face carries repeated arched bays. */
function ArchBlockMass(props: MassProps) {
  const { mass, openings } = props;
  const bays = Math.max(0, Math.round(mass.bayCount ?? 0));
  const synthesized: PlanOpening[] = useMemo(() => {
    if (bays < 1) return [];
    const bw = mass.bayWidthIn && mass.bayWidthIn > 0 ? mass.bayWidthIn : mass.widthIn / (bays * 1.6);
    const bh =
      mass.bayHeightIn && mass.bayHeightIn > 0 ? mass.bayHeightIn : mass.heightIn * 0.6;
    const pitch = mass.widthIn / bays;
    return Array.from({ length: bays }, (_, i) => ({
      face: "front" as FaceKey,
      kind: "window" as const,
      label: `${mass.name} bay ${i + 1}`,
      xIn: pitch * i + (pitch - bw) / 2,
      yIn: Math.max((mass.heightIn - bh) * 0.15, 0),
      widthIn: bw,
      heightIn: bh,
      paneCols: 1,
      paneRows: 1,
      trimNote: "",
      massId: mass.id,
      shape: mass.bayShape ?? "round-arch",
      archRiseIn: bw / 2,
      recessIn: 0,
      repeatCount: 1,
      repeatSpacingIn: 0,
      angleDeg: 0,
    }));
  }, [mass, bays]);

  return <BlockMass {...props} openings={[...openings, ...synthesized]} />;
}


/** Courses, cornices, buttresses and other banded features. */
function Features({
  features,
  masses,
  d,
  t,
  originX,
  originZ,
}: {
  features: PlanFeature[];
  masses: PlanMass[];
  d: number;
  t: number;
  originX: number;
  originZ: number;
}) {
  return (
    <>
      {features.map((f) => {
        const mass = masses.find((m) => m.id === f.massId) ?? masses[0];
        if (!mass || f.type === "crenellation") return null;
        const w = mass.kind === "cylinder" ? mass.diameterIn / d : mass.widthIn / d;
        const dp = mass.kind === "cylinder" ? mass.diameterIn / d : mass.depthIn / d;
        const y = f.yIn / d;
        const proj = Math.max(f.projectionIn / d, t * 0.4);
        const hgt = Math.max(f.heightIn / d, t * 0.6);
        const cx = mass.xIn / d - originX / d;
        const cz = mass.zIn / d - originZ / d;

        if (f.type === "string-course" || f.type === "banding" || f.type === "cornice") {
          return (
            <group key={f.id} position={[cx, y + mass.baseYIn / d, cz]}>
              {mass.kind === "cylinder" ? (
                <mesh castShadow>
                  <cylinderGeometry args={[w / 2 + proj, w / 2 + proj, hgt, 40, 1, true]} />
                  <meshStandardMaterial color={TRIM} roughness={0.8} side={THREE.DoubleSide} />
                </mesh>
              ) : (
                <mesh castShadow>
                  <boxGeometry args={[w + proj * 2, hgt, dp + proj * 2]} />
                  <meshStandardMaterial color={TRIM} roughness={0.8} />
                </mesh>
              )}
            </group>
          );
        }

        if (f.type === "steps") {
          const count = Math.max(2, Math.min(f.count, 12));
          const treadDepth = Math.max(proj / count, t * 0.5);
          return (
            <group key={f.id} position={[cx, mass.baseYIn / d, cz + dp / 2]}>
              {Array.from({ length: count }, (_, i) => (
                <mesh
                  key={i}
                  position={[0, (hgt / count) * (i + 0.5), treadDepth * (count - i - 0.5)]}
                  castShadow
                >
                  <boxGeometry args={[Math.max(f.widthIn / d, w * 0.3), hgt / count, treadDepth]} />
                  <meshStandardMaterial color={BASE} roughness={0.9} />
                </mesh>
              ))}
            </group>
          );
        }

        if (f.type === "buttress" || f.type === "column") {
          const count = Math.max(1, Math.min(f.count, 20));
          const pitch = f.spacingIn > 0 ? f.spacingIn / d : w / (count + 1);
          const startX = -((count - 1) * pitch) / 2;
          return (
            <group key={f.id} position={[cx, mass.baseYIn / d, cz]}>
              {Array.from({ length: count }, (_, i) => (
                <mesh
                  key={i}
                  position={[startX + i * pitch, hgt / 2 + y, dp / 2 + proj / 2]}
                  castShadow
                >
                  <boxGeometry args={[Math.max(f.widthIn / d, t * 2), hgt, proj]} />
                  <meshStandardMaterial color={WOOD_DARK} roughness={0.85} />
                </mesh>
              ))}
            </group>
          );
        }

        if (f.type === "chimney") {
          return (
            <mesh
              key={f.id}
              position={[cx + f.xIn / d, mass.baseYIn / d + y + hgt / 2, cz]}
              castShadow
            >
              <boxGeometry args={[Math.max(f.widthIn / d, t * 3), hgt, Math.max(proj, t * 3)]} />
              <meshStandardMaterial color={WOOD_DARK} roughness={0.9} />
            </mesh>
          );
        }

        return null;
      })}
    </>
  );
}

function Subject({ model, scale, thicknessIn }: Props) {
  const d = resolveDenominator(model, scale);
  const masses = useMemo(() => ensureMasses(model), [model]);
  const bounds = useMemo(() => massBounds(masses), [masses]);
  const t = Math.max(thicknessIn, 0.04);
  const originX = (bounds.minX + bounds.maxX) / 2;
  const originZ = (bounds.minZ + bounds.maxZ) / 2;
  const height = bounds.maxY / d;
  const footW = bounds.widthIn / d;
  const footD = bounds.depthIn / d;

  return (
    <group position={[0, -height / 2, 0]}>
      {/* base plate under everything */}
      <mesh position={[0, -t / 2, 0]} receiveShadow>
        <boxGeometry args={[footW + t * 4, t, footD + t * 4]} />
        <meshStandardMaterial color={BASE} roughness={0.9} />
      </mesh>

      {masses.map((m) => {
        const openings = model.openings.filter((o) =>
          o.massId ? o.massId === m.id : m === masses.reduce((a, b) => (b.widthIn * b.heightIn > a.widthIn * a.heightIn ? b : a), masses[0]!),
        );
        const props: MassProps = {
          mass: m,
          openings,
          features: model.features.filter((f) => f.massId === m.id),
          d,
          t,
          originX,
          originZ,
        };
        return m.kind === "cylinder" ? (
          <CylinderMass key={m.id} {...props} />
        ) : (
          <BlockMass key={m.id} {...props} />
        );
      })}

      <Features
        features={model.features}
        masses={masses}
        d={d}
        t={t}
        originX={originX}
        originZ={originZ}
      />
    </group>
  );
}

/** Interactive 3D mock-up of the finished miniature, built from the same plan data. */
export function PlanPreview3D({ model, scale, thicknessIn }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const d = resolveDenominator(model, scale);
  const bounds = massBounds(ensureMasses(model));
  const span = Math.max(bounds.widthIn / d, bounds.depthIn / d, bounds.maxY / d, 1);

  if (!mounted) {
    return (
      <div className="flex h-[460px] items-center justify-center rounded-md border border-border bg-card">
        <span className="tech-label text-muted-foreground">Loading 3D view…</span>
      </div>
    );
  }

  return (
    <div className="h-[460px] overflow-hidden rounded-md border border-border bg-card">
      <Canvas shadows dpr={[1, 2]} camera={{ position: [span * 1.05, span * 0.8, span * 1.35], fov: 42 }}>
        <color attach="background" args={["#f2ece0"]} />
        <ambientLight intensity={0.6} />
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
          <Subject model={model} scale={scale} thicknessIn={thicknessIn} />
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
          minDistance={span * 0.8}
          maxDistance={span * 6}
          maxPolarAngle={Math.PI / 2.05}
          autoRotate
          autoRotateSpeed={0.7}
        />
      </Canvas>
    </div>
  );
}
