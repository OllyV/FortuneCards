import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        NotificationService,
      ],
    });
    service = TestBed.inject(NotificationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('refreshCount sets unreadCount from the API', () => {
    service.refreshCount();
    const req = httpMock.expectOne('/api/notifications/unread-count');
    expect(req.request.method).toBe('GET');
    req.flush({ count: 3 });
    expect(service.unreadCount()).toBe(3);
  });

  it('markRead posts ids', () => {
    service.markRead([1, 2]).subscribe();
    const req = httpMock.expectOne('/api/notifications/mark-read');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ ids: [1, 2] });
    req.flush({ marked: 2 });
  });

  it('markRead with no ids posts null', () => {
    service.markRead().subscribe();
    const req = httpMock.expectOne('/api/notifications/mark-read');
    expect(req.request.body).toEqual({ ids: null });
    req.flush({ marked: 0 });
  });

  it('list GETs /api/notifications', () => {
    service.list(1, 20).subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/notifications');
    expect(req.request.method).toBe('GET');
    req.flush({ items: [], totalCount: 0, page: 1, pageSize: 20 });
  });
});
