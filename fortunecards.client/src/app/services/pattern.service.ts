import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  CreatePatternPayload,
  Pattern,
  PatternCard,
  UpdatePatternPayload,
  PagedResult,
} from '../models/pattern';

@Injectable({ providedIn: 'root' })
export class PatternService {
  private readonly base = '/api/patterns';
  private readonly http = inject(HttpClient);

  getPublicPatterns(search: string, page: number, pageSize: number): Observable<PagedResult<Pattern>> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (search) {
      params = params.set('search', search);
    }
    return this.http.get<PagedResult<Pattern>>(`${this.base}/public`, { params });
  }

  getMyPatterns(): Observable<Pattern[]> {
    return this.http.get<Pattern[]>(`${this.base}/mine`);
  }

  getPattern(id: number): Observable<Pattern> {
    return this.http.get<Pattern>(`${this.base}/${id}`);
  }

  createPattern(payload: CreatePatternPayload): Observable<Pattern> {
    return this.http.post<Pattern>(this.base, payload);
  }

  updatePattern(id: number, payload: UpdatePatternPayload): Observable<Pattern> {
    return this.http.patch<Pattern>(`${this.base}/${id}`, payload);
  }

  deletePattern(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  saveCards(id: number, cards: PatternCard[]): Observable<Pattern> {
    return this.http.put<Pattern>(`${this.base}/${id}/cards`, { cards });
  }

  addFavorite(id: number): Observable<void> {
    return this.http.put<void>(`${this.base}/${id}/favorite`, {});
  }

  removeFavorite(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}/favorite`);
  }
}
