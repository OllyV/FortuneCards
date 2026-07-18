import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { DeckService } from './deck.service';
import { CreateDeckPayload } from '../models/deck';

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
});
