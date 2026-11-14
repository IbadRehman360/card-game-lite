/**
 * Screen-space anchors for the seat name tags. The stage projects each player's chest onto the
 * screen every frame and moves the registered tag there, so the tags follow the camera exactly.
 */
export const seatTags: Partial<Record<number, HTMLElement | null>> = {};
