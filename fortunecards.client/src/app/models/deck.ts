import { Card } from './card';

export interface Deck {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
  cardCount?: number;
  cards?: Card[];
}

export interface CreateDeckPayload {
  name: string;
  description: string | null;
}
