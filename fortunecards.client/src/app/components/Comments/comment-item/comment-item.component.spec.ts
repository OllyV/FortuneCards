import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing';
import { CommentItemComponent } from './comment-item.component';
import { CommentDto, CommentTargetType } from '../../../models/comment';

function makeComment(over: Partial<CommentDto> = {}): CommentDto {
  return {
    id: 1, targetType: CommentTargetType.Deck, targetId: 5, parentCommentId: null,
    body: 'hello', isDeleted: false, createdAt: '', editedAt: null,
    authorUserId: 2, authorName: 'Alice', authorAvatarUrl: null, isMine: true,
    replyCount: 0, replies: [], ...over,
  };
}

describe('CommentItemComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CommentItemComponent, getTranslocoTestingModule()],
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('shows edit/delete only when isMine', () => {
    const fixture = TestBed.createComponent(CommentItemComponent);
    fixture.componentInstance.comment = makeComment({ isMine: false });
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('Delete');
  });

  it('renders tombstone for deleted comment and keeps replies', () => {
    const fixture = TestBed.createComponent(CommentItemComponent);
    fixture.componentInstance.comment = makeComment({
      isDeleted: true, body: null,
      replies: [makeComment({ id: 2, parentCommentId: 1, body: 'child', isMine: false })],
    });
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('child');
  });

  it('propagates canReply to nested replies (tree threading)', () => {
    const fixture = TestBed.createComponent(CommentItemComponent);
    const cmp = fixture.componentInstance;
    cmp.comment = makeComment({
      isMine: false,
      replies: [makeComment({ id: 2, parentCommentId: 1, body: 'child', isMine: false })],
    });
    cmp.canReply = true;
    fixture.detectChanges();
    // The nested reply (inside .c-replies) also renders a Reply control, not just the top comment.
    const nestedReply = (fixture.nativeElement as HTMLElement).querySelector('.c-replies .c-link.reply');
    expect(nestedReply).not.toBeNull();
  });

  it('emits changed after a successful delete', () => {
    const fixture = TestBed.createComponent(CommentItemComponent);
    const cmp = fixture.componentInstance;
    cmp.comment = makeComment({ isMine: true });
    let emitted = false;
    cmp.changed.subscribe(() => (emitted = true));
    fixture.detectChanges();

    cmp.remove();
    const req = httpMock.expectOne('/api/comments/1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
    expect(emitted).toBe(true);
  });
});
