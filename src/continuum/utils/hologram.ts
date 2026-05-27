/**
 * Hologram reveal — shared utility for the "Iron Man HUD materialisation"
 * effect used anywhere a wireframe fades in.
 *
 *   hologramBoot(t)        — flicker-rise curve across the boot window
 *   HOLOGRAM_BOOT_MS       — recommended pre-phase duration
 *   HOLOGRAM_SCALE_BULGE   — recommended starting scale factor
 *
 * The curve is a hand-tuned keyframe chain that reads as two quick flashes,
 * a brighter third strike, then a micro-settle into a stable peak.
 * Consumers drive a per-component fBoot variable (0 → 1) on a wall-clock
 * timer and pass it to `hologramBoot` each frame, multiplying the result
 * into wireframe opacities.
 *
 * IMPORTANT: this is engine code, not per-asset authoring. Wire it into
 * your component's useFrame once and every wireframe it manages gets the
 * same materialisation feel.
 */

/**
 * Recommended wall-clock duration of the boot phase, in milliseconds.
 * Long enough for the two flashes + settle to read cinematically; short
 * enough that the total reveal still fits under the Doherty threshold.
 */
export const HOLOGRAM_BOOT_MS = 550;

/**
 * Recommended uniform-scale factor at boot start (t = 0). Linearly eases
 * to 1.0 as boot completes. The "resolving into form" feel comes from
 * starting slightly oversized and compressing.
 */
export const HOLOGRAM_SCALE_BULGE = 0.04;

/**
 * Keyframe chain: [t (0..1), opacityMultiplier (0..1)].
 * Cubic ease between keyframes for smoothness.
 */
const HOLOGRAM_KEYFRAMES: ReadonlyArray<readonly [number, number]> = [
  [0.00, 0.00],
  [0.06, 0.00],
  [0.10, 0.45],   // first flash — a brief strike
  [0.16, 0.10],   // dim, almost off
  [0.22, 0.75],   // second flash, brighter
  [0.30, 0.30],   // dim
  [0.44, 0.90],   // near-full flash
  [0.52, 0.55],   // settle wobble
  [0.70, 0.98],
  [0.82, 0.88],   // micro-settle
  [1.00, 1.00],   // stable
];

/**
 * Evaluate the hologram boot curve at normalised time `t` in [0, 1].
 * Returns an opacity multiplier in [0, 1]. Clamped outside the window.
 */
export const hologramBoot = (t: number): number => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  for (let i = 0; i < HOLOGRAM_KEYFRAMES.length - 1; i++) {
    const [t0, v0] = HOLOGRAM_KEYFRAMES[i]!;
    const [t1, v1] = HOLOGRAM_KEYFRAMES[i + 1]!;
    if (t >= t0 && t <= t1) {
      const u = (t - t0) / Math.max(1e-6, t1 - t0);
      const e = u * u * (3 - 2 * u);
      return v0 + (v1 - v0) * e;
    }
  }
  return 1;
};

/**
 * Uniform scale factor at a given boot progress `t` in [0, 1].
 * Starts at (1 + HOLOGRAM_SCALE_BULGE), lands at 1.0.
 */
export const hologramBootScale = (t: number): number => {
  const tt = Math.min(1, Math.max(0, t));
  return 1 + HOLOGRAM_SCALE_BULGE * (1 - tt);
};
