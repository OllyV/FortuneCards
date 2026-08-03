import { PagedResult } from './deck';

export type { PagedResult };

export interface PatternCard {
  id?: number;
  text: string;
  order: number;
  x: number;
  y: number;
  rotation: number;
}

/** A pattern card being edited: carries a stable client id for tracking + table targeting. */
export interface EditablePatternCard {
  id: string;
  text: string;
  order: number;
  x: number;
  y: number;
  rotation: number;
}

export interface Pattern {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
  cardCount?: number;
  cards?: PatternCard[];
  emoji: string;
  colorIndex: number;
  isPublic: boolean;
  isOwner: boolean;
  isFavorite: boolean;
  cardSizePercent?: number;
  tableHeightPercent?: number;
}

export interface CreatePatternPayload {
  name: string;
  description: string | null;
  emoji: string;
  colorIndex: number;
  isPublic: boolean;
}

export interface UpdatePatternPayload {
  name?: string;
  description?: string | null;
  emoji?: string;
  colorIndex?: number;
  isPublic?: boolean;
  cardSizePercent?: number;
  tableHeightPercent?: number;
}
