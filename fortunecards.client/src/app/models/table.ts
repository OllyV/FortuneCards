export type TableColor = 'beige' | 'pink' | 'yellow' | 'dark-red';

interface TableItemBase {
  id: string;
  /** Card top-left X, in % of table width. */
  x: number;
  /** Card top-left Y, in % of table width (width, not height — keeps all geometry in one unit). */
  y: number;
  /** Rotation in degrees, clockwise. */
  rotation: number;
}

export interface TableDeckCard extends TableItemBase {
  kind: 'deck';
  /** false = back face up (default), true = front face up. */
  flipped: boolean;
  /** Reserved for the deferred manual-pick link to a pattern slot; unused for now. */
  patternId?: string;
}

export interface TablePatternCard extends TableItemBase {
  kind: 'pattern';
  text: string;
  order: number;
  locked: boolean;
}

export type TableItem = TableDeckCard | TablePatternCard;
