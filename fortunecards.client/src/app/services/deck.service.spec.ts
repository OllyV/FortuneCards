import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { DeckService } from './deck.service';
import { CreateDeckPayload, Deck, PagedResult } from '../models/deck';

describe('DeckService', () => {
  let service: DeckService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        DeckService,
      ],
    });
    service = TestBed.inject(DeckService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should PATCH /api/decks/:id with FormData including isPublic', () => {
    const payload: CreateDeckPayload = {
      name: 'Updated', description: 'New desc', emoji: '🌟', colorIndex: 2, isPublic: true, aspectWidth: 4, aspectHeight: 7,
    };
    service.updateDeck(7, payload).subscribe();

    const req = httpMock.expectOne('/api/decks/7');
    expect(req.request.method).toBe('PATCH');
    const body = req.request.body as FormData;
    expect(body.get('name')).toBe('Updated');
    expect(body.get('isPublic')).toBe('true');
    expect(body.get('colorIndex')).toBe('2');
    expect(body.get('aspectWidth')).toBe('4');
    expect(body.get('aspectHeight')).toBe('7');
    req.flush({});
  });

  it('should PUT /api/decks/:id/favorite for addFavorite', () => {
    service.addFavorite(5).subscribe();
    const req = httpMock.expectOne('/api/decks/5/favorite');
    expect(req.request.method).toBe('PUT');
    req.flush(null);
  });

  it('should DELETE /api/decks/:id/favorite for removeFavorite', () => {
    service.removeFavorite(5).subscribe();
    const req = httpMock.expectOne('/api/decks/5/favorite');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('should GET /api/decks/public with page params (no search) for getPublicDecks', () => {
    const paged: PagedResult<Deck> = { items: [], totalCount: 0, page: 1, pageSize: 20 };
    service.getPublicDecks('', 1, 20).subscribe((r) => expect(r).toEqual(paged));
    const req = httpMock.expectOne((r) => r.url === '/api/decks/public');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('pageSize')).toBe('20');
    expect(req.request.params.has('search')).toBe(false);
    req.flush(paged);
  });

  it('should include search param when provided', () => {
    service.getPublicDecks('tarot', 2, 20).subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/decks/public');
    expect(req.request.params.get('search')).toBe('tarot');
    expect(req.request.params.get('page')).toBe('2');
    req.flush({ items: [], totalCount: 0, page: 2, pageSize: 20 });
  });

  it('should GET /api/decks/mine for getMyDecks', () => {
    service.getMyDecks().subscribe();
    const req = httpMock.expectOne('/api/decks/mine');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });
});
