import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TranslocoHttpLoader } from './transloco-loader';

describe('TranslocoHttpLoader', () => {
  it('fetches /i18n/<lang>.json', () => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        TranslocoHttpLoader,
      ],
    });
    const loader = TestBed.inject(TranslocoHttpLoader);
    const http = TestBed.inject(HttpTestingController);
    let result: unknown;
    loader.getTranslation('uk').subscribe((t) => (result = t));
    const req = http.expectOne('/i18n/uk.json');
    req.flush({ common: { save: 'Зберегти' } });
    expect(result).toEqual({ common: { save: 'Зберегти' } });
    http.verify();
  });
});
