import { LIBRARY_CONFIG } from "./config";

/**
 * Which cards own GPU resources (a mesh and a texture). A card wakes when it
 * comes near the screen and sleeps only once it is well away (hysteresis, so
 * a card at the edge does not flicker between the two), and at most
 * MAX_AWAKE are awake; past that the farthest from the screen sleep first.
 * Positions are document space (CSS px from the top of the page).
 */
export type WakeCard = { id: string; top: number; bottom: number };

export function awakeCards(
  cards: readonly WakeCard[],
  awake: ReadonlySet<string>,
  scrollTop: number,
  viewportHeight: number,
  config: { WAKE_ABOVE: number; WAKE_BELOW: number; SLEEP_ABOVE: number; SLEEP_BELOW: number; MAX_AWAKE: number } = LIBRARY_CONFIG.wake,
): Set<string> {
  const view = { top: scrollTop, bottom: scrollTop + viewportHeight };
  const near = (c: WakeCard, above: number, below: number) =>
    c.bottom > view.top - above * viewportHeight && c.top < view.bottom + below * viewportHeight;

  const chosen = cards.filter((c) =>
    awake.has(c.id) ? near(c, config.SLEEP_ABOVE, config.SLEEP_BELOW) : near(c, config.WAKE_ABOVE, config.WAKE_BELOW),
  );
  if (chosen.length > config.MAX_AWAKE) {
    const centre = (view.top + view.bottom) / 2;
    const distance = (c: WakeCard) => Math.max(0, c.top - centre, centre - c.bottom);
    chosen.sort((a, b) => distance(a) - distance(b));
    chosen.length = config.MAX_AWAKE;
  }
  return new Set(chosen.map((c) => c.id));
}
