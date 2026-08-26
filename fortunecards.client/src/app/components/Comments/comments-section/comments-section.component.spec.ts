import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing';
import { CommentsSectionComponent } from './comments-section.component';
import { CommentTargetType } from '../../../models/comment';

describe('CommentsSectionComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CommentsSectionComponent, getTranslocoTestingModule()],
      providers: [
        provideZonelessChangeDetection(), provideHttpClient(),
        provideHttpClientTesting(), provideRouter([]),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads the comment count on init', () => {
    const fixture = TestBed.createComponent(CommentsSectionComponent);
    fixture.componentInstance.targetType = CommentTargetType.Deck;
    fixture.componentInstance.targetId = 5;
    fixture.detectChanges(); // triggers ngOnInit
    const req = httpMock.expectOne((r) => r.url === '/api/comments');
    expect(req.request.params.get('targetId')).toBe('5');
    req.flush({ items: [], totalCount: 7, page: 1, pageSize: 20 });
    expect(fixture.componentInstance.total()).toBe(7);
  });

  it('posts a top-level comment then reloads and refreshes the count', () => {
    const fixture = TestBed.createComponent(CommentsSectionComponent);
    const cmp = fixture.componentInstance;
    cmp.targetType = CommentTargetType.Deck;
    cmp.targetId = 5;
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === '/api/comments').flush({ items: [], totalCount: 0, page: 1, pageSize: 20 });

    cmp.draft.set('great');
    cmp.post();

    const post = httpMock.expectOne((r) => r.method === 'POST' && r.url === '/api/comments');
    expect(post.request.body).toEqual({ targetType: 0, targetId: 5, parentCommentId: null, body: 'great' });
    post.flush({});

    httpMock.expectOne((r) => r.method === 'GET' && r.url === '/api/comments')
      .flush({ items: [], totalCount: 1, page: 1, pageSize: 20 });
    httpMock.expectOne('/api/notifications/unread-count').flush({ count: 0 });
  });
});
