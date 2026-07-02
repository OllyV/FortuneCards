import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Card } from '../models/card';

@Injectable({ providedIn: 'root' })
export class CardService {
  constructor(private http: HttpClient) {}

  deleteCard(id: number): Observable<void> {
    return this.http.delete<void>(`/api/cards/${id}`);
  }

  updateCard(id: number, title: string, description: string, image?: File): Observable<Card> {
    const form = new FormData();
    form.append('title', title);
    form.append('description', description);
    if (image) form.append('image', image, image.name);
    return this.http.patch<Card>(`/api/cards/${id}`, form);
  }
}
