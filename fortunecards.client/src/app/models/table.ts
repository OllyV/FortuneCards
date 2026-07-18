export type TableColor = 'beige' | 'pink' | 'yellow' | 'dark-red';

interface TableItemBase {
  id: string;
  /** Card top-left X, in % of table width. */
  x: number;
  /** Card top-left Y, in % of table width (width, not height — keeps all geometry in one unit). */
  y: number;
  /** Rotation in degrees, clockwise. */
  rotation: number;
  /** Stacking order; higher sits in front. Unset until the card is first selected. */
  z?: number;
}

export interface TableDeckCard extends TableItemBase {
  kind: 'deck';
  /** false = back face up (default for freshly placed cards), true = front face up. */
  flipped: boolean;
  deckId: number;
  cardId: number;
  /** Deck colour index — used for the gradient fallback back face. */
  colorIndex: number;
  /** Deck aspect ratio, copied at placement time; drives card shape and table geometry. */
  aspectWidth: number;
  aspectHeight: number;
  /** Card image (front face). */
  frontImageUrl: string;
  /** Deck back image; null → render the deck gradient instead. */
  backImageUrl: string | null;
  /** Card title, shown in the info dialog. */
  title: string;
  /** Card description, shown in the info dialog. */
  description: string;
  /**
   * The answered pattern question this card was dealt onto, as `"{order}. {text}"`
   * (e.g. "1. Position 1"). Undefined until the card is placed on a pattern slot;
   * cleared whenever the deck is (re)placed.
   */
  patternText?: string;
}

export interface TablePatternCard extends TableItemBase {
  kind: 'pattern';
  text: string;
  order: number;
  locked: boolean;
}

export type TableItem = TableDeckCard | TablePatternCard;
