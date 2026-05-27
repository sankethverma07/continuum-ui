/**
 * Client-side mirror of ingest's timelineFor(). Kept in sync so a catalog
 * entry's tier count maps to the same cadence whether we're generating
 * assets server-side or replaying them in the browser.
 */

const DOHERTY_CEILING_MS = 700;
const HARD_CEILING_MS = 3200;

export interface TimelineStep {
  readonly tier: number;
  readonly atMs: number;
}

export const timelineFor = (tierCount: number): ReadonlyArray<TimelineStep> => {
  // Clamp between 3 and 8. The upper bound used to be 7 (matching the 5-tier
  // icosahedron subdivision axis), but the mesh sim now layers *texture*,
  // *reflection*, and *decal* tiers on top of geometry, so 8 is the true
  // polish ceiling. Past that, extra tiers just compress the Doherty cadence
  // with no perceived gain.
  const clamped = Math.max(3, Math.min(8, tierCount));
  const rawTotal = DOHERTY_CEILING_MS * (clamped - 1);
  const scale = rawTotal > HARD_CEILING_MS ? HARD_CEILING_MS / rawTotal : 1;
  const stepMs = DOHERTY_CEILING_MS * scale;
  return Array.from({ length: clamped }, (_, i) => ({
    tier: i,
    atMs: Math.round(i * stepMs),
  }));
};

/** Total hydration duration for a given tier count, in ms. */
export const totalDurationMs = (tierCount: number): number => {
  const schedule = timelineFor(tierCount);
  return schedule[schedule.length - 1]?.atMs ?? 0;
};
