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
    createdAt: '2026-08-24T10:00:00Z', editedAt: null, targetLabel: 'My Deck', targetRoute: '/decks/5', ...over,
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
  it('renders a table row per comment with the target label and body', () => {
    const fixture = render({
      listMine: vi.fn(() => of({ items: [myComment({ id: 1, targetLabel: 'My Deck', body: 'hello' })], totalCount: 1, page: 1, pageSize: 20 })),
      restore: vi.fn(),
    });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('tbody tr').length).toBe(1);
    expect(el.querySelector('.where .link')!.textContent).toContain('My Deck');
    expect(el.querySelector('.body')!.textContent).toContain('hello');
  });

  it('shows deleted text struck-through with a Restore button and reloads on restore', () => {
    let calls = 0;
    const listMine = vi.fn(() => {
      calls++;
      return of({ items: [myComment({ id: 7, isDeleted: calls === 1, body: 'oops' })], totalCount: 1, page: 1, pageSize: 20 });
    });
    const restore = vi.fn(() => of(undefined));
    const fixture = render({ listMine, restore });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('tr.deleted .del-body')!.textContent).toContain('oops');
    const btn = el.querySelector('.restore') as HTMLButtonElement;
    expect(btn).not.toBeNull();

    btn.click();
    expect(restore).toHaveBeenCalledWith(7);
    expect(listMine).toHaveBeenCalledTimes(2); // reloaded after restore
  });

  it('shows the empty state when there are no comments', () => {
    const fixture = render({ listMine: vi.fn(() => of({ items: [], totalCount: 0, page: 1, pageSize: 20 })), restore: vi.fn() });
    expect((fixture.nativeElement as HTMLElement).querySelector('.empty')).not.toBeNull();
  });
});
