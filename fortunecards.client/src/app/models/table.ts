export type TableColor = 'beige' | 'pink' | 'yellow' | 'dark-red';

export interface TableCardState {
  id: string;
  /** Card top-left X, in % of table width. */
  x: number;
  /** Card top-left Y, in % of table width (width, not height — keeps all geometry in one unit). */
  y: number;
  /** Rotation in degrees, clockwise. */
  rotation: number;
  /** false = back face up (default), true = front face up. */
  flipped: boolean;
}
