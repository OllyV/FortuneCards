import { Card } from './card';

export interface Deck {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
  emoji: string;
  colorIndex: number;
  cardBackImageUrl: string | null;
  aspectWidth: number;
  aspectHeight: number;
  cardCount?: number;
  cards?: Card[];
  isPublic: boolean;
  isOwner: boolean;
  isFavorite: boolean;
}

export interface CreateDeckPayload {
  name: string;
  description: string | null;
  emoji: string;
  colorIndex: number;
  aspectWidth: number;
  aspectHeight: number;
  isPublic: boolean;
  cardBackImage?: File;
}
