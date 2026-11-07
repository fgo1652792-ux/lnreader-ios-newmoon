export const CARD_GAP = 10;
export const CARD_ESTIMATED_HEIGHT = 76;
export const WIDE_LAYOUT_MIN_WIDTH = 768;
export const WIDE_LAYOUT_COLUMNS = 2;
export const WIDE_LAYOUT_MAX_CONTENT_WIDTH = 900;

/** Number of card columns for the browse lists: 2 on wide (iPad) screens. */
export const getBrowseColumns = (windowWidth: number): 1 | 2 =>
  windowWidth >= WIDE_LAYOUT_MIN_WIDTH ? WIDE_LAYOUT_COLUMNS : 1;
