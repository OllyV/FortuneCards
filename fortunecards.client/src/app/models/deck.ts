import { Card } from './card';

export interface Deck {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
  emoji: string;
  colorIndex: number;
  cardBackImageUrl: string | null;
  cardCount?: number;
  cards?: Card[];
}

export interface CreateDeckPayload {
  name: string;
  description: string | null;
  emoji: string;
  colorIndex: number;
  cardBackImage?: File;
}
