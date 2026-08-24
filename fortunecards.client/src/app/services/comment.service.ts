import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { PagedResult } from '../models/deck';
import { CommentDto, CommentTargetType, CreateCommentInput, MyCommentDto } from '../models/comment';

@Injectable({ providedIn: 'root' })
export class CommentService {
  private readonly base = '/api/comments';
  private readonly http = inject(HttpClient);

  list(targetType: CommentTargetType, targetId: number, page = 1, pageSize = 20): Observable<PagedResult<CommentDto>> {
    const params = new HttpParams()
      .set('targetType', targetType)
      .set('targetId', targetId)
      .set('page', page)
      .set('pageSize', pageSize);
    return this.http.get<PagedResult<CommentDto>>(this.base, { params });
  }

  listMine(page = 1, pageSize = 20): Observable<PagedResult<MyCommentDto>> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.http.get<PagedResult<MyCommentDto>>(`${this.base}/mine`, { params });
  }

  create(input: CreateCommentInput): Observable<CommentDto> {
    return this.http.post<CommentDto>(this.base, {
      targetType: input.targetType,
      targetId: input.targetId,
      parentCommentId: input.parentCommentId ?? null,
      body: input.body,
    });
  }

  update(id: number, body: string): Observable<CommentDto> {
    return this.http.patch<CommentDto>(`${this.base}/${id}`, { body });
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
