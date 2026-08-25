# My Comments Table + Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the profile Comments tab as a table (Date · Where · Comment), preserve deleted comments' text for the author, and let the author restore a deleted comment.

**Architecture:** Backend stops scrubbing the body on delete and surfaces the author's own deleted body via `ListMineAsync` (public threads stay `[deleted]`), plus a new author-only `RestoreAsync` + `POST /api/comments/{id}/restore`. Frontend adds `CommentService.restore` and rewrites `ProfileCommentsComponent` into a responsive table with a Restore action on deleted rows.

**Tech Stack:** ASP.NET Core 10 (C#), EF Core + in-memory SQLite (tests), xUnit; Angular 21 standalone + signals, Transloco, Vitest.

## Global Constraints

- Backend auth: `HttpContext.Items["UserId"] is int id`; `Unauthorized()` when absent. Author-only / not-found both return `404` (no existence leak) — restore mirrors delete.
- Privacy boundary: the real body stays in the DB but is only surfaced to its author via `ListMineAsync`. Public `ListAsync` (`ToDto`) is UNCHANGED — deleted comments return `Body = null` to others.
- Restore is immediate (no confirm) and reversible; `RestoreAsync` only un-deletes a currently-deleted comment authored by the caller.
- Enums serialize as integers; frontend `CommentTargetType { Deck=0, Card=1, Pattern=2 }`.
- Angular: standalone; signals; `@if`/`@for`; `*transloco="let t"`; design tokens from `design-system.css`; the type-chip tint literals (`#eae5ff`/`#e2f7fb`/`#fff2d9`) are intentional (no matching tokens exist).
- Vitest specs compile as ONE bundle; whole run green + pristine (no NG8107 — `?.` only on nullable values). Backend: `dotnet test FortuneCards.Server.Tests`. Frontend: `cd fortunecards.client && ng test --watch=false`.

---

## Task 1: Backend — keep deleted body, show to author, restore

**Files:**
- Modify: `FortuneCards.Server/Services/CommentService.cs` (`DeleteAsync`, `ListMineAsync`, new `RestoreAsync`)
- Modify: `FortuneCards.Server/Services/ICommentService.cs` (add `RestoreAsync`)
- Modify: `FortuneCards.Server/Controllers/CommentsController.cs` (add `POST {id}/restore`)
- Modify: `FortuneCards.Server.Tests/CommentServiceTests.cs`

**Interfaces:**
- Produces: `Task<bool> ICommentService.RestoreAsync(int commentId, int userId)`; `POST /api/comments/{id}/restore` → `204`/`404`.

- [ ] **Step 1: Write the failing tests** (append to `CommentServiceTests.cs`)

```csharp
    [Fact]
    public async Task Delete_keeps_the_body_for_recovery()
    {
        using var h = new TestDb();
        h.AddUser(2);
        h.AddDeck(5, 1, true);
        h.AddComment(1, CommentTargetType.Deck, 5, userId: 2, body: "secret");

        await h.NewCommentService().DeleteAsync(1, userId: 2);

        var c = await h.Db.Comments.SingleAsync(x => x.Id == 1);
        Assert.True(c.IsDeleted);
        Assert.Equal("secret", c.Body);   // body retained, no longer scrubbed
    }

    [Fact]
    public async Task ListMine_returns_deleted_body_to_author()
    {
        using var h = new TestDb();
        h.AddUser(2);
        h.AddDeck(5, 1, true);
        h.AddComment(1, CommentTargetType.Deck, 5, userId: 2, body: "secret", isDeleted: true);

        var page = await h.NewCommentService().ListMineAsync(2, 1, 20);

        var item = page.Items.Single();
        Assert.True(item.IsDeleted);
        Assert.Equal("secret", item.Body);   // author sees their own deleted text
    }

    [Fact]
    public async Task Public_list_still_hides_deleted_body()
    {
        using var h = new TestDb();
        h.AddUser(2);
        h.AddDeck(5, 1, true);
        h.AddComment(1, CommentTargetType.Deck, 5, userId: 2, body: "secret", isDeleted: true);

        var page = await h.NewCommentService().ListAsync(CommentTargetType.Deck, 5, currentUserId: null, 1, 20);

        Assert.Null(page.Items.Single().Body);   // public threads still show [deleted]
    }

    [Fact]
    public async Task Restore_by_author_undeletes()
    {
        using var h = new TestDb();
        h.AddUser(2);
        h.AddDeck(5, 1, true);
        h.AddComment(1, CommentTargetType.Deck, 5, userId: 2, body: "secret", isDeleted: true);

        var ok = await h.NewCommentService().RestoreAsync(1, userId: 2);

        Assert.True(ok);
        Assert.False(await h.Db.Comments.Where(c => c.Id == 1).Select(c => c.IsDeleted).SingleAsync());
    }

    [Fact]
    public async Task Restore_by_non_author_returns_false_and_leaves_it_deleted()
    {
        using var h = new TestDb();
        h.AddUser(2); h.AddUser(3);
        h.AddDeck(5, 1, true);
        h.AddComment(1, CommentTargetType.Deck, 5, userId: 2, body: "secret", isDeleted: true);

        var ok = await h.NewCommentService().RestoreAsync(1, userId: 3);

        Assert.False(ok);
        Assert.True(await h.Db.Comments.Where(c => c.Id == 1).Select(c => c.IsDeleted).SingleAsync());
    }
```

- [ ] **Step 2: Run to verify failure**

Run: `dotnet test FortuneCards.Server.Tests --filter FullyQualifiedName~CommentServiceTests`
Expected: FAIL — `Delete_keeps_the_body_for_recovery` fails (body currently scrubbed to ""), `ListMine_returns_deleted_body_to_author` fails (currently null), and the two `Restore_*` tests fail to compile (`RestoreAsync` not defined).

- [ ] **Step 3: Stop scrubbing the body in `DeleteAsync`**

In `CommentService.cs`, in `DeleteAsync`, remove the body-scrub line so the block reads:

```csharp
            comment.IsDeleted = true;
            await _db.SaveChangesAsync();
            return true;
```

(Delete the line `comment.Body = string.Empty;    // scrub stored text; DTO returns null while IsDeleted`.)

- [ ] **Step 4: Return the author's deleted body in `ListMineAsync`**

In `CommentService.cs`, in `ListMineAsync`, change the DTO body argument from `c.IsDeleted ? null : c.Body` to `c.Body`:

```csharp
                items.Add(new MyCommentDto(
                    c.Id, c.TargetType, c.TargetId, c.Body, c.IsDeleted,
                    c.CreatedAt, c.EditedAt, label, route));
```

- [ ] **Step 5: Add `RestoreAsync`**

In `CommentService.cs`, add after `DeleteAsync`:

```csharp
        public async Task<bool> RestoreAsync(int commentId, int userId)
        {
            var comment = await _db.Comments.FirstOrDefaultAsync(c => c.Id == commentId);
            if (comment is null || comment.UserId != userId || !comment.IsDeleted) return false;

            comment.IsDeleted = false;
            await _db.SaveChangesAsync();
            return true;
        }
```

In `ICommentService.cs`, add to the interface (after `DeleteAsync`):

```csharp
        Task<bool> RestoreAsync(int commentId, int userId);
```

- [ ] **Step 6: Add the restore endpoint**

In `CommentsController.cs`, add after the `Delete` action:

```csharp
        [HttpPost("{id:int}/restore")]
        public async Task<IActionResult> Restore(int id)
        {
            if (CurrentUserId is not int userId) return Unauthorized();
            var ok = await _comments.RestoreAsync(id, userId);
            return ok ? NoContent() : NotFound();
        }
```

- [ ] **Step 7: Run the tests + full suite**

Run: `dotnet test FortuneCards.Server.Tests --filter FullyQualifiedName~CommentServiceTests`
Expected: PASS (all new tests + existing).
Run: `dotnet test FortuneCards.Server.Tests`
Expected: all PASS. (The existing `Delete_by_author_tombstones_and_keeps_replies` test only asserts `IsDeleted` + reply count, and `List_shows_deleted_body_as_null_but_keeps_replies` tests the public `ListAsync` — both still pass.)

- [ ] **Step 8: Commit**

```bash
git add FortuneCards.Server/Services/CommentService.cs FortuneCards.Server/Services/ICommentService.cs FortuneCards.Server/Controllers/CommentsController.cs FortuneCards.Server.Tests/CommentServiceTests.cs
git commit -m "71: Keep deleted comment body + author-only restore"
```

---

## Task 2: Frontend — CommentService.restore

**Files:**
- Modify: `fortunecards.client/src/app/services/comment.service.ts`
- Modify: `fortunecards.client/src/app/services/comment.service.spec.ts`

**Interfaces:**
- Produces: `CommentService.restore(id: number): Observable<void>` → `POST /api/comments/{id}/restore`.

- [ ] **Step 1: Write the failing test** (append inside the existing `describe('CommentService', ...)` in `comment.service.spec.ts`)

```typescript
  it('POSTs to restore a comment', () => {
    service.restore(4).subscribe();
    const req = httpMock.expectOne('/api/comments/4/restore');
    expect(req.request.method).toBe('POST');
    req.flush(null);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: FAIL — `service.restore` is not a function / type error.

- [ ] **Step 3: Add `restore` to `comment.service.ts`**

Add after the `remove` method:

```typescript
  restore(id: number): Observable<void> {
    return this.http.post<void>(`${this.base}/${id}/restore`, {});
  }
```

- [ ] **Step 4: Run to verify pass**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: PASS; whole run green.

- [ ] **Step 5: Commit**

```bash
git add fortunecards.client/src/app/services/comment.service.ts fortunecards.client/src/app/services/comment.service.spec.ts
git commit -m "71: CommentService.restore"
```

---

## Task 3: Frontend — Comments tab table + restore + i18n

**Files:**
- Modify: `fortunecards.client/src/app/pages/profile/tabs/profile-comments.component.ts`
- Modify: `.../profile-comments.component.html`
- Modify: `.../profile-comments.component.css`
- Modify: `.../profile-comments.component.spec.ts`
- Modify: `fortunecards.client/public/i18n/*.json` (7 files)

**Interfaces:**
- Consumes: `CommentService.listMine`, `CommentService.restore` (Task 2), `MyCommentDto`, `CommentTargetType`.

- [ ] **Step 1: Add i18n keys**

In `public/i18n/en.json`, inside the existing `comments` object, add:

```json
    "colDate": "Date",
    "colWhere": "Where",
    "colComment": "Comment",
    "typeDeck": "Deck",
    "typeCard": "Card",
    "typePattern": "Pattern",
    "restore": "Restore",
```

Copy these same seven keys (identical English values) into the `comments` object of `de.json`, `es.json`, `fr.json`, `pt.json`, `ru.json`, `uk.json`.

- [ ] **Step 2: Rewrite the spec** (`profile-comments.component.spec.ts`)

Replace the whole file with:

```typescript
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
```

- [ ] **Step 3: Run to verify failure**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: FAIL — the current template renders `<li>`/`.link` (no `tbody tr`, `.del-body`, or `.restore`), and `restore()` isn't on the component.

- [ ] **Step 4: Rewrite `profile-comments.component.ts`**

```typescript
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoDirective } from '@jsverse/transloco';
import { CommentService } from '../../../services/comment.service';
import { CommentTargetType, MyCommentDto } from '../../../models/comment';

@Component({
  selector: 'app-profile-comments',
  standalone: true,
  templateUrl: './profile-comments.component.html',
  styleUrl: './profile-comments.component.css',
  imports: [TranslocoDirective, DatePipe],
})
export class ProfileCommentsComponent {
  private readonly commentService = inject(CommentService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly myComments = signal<MyCommentDto[]>([]);

  constructor() { this.load(); }

  private load(): void {
    this.commentService.listMine(1, 20)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (res) => this.myComments.set(res.items), error: () => {} });
  }

  openComment(route: string): void { this.router.navigateByUrl(route); }

  restore(id: number): void {
    this.commentService.restore(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: () => this.load(), error: () => {} });
  }

  typeKey(t: CommentTargetType): string {
    if (t === CommentTargetType.Card) return 'comments.typeCard';
    if (t === CommentTargetType.Pattern) return 'comments.typePattern';
    return 'comments.typeDeck';
  }

  typeClass(t: CommentTargetType): string {
    if (t === CommentTargetType.Card) return 'card';
    if (t === CommentTargetType.Pattern) return 'pattern';
    return 'deck';
  }
}
```

- [ ] **Step 5: Rewrite `profile-comments.component.html`**

```html
<ng-container *transloco="let t">
  <h2 class="tab-title">{{ t('comments.myComments') }}</h2>
  @if (myComments().length === 0) {
    <p class="empty">{{ t('comments.myCommentsEmpty') }}</p>
  } @else {
    <div class="table-card">
      <div class="scroll">
        <table>
          <thead>
            <tr>
              <th>{{ t('comments.colDate') }}</th>
              <th>{{ t('comments.colWhere') }}</th>
              <th>{{ t('comments.colComment') }}</th>
            </tr>
          </thead>
          <tbody>
            @for (c of myComments(); track c.id) {
              <tr [class.deleted]="c.isDeleted">
                <td class="date">{{ c.createdAt | date:'d MMM y' }}</td>
                <td class="where">
                  <button class="link" (click)="openComment(c.targetRoute)">{{ c.targetLabel }}</button>
                  <span class="type {{ typeClass(c.targetType) }}">{{ t(typeKey(c.targetType)) }}</span>
                </td>
                <td class="body">
                  @if (c.isDeleted) {
                    <div><span class="del-tag">{{ t('comments.deletedPlaceholder') }}</span><span class="del-body">{{ c.body }}</span></div>
                    <button class="restore" (click)="restore(c.id)">↩ {{ t('comments.restore') }}</button>
                  } @else {
                    {{ c.body }}
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  }
</ng-container>
```

- [ ] **Step 6: Rewrite `profile-comments.component.css`**

```css
.tab-title { margin: 0 0 16px; font-size: 18px; font-weight: 800; }
.empty { color: var(--color-label); font-size: 14px; }

.table-card { background: #fff; border: 1.5px solid var(--color-border); border-radius: var(--radius-md);
  box-shadow: var(--shadow-card); overflow: hidden; }
.scroll { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
thead th { text-align: left; font-size: 11px; font-weight: 800; letter-spacing: .6px; text-transform: uppercase;
  color: var(--color-label); padding: 12px 16px; border-bottom: 1.5px solid var(--color-border); white-space: nowrap; background: #fffdf9; }
tbody td { padding: 13px 16px; border-bottom: 1px solid var(--color-border); vertical-align: top; }
tbody tr:last-child td { border-bottom: none; }
tbody tr:hover { background: #fffaf3; }

.date { color: var(--color-muted); font-weight: 700; font-size: 12.5px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.where { display: flex; flex-direction: column; gap: 5px; min-width: 120px; }
.where .link { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-family: var(--font); font-weight: 800; font-size: 13.5px; color: var(--color-coral-ink); }
.type { font-size: 10.5px; font-weight: 800; letter-spacing: .4px; text-transform: uppercase; padding: 2px 8px;
  border-radius: var(--radius-pill); width: fit-content; }
.type.deck { background: #eae5ff; color: #5a4bd6; }
.type.pattern { background: #e2f7fb; color: #1594ab; }
.type.card { background: #fff2d9; color: #a9761a; }
.body { color: var(--color-charcoal); word-break: break-word; }

tr.deleted .del-body { color: var(--color-muted); text-decoration: line-through; text-decoration-color: #d8ccbb; }
.del-tag { display: inline-block; font-size: 10.5px; font-weight: 800; letter-spacing: .4px; text-transform: uppercase;
  color: var(--color-coral-ink); background: var(--color-coral-wash); border-radius: var(--radius-pill); padding: 2px 8px; margin-right: 8px; vertical-align: 1px; }
.restore { margin-top: 8px; display: inline-flex; align-items: center; gap: 6px; font-family: var(--font); font-weight: 800;
  font-size: 12px; color: var(--color-charcoal); background: #fff; border: 1.5px solid var(--color-border-light);
  border-radius: var(--radius-pill); padding: 5px 12px; cursor: pointer; }
.restore:hover { border-color: var(--color-coral); color: var(--color-coral-ink); }

@media (max-width: 560px) {
  thead { display: none; }
  table, tbody, tr, td { display: block; width: 100%; }
  tbody tr { padding: 12px 14px; border-bottom: 1px solid var(--color-border); }
  tbody tr:last-child { border-bottom: none; }
  tbody td { border: none; padding: 3px 0; }
  .where { flex-direction: row; align-items: center; }
}
```

- [ ] **Step 7: Run the suite + build**

Run: `cd fortunecards.client && ng test --watch=false`
Expected: whole run green, pristine (no NG8107).
Run: `cd fortunecards.client && ng build`
Expected: build succeeds (invalid JSON would fail it).

- [ ] **Step 8: Commit**

```bash
git add fortunecards.client/src/app/pages/profile/tabs/profile-comments.component.* fortunecards.client/public/i18n/
git commit -m "71: My Comments table with type chips, deleted text + restore"
```

---

## Final verification

- [ ] `dotnet test FortuneCards.Server.Tests` — all green.
- [ ] `cd fortunecards.client && ng test --watch=false` — all green, pristine.
- [ ] `cd fortunecards.client && ng build` — succeeds.
- [ ] **Manual smoke (F5, logged in):** open `/profile/comments` → the table shows Date / Where / Comment with type chips; delete a comment in a thread, then reload the tab → the row shows the struck-through text + `deleted` tag + Restore; click Restore → the row returns to a normal comment and the comment is visible again in its thread.
