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
    return this.http.post<Deck>(this.base, this.buildDeckForm(payload));
  }

  updateDeck(id: number, payload: CreateDeckPayload): Observable<Deck> {
    return this.http.patch<Deck>(`${this.base}/${id}`, this.buildDeckForm(payload));
  }

  deleteDeck(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  addFavorite(id: number): Observable<void> {
    return this.http.put<void>(`${this.base}/${id}/favorite`, {});
  }

  removeFavorite(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}/favorite`);
  }

  addCard(deckId: number, title: string, description: string, image: File): Observable<Card> {
    const form = new FormData();
    form.append('title', title);
    form.append('description', description);
    form.append('image', image, image.name);
    return this.http.post<Card>(`${this.base}/${deckId}/cards`, form);
  }

  private buildDeckForm(payload: CreateDeckPayload): FormData {
    const form = new FormData();
    form.append('name', payload.name);
    form.append('description', payload.description ?? '');
    form.append('emoji', payload.emoji);
    form.append('colorIndex', payload.colorIndex.toString());
    form.append('aspectWidth', payload.aspectWidth.toString());
    form.append('aspectHeight', payload.aspectHeight.toString());
    form.append('isPublic', payload.isPublic.toString());
    if (payload.cardBackImage) {
      form.append('cardBackImage', payload.cardBackImage, payload.cardBackImage.name);
    }
    return form;
  }
}
