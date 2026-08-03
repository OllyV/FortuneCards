import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PatternService } from './pattern.service';

describe('PatternService', () => {
  let service: PatternService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        PatternService,
      ],
    });
    service = TestBed.inject(PatternService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getPublicPatterns builds a paged query with search', () => {
    service.getPublicPatterns('tea', 2, 12).subscribe();
    const req = http.expectOne('/api/patterns/public?page=2&pageSize=12&search=tea');
    expect(req.request.method).toBe('GET');
    req.flush({ items: [], totalCount: 0, page: 2, pageSize: 12 });
  });

  it('createPattern POSTs a JSON body', () => {
    service.createPattern({ name: 'P', description: null, emoji: '🔮', colorIndex: 3, isPublic: true }).subscribe();
    const req = http.expectOne('/api/patterns');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'P', description: null, emoji: '🔮', colorIndex: 3, isPublic: true });
    req.flush({});
  });

  it('saveCards PUTs a { cards } JSON body', () => {
    const cards = [{ text: 'Q1', order: 1, x: 5, y: 5, rotation: 0 }];
    service.saveCards(7, cards).subscribe();
    const req = http.expectOne('/api/patterns/7/cards');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ cards });
    req.flush({});
  });

  it('addFavorite PUTs and removeFavorite DELETEs', () => {
    service.addFavorite(4).subscribe();
    const add = http.expectOne('/api/patterns/4/favorite');
    expect(add.request.method).toBe('PUT');
    add.flush(null);

    service.removeFavorite(4).subscribe();
    const del = http.expectOne('/api/patterns/4/favorite');
    expect(del.request.method).toBe('DELETE');
    del.flush(null);
  });
});
