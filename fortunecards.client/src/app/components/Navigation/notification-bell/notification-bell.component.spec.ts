import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing';
import { NotificationBellComponent } from './notification-bell.component';
import { AuthService } from '../../../services/auth.service';

describe('NotificationBellComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [NotificationBellComponent, getTranslocoTestingModule()],
      providers: [
        provideZonelessChangeDetection(), provideHttpClient(),
        provideHttpClientTesting(), provideRouter([]),
        { provide: AuthService, useValue: { isLoggedIn: () => true } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('on open, loads notifications and marks unread ones read', () => {
    const fixture = TestBed.createComponent(NotificationBellComponent);
    fixture.detectChanges();

    fixture.componentInstance.toggle();

    const list = httpMock.expectOne((r) => r.url === '/api/notifications');
    list.flush({
      items: [{ id: 1, type: 0, isRead: false, createdAt: '', actorUserId: 3, actorName: 'Bob',
        actorAvatarUrl: null, commentId: 1, targetType: 0, targetId: 5, targetRoute: '/decks/5', commentSnippet: 'hi' }],
      totalCount: 1, page: 1, pageSize: 20,
    });

    const mark = httpMock.expectOne('/api/notifications/mark-read');
    expect(mark.request.body).toEqual({ ids: null });
    mark.flush({ marked: 1 });

    httpMock.expectOne('/api/notifications/unread-count').flush({ count: 0 });
  });
});
