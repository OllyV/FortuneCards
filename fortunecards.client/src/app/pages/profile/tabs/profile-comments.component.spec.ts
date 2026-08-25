import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { RouterModule } from '@angular/router';
import { of } from 'rxjs';
import { ProfileCommentsComponent } from './profile-comments.component';
import { CommentService } from '../../../services/comment.service';
import { CommentTargetType, MyCommentDto } from '../../../models/comment';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing';

function myComment(over: Partial<MyCommentDto>): MyCommentDto {
  return {
    id: 1, targetType: CommentTargetType.Deck, targetId: 5, body: 'nice', isDeleted: false,
    createdAt: '', editedAt: null, targetLabel: 'My Deck', targetRoute: '/decks/5', ...over,
  };
}

function render(svc: Partial<CommentService>) {
  TestBed.configureTestingModule({
    imports: [ProfileCommentsComponent, RouterModule.forRoot([]), getTranslocoTestingModule()],
    providers: [provideZonelessChangeDetection(), { provide: CommentService, useValue: svc }],
  });
  const fixture = TestBed.createComponent(ProfileCommentsComponent);
  fixture.detectChanges();
  return fixture;
}

describe('ProfileCommentsComponent', () => {
  it('lists my comments with a link to each target', () => {
    const fixture = render({
      listMine: vi.fn(() => of({ items: [myComment({ id: 1, targetLabel: 'My Deck' })], totalCount: 1, page: 1, pageSize: 20 })),
    });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('li').length).toBe(1);
    expect(el.querySelector('.link')!.textContent).toContain('My Deck');
  });

  it('shows the empty state when there are no comments', () => {
    const fixture = render({ listMine: vi.fn(() => of({ items: [], totalCount: 0, page: 1, pageSize: 20 })) });
    expect((fixture.nativeElement as HTMLElement).querySelector('.empty')).not.toBeNull();
  });
});
