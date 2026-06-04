import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class CardService {
  constructor(private http: HttpClient) {}

  deleteCard(id: number): Observable<void> {
    return this.http.delete<void>(`/api/cards/${id}`);
  }
}
