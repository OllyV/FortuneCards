import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { retryInterceptor, RETRY_DELAYS_MS } from './retry.interceptor';

describe('retryInterceptor', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withInterceptors([retryInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    ctrl.verify();
  });

  it('retries a transient 503 GET after the first backoff and then succeeds', async () => {
    let result: unknown;
    http.get('/api/x').subscribe((r) => (result = r));
    ctrl.expectOne('/api/x').flush('unavailable', { status: 503, statusText: 'Service Unavailable' });
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);
    ctrl.expectOne('/api/x').flush({ ok: true });
    expect(result).toEqual({ ok: true });
  });

  it('does not retry a 404 GET', async () => {
    let status: number | undefined;
    http.get('/api/x').subscribe({ error: (e) => (status = e.status) });
    ctrl.expectOne('/api/x').flush('nope', { status: 404, statusText: 'Not Found' });
    expect(status).toBe(404);
  });

  it('does not retry a non-GET request', async () => {
    let status: number | undefined;
    http.post('/api/x', {}).subscribe({ error: (e) => (status = e.status) });
    ctrl.expectOne('/api/x').flush('unavailable', { status: 503, statusText: 'Service Unavailable' });
    expect(status).toBe(503);
  });

  it('gives up after 4 retries and surfaces the error', async () => {
    let status: number | undefined;
    http.get('/api/x').subscribe({ error: (e) => (status = e.status) });
    ctrl.expectOne('/api/x').flush('e', { status: 503, statusText: 'x' }); // initial
    for (const delay of RETRY_DELAYS_MS) {
      await vi.advanceTimersByTimeAsync(delay);
      ctrl.expectOne('/api/x').flush('e', { status: 503, statusText: 'x' });
    }
    expect(status).toBe(503);
  });
});
