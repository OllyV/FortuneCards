import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Card } from '../models/card';
import { CreateDeckPayload, Deck } from '../models/deck';

@Injectable({ providedIn: 'root' })
export class DeckService {
  private readonly base = '/api/decks';

  constructor(private http: HttpClient) {}

  getDecks(): Observable<Deck[]> {
    return this.http.get<Deck[]>(this.base);
  }

  getDeck(id: number): Observable<Deck> {
    return this.http.get<Deck>(`${this.base}/${id}`);
  }

  createDeck(payload: CreateDeckPayload): Observable<Deck> {
    return this.http.post<Deck>(this.base, payload);
  }

  deleteDeck(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  addCard(deckId: number, title: string, description: string, image: File): Observable<Card> {
    const form = new FormData();
    form.append('title', title);
    form.append('description', description);
    form.append('image', image, image.name);
    return this.http.post<Card>(`${this.base}/${deckId}/cards`, form);
  }

  getRandomCard(deckId: number): Observable<Card> {
    return this.http.get<Card>(`${this.base}/${deckId}/random`);
  }
}
