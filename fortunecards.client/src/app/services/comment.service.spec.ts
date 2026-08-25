import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { CommentService } from './comment.service';
import { CommentTargetType } from '../models/comment';

describe('CommentService', () => {
  let service: CommentService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        CommentService,
      ],
    });
    service = TestBed.inject(CommentService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('GETs /api/comments with target params', () => {
    service.list(CommentTargetType.Deck, 5, 1, 20).subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/comments');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('targetType')).toBe('0');
    expect(req.request.params.get('targetId')).toBe('5');
    req.flush({ items: [], totalCount: 0, page: 1, pageSize: 20 });
  });

  it('POSTs a reply with parentCommentId', () => {
    service.create({ targetType: CommentTargetType.Card, targetId: 9, parentCommentId: 3, body: 'hi' }).subscribe();
    const req = httpMock.expectOne('/api/comments');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ targetType: 1, targetId: 9, parentCommentId: 3, body: 'hi' });
    req.flush({});
  });

  it('PATCHes a comment body', () => {
    service.update(4, 'edited').subscribe();
    const req = httpMock.expectOne('/api/comments/4');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ body: 'edited' });
    req.flush({});
  });

  it('DELETEs a comment', () => {
    service.remove(4).subscribe();
    const req = httpMock.expectOne('/api/comments/4');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('GETs /api/comments/mine', () => {
    service.listMine(1, 20).subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/comments/mine');
    expect(req.request.method).toBe('GET');
    req.flush({ items: [], totalCount: 0, page: 1, pageSize: 20 });
  });

  it('POSTs to restore a comment', () => {
    service.restore(4).subscribe();
    const req = httpMock.expectOne('/api/comments/4/restore');
    expect(req.request.method).toBe('POST');
    req.flush(null);
  });
});
