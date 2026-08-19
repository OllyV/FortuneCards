# User Profile: Custom Nickname & Photo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user set a custom nickname and upload a custom profile photo (edited on account-settings, displayed on the profile page), overriding the Google-sourced identity without overwriting it.

**Architecture:** Add two nullable columns to `User` (`Nickname`, `AvatarImageKey`). Extend `AuthService`/`AuthController` (Option A) with `PATCH /api/auth/profile` accepting nickname + photo `[FromForm]`, mirroring the card image-upload flow (`CardService.UpdateAsync` + `IImageStorage`). The `me`/`profile` DTOs return the raw nickname plus an *effective* avatar URL (custom R2 URL if set, else Google URL). Frontend computes the effective name (`nickname ?? displayName`).

**Tech Stack:** ASP.NET Core 10 (xUnit, in-memory SQLite via `TestDb`), EF Core (Npgsql/PostgreSQL), Cloudflare R2 (`IImageStorage`), Angular 21 standalone + signals (Vitest), Transloco i18n.

## Global Constraints

- Backend: ASP.NET Core 10, minimal-API style, business logic in `Services/`. Tests: xUnit against services over in-memory SQLite (`TestDb`). No controller test harness exists — controller-only changes are build-verified, not unit-tested.
- Frontend: Angular 21, **standalone** components, signals; register components in `TestBed` via `imports:` (never `declarations:`). Test runner is **Vitest** (`vi.spyOn`, `vi.fn`); all specs compile as one bundle, so a type error in any spec fails the whole run.
- Nickname: `Trim()`, empty/whitespace → `null`, **max 50 chars** (over-limit → `400`).
- Photo: **upload/replace only** (no removal). Mirror `CardService.UpdateAsync` — treat as present only when `Length > 0`; no extra MIME/size validation (the card flow has none).
- Display nickname/photo on the **profile page only**; edit on the **account-settings page**.
- i18n: add every new UI key to **all 7** `public/i18n/*.json` files. English gets real copy; other locales copy the English string (deferred translation).
- EF migrations: use the `dotnet ef` CLI (VS Package Manager Console is broken here); `database update` needs `--connection` from user-secrets (see `docs`/memory `reference-ef-migrations`).
- Commit after each task.

---

### Task 1: User model fields + EF migration

**Files:**
- Modify: `FortuneCards.Server/Models/User.cs`
- Create: `FortuneCards.Server/Migrations/*_AddUserProfile.*` (generated)

**Interfaces:**
- Produces: `User.Nickname` (`string?`), `User.AvatarImageKey` (`string?`).

- [ ] **Step 1: Add the two columns to `User`**

In `FortuneCards.Server/Models/User.cs`, add after the `AvatarUrl` property (line 9):

```csharp
        public string? Nickname { get; set; }
        public string? AvatarImageKey { get; set; }
```

- [ ] **Step 2: Generate the migration**

Run (from repo root):

```bash
dotnet ef migrations add AddUserProfile --project FortuneCards.Server --startup-project FortuneCards.Server
```

Expected: a new `Migrations/<timestamp>_AddUserProfile.cs` adding two nullable `text`/`nvarchar` columns (`Nickname`, `AvatarImageKey`) to `Users`, and an updated model snapshot. Open the generated file and confirm `Up()` only **adds** these two nullable columns (no other schema changes).

- [ ] **Step 3: Verify the backend still builds**

Run:

```bash
dotnet build FortuneCards.Server
```

Expected: Build succeeded (npm-audit noise from the SPA ProjectReference is harmless).

- [ ] **Step 4: Apply the migration to the configured database**

> The connection in user-secrets points at the real (Aiven Postgres) database. Adding two **nullable** columns is backward-compatible and safe. Run intentionally:

```bash
$conn = (dotnet user-secrets list --project FortuneCards.Server | Where-Object { $_ -like 'ConnectionStrings:DefaultConnection = *' }) -replace '^ConnectionStrings:DefaultConnection = '
dotnet ef database update --project FortuneCards.Server --startup-project FortuneCards.Server --connection $conn
```

Expected: `Done.` — migration `AddUserProfile` applied.

- [ ] **Step 5: Commit**

```bash
git add FortuneCards.Server/Models/User.cs FortuneCards.Server/Migrations
git commit -m "67: Add Nickname and AvatarImageKey columns to User"
```

---

### Task 2: `AuthService.UpdateProfileAsync` + test harness (TDD)

**Files:**
- Modify: `FortuneCards.Server/Services/IAuthService.cs`
- Modify: `FortuneCards.Server/Services/AuthService.cs`
- Modify: `FortuneCards.Server.Tests/TestDb.cs`
- Create: `FortuneCards.Server.Tests/AuthServiceTests.cs`

**Interfaces:**
- Consumes: `IImageStorage` (`SaveAsync`, `DeleteAsync`), `FortuneCardsDbContext.Users`.
- Produces: `IAuthService.UpdateProfileAsync(int userId, string? nickname, IFormFile? photo) : Task<User?>` — returns the updated `User`, `null` if the user doesn't exist, throws `ArgumentException` if the trimmed nickname exceeds 50 chars. `AuthService.MaxNicknameLength` constant (`= 50`). `TestDb.NewAuthService()` and `TestDb.Images` (the tracking `FakeImageStorage`).

- [ ] **Step 1: Enhance the test harness**

In `FortuneCards.Server.Tests/TestDb.cs`, replace the `FakeImageStorage` class (lines ~89-96) with a tracking version:

```csharp
/// <summary>Tracking <see cref="IImageStorage"/> stand-in for service tests.</summary>
internal sealed class FakeImageStorage : IImageStorage
{
    public List<string> Deleted { get; } = new();
    public int SaveCount { get; private set; }
    public string PublicBaseUrl => "https://images.test";
    public Task<string> SaveAsync(IFormFile file) => Task.FromResult($"saved-{++SaveCount}.png");
    public Task DeleteAsync(string key)
    {
        if (!string.IsNullOrEmpty(key)) Deleted.Add(key);
        return Task.CompletedTask;
    }
    public string? PublicUrl(string? key) => string.IsNullOrEmpty(key) ? null : $"{PublicBaseUrl}/{key}";
}
```

Then add to the `TestDb` class body (near `NewDeckService`, around line 48) a shared image store, a JWT config, and an `AuthService` factory:

```csharp
    public FakeImageStorage Images { get; } = new();

    public AuthService NewAuthService() => new(Db, AuthConfig(), Images);

    private static IConfiguration AuthConfig() =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Secret"] = "test-secret-that-is-long-enough-0123456789",
            })
            .Build();
```

(`Microsoft.Extensions.Configuration`, `Microsoft.AspNetCore.Http`, `FortuneCards.Server.Services` are already imported in this file.)

- [ ] **Step 2: Write the failing tests**

Create `FortuneCards.Server.Tests/AuthServiceTests.cs`:

```csharp
using FortuneCards.Server.Services;
using Microsoft.AspNetCore.Http;

namespace FortuneCards.Server.Tests;

public class AuthServiceTests
{
    private const int UserId = 10;

    private static IFormFile FakePhoto(string name = "avatar.png")
    {
        var bytes = new byte[] { 1, 2, 3, 4 };
        return new FormFile(new MemoryStream(bytes), 0, bytes.Length, "Photo", name)
        {
            Headers = new HeaderDictionary(),
            ContentType = "image/png",
        };
    }

    [Fact]
    public async Task Sets_trimmed_nickname()
    {
        using var h = new TestDb();
        h.AddUser(UserId, "Google Name");

        var user = await h.NewAuthService().UpdateProfileAsync(UserId, "  Nick  ", null);

        Assert.NotNull(user);
        Assert.Equal("Nick", user!.Nickname);
        Assert.Equal("Google Name", user.DisplayName); // Google name untouched
    }

    [Fact]
    public async Task Empty_nickname_becomes_null()
    {
        using var h = new TestDb();
        h.AddUser(UserId);

        var user = await h.NewAuthService().UpdateProfileAsync(UserId, "   ", null);

        Assert.NotNull(user);
        Assert.Null(user!.Nickname);
    }

    [Fact]
    public async Task Nickname_over_50_chars_is_rejected()
    {
        using var h = new TestDb();
        h.AddUser(UserId);
        var tooLong = new string('x', 51);

        await Assert.ThrowsAsync<ArgumentException>(
            () => h.NewAuthService().UpdateProfileAsync(UserId, tooLong, null));
    }

    [Fact]
    public async Task Uploading_photo_sets_avatar_key()
    {
        using var h = new TestDb();
        h.AddUser(UserId);

        var user = await h.NewAuthService().UpdateProfileAsync(UserId, null, FakePhoto());

        Assert.NotNull(user);
        Assert.Equal("saved-1.png", user!.AvatarImageKey);
        Assert.Equal(1, h.Images.SaveCount);
    }

    [Fact]
    public async Task Replacing_photo_deletes_old_key()
    {
        using var h = new TestDb();
        var seeded = h.AddUser(UserId);
        seeded.AvatarImageKey = "old.png";
        h.Db.SaveChanges();

        var user = await h.NewAuthService().UpdateProfileAsync(UserId, null, FakePhoto());

        Assert.NotNull(user);
        Assert.Contains("old.png", h.Images.Deleted);
        Assert.Equal("saved-1.png", user!.AvatarImageKey);
    }

    [Fact]
    public async Task Returns_null_for_missing_user()
    {
        using var h = new TestDb();

        var user = await h.NewAuthService().UpdateProfileAsync(999, "Nick", null);

        Assert.Null(user);
    }
}
```

- [ ] **Step 3: Run the tests to verify they fail**

Run:

```bash
dotnet test FortuneCards.Server.Tests
```

Expected: compile failure / FAIL — `UpdateProfileAsync` is not defined on `AuthService`.

- [ ] **Step 4: Add the interface method**

In `FortuneCards.Server/Services/IAuthService.cs`, ensure these usings are present at the top and add the method to the interface:

```csharp
using FortuneCards.Server.Models;
using Microsoft.AspNetCore.Http;
```

```csharp
        Task<User?> UpdateProfileAsync(int userId, string? nickname, IFormFile? photo);
```

- [ ] **Step 5: Implement in `AuthService`**

In `FortuneCards.Server/Services/AuthService.cs`:

Add the `IImageStorage` field and inject it in the constructor (replace lines 13-21):

```csharp
        private readonly FortuneCardsDbContext _db;
        private readonly string _jwtSecret;
        private readonly IImageStorage _imageStorage;

        public const int MaxNicknameLength = 50;

        public AuthService(FortuneCardsDbContext db, IConfiguration configuration, IImageStorage imageStorage)
        {
            _db = db;
            _imageStorage = imageStorage;
            _jwtSecret = configuration["Jwt:Secret"]
                ?? throw new InvalidOperationException("Jwt:Secret is not configured.");
        }
```

Add the method (e.g. after `UpsertUserAsync`):

```csharp
        public async Task<User?> UpdateProfileAsync(int userId, string? nickname, IFormFile? photo)
        {
            var trimmed = nickname?.Trim();
            if (trimmed is { Length: > MaxNicknameLength })
                throw new ArgumentException(
                    $"Nickname must be {MaxNicknameLength} characters or fewer.", nameof(nickname));

            var user = await _db.Users.FindAsync(userId);
            if (user is null) return null;

            user.Nickname = string.IsNullOrEmpty(trimmed) ? null : trimmed;

            if (photo is { Length: > 0 })
            {
                if (!string.IsNullOrEmpty(user.AvatarImageKey))
                    await _imageStorage.DeleteAsync(user.AvatarImageKey);
                user.AvatarImageKey = await _imageStorage.SaveAsync(photo);
            }

            await _db.SaveChangesAsync();
            return user;
        }
```

(`IImageStorage` is in the same `FortuneCards.Server.Services` namespace — no new using needed. DI already registers `IImageStorage` as a singleton, so the scoped `AuthService` resolves it automatically; no `Program.cs` change.)

- [ ] **Step 6: Run the tests to verify they pass**

Run:

```bash
dotnet test FortuneCards.Server.Tests
```

Expected: PASS (all AuthServiceTests plus the existing suites).

- [ ] **Step 7: Commit**

```bash
git add FortuneCards.Server/Services/IAuthService.cs FortuneCards.Server/Services/AuthService.cs FortuneCards.Server.Tests/TestDb.cs FortuneCards.Server.Tests/AuthServiceTests.cs
git commit -m "67: Add AuthService.UpdateProfileAsync with nickname/photo tests"
```

---

### Task 3: `PATCH /api/auth/profile` endpoint + effective avatar in `me`

**Files:**
- Modify: `FortuneCards.Server/Controllers/AuthController.cs`

**Interfaces:**
- Consumes: `IAuthService.UpdateProfileAsync`, `IImageStorage.PublicUrl`.
- Produces: `PATCH /api/auth/profile` (`[FromForm]` `Nickname`, `Photo`) → user DTO `{ id, email, displayName, nickname, avatarUrl }`. `GET /api/auth/me` returns the same shape.

- [ ] **Step 1: Add the `Models` using**

At the top of `FortuneCards.Server/Controllers/AuthController.cs`, add:

```csharp
using FortuneCards.Server.Models;
```

- [ ] **Step 2: Add a shared DTO helper**

Inside the `AuthController` class, add a private helper:

```csharp
        private static object ToUserDto(User user, IImageStorage storage) => new
        {
            id = user.Id,
            email = user.Email,
            displayName = user.DisplayName,
            nickname = user.Nickname,
            avatarUrl = storage.PublicUrl(user.AvatarImageKey) ?? user.AvatarUrl,
        };
```

- [ ] **Step 3: Update `Me` to use the helper (adds nickname + effective avatar)**

Replace the `Me` action (lines 87-97) with:

```csharp
        [HttpGet("me")]
        public async Task<IActionResult> Me(
            [FromServices] Data.FortuneCardsDbContext db,
            [FromServices] IImageStorage storage)
        {
            if (HttpContext.Items["UserId"] is not int userId)
                return Unauthorized();

            var user = await db.Users.FindAsync(userId);
            if (user is null) return Unauthorized();

            return Ok(ToUserDto(user, storage));
        }
```

- [ ] **Step 4: Add the `UpdateProfile` action and request type**

Add the action inside the class (e.g. after `Me`):

```csharp
        [HttpPatch("profile")]
        public async Task<IActionResult> UpdateProfile(
            [FromForm] UpdateProfileRequest request,
            [FromServices] IImageStorage storage)
        {
            if (HttpContext.Items["UserId"] is not int userId)
                return Unauthorized();

            User? user;
            try
            {
                user = await _auth.UpdateProfileAsync(userId, request.Nickname, request.Photo);
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { message = ex.Message });
            }

            if (user is null) return Unauthorized();

            return Ok(ToUserDto(user, storage));
        }
```

Add the request class at the bottom of the file, inside the `namespace` (next to the controller class, mirroring `UpdateCardRequest`):

```csharp
    public class UpdateProfileRequest
    {
        public string? Nickname { get; set; }
        public IFormFile? Photo { get; set; }
    }
```

- [ ] **Step 5: Verify the backend builds and all tests still pass**

Run:

```bash
dotnet build FortuneCards.Server
dotnet test FortuneCards.Server.Tests
```

Expected: Build succeeded; all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add FortuneCards.Server/Controllers/AuthController.cs
git commit -m "67: Add PATCH /api/auth/profile and effective avatar in me"
```

---

### Task 4: Frontend `UserDto` + i18n keys

**Files:**
- Modify: `fortunecards.client/src/app/models/user.ts`
- Modify: `fortunecards.client/public/i18n/en.json`
- Modify: `fortunecards.client/public/i18n/{de,es,fr,pt,ru,uk}.json`

**Interfaces:**
- Produces: `UserDto.nickname: string | null`; translation keys under `pages.*` used by Tasks 5-6.

- [ ] **Step 1: Add `nickname` to `UserDto`**

Replace `fortunecards.client/src/app/models/user.ts` with:

```ts
export interface UserDto {
  id: number;
  email: string;
  displayName: string;
  nickname: string | null;
  avatarUrl: string | null;
}
```

- [ ] **Step 2: Add the new keys to `en.json`**

In `fortunecards.client/public/i18n/en.json`, inside the `"pages"` object, add these keys (e.g. right after `"accountDeleteConfirm"` — remember to add a comma after the previous last entry):

```json
    "profileSectionLabel": "Profile",
    "nicknameLabel": "Nickname",
    "nicknamePlaceholder": "Choose a nickname",
    "photoLabel": "Profile Photo",
    "choosePhotoButton": "Choose Photo",
    "savingButton": "Saving…",
    "profileSavedMessage": "Profile saved.",
    "profilePhotoAlt": "Profile photo"
```

- [ ] **Step 3: Add the same keys (English text) to the other 6 locale files**

Add the identical 8 key/value lines into the `"pages"` object of each of `de.json`, `es.json`, `fr.json`, `pt.json`, `ru.json`, `uk.json` (English values, per the deferred-translation decision). Keep each file valid JSON (watch commas).

- [ ] **Step 4: Verify JSON validity**

Run:

```bash
cd fortunecards.client && node -e "['de','en','es','fr','pt','ru','uk'].forEach(l=>{const j=require('./public/i18n/'+l+'.json'); if(!j.pages.nicknameLabel) throw new Error('missing key in '+l); }); console.log('i18n OK')"
```

Expected: `i18n OK`.

- [ ] **Step 5: Commit**

```bash
git add fortunecards.client/src/app/models/user.ts fortunecards.client/public/i18n
git commit -m "67: Add nickname to UserDto and profile i18n keys"
```

---

### Task 5: Account-settings edit UI (nickname + photo + save)

**Files:**
- Modify: `fortunecards.client/src/app/pages/account-settings/account-settings.component.ts`
- Modify: `fortunecards.client/src/app/pages/account-settings/account-settings.component.html`
- Modify: `fortunecards.client/src/app/pages/account-settings/account-settings.component.css`
- Create: `fortunecards.client/src/app/pages/account-settings/account-settings.component.spec.ts`

**Interfaces:**
- Consumes: `PATCH /api/auth/profile`, `AuthService.loadCurrentUser()`, `UserDto`.
- Produces: `AccountSettingsComponent.nickname` (signal), `photoFile` (signal), `photoPreview` (signal), `onPhotoSelected(event)`, `save()`.

- [ ] **Step 1: Write the failing spec**

Create `fortunecards.client/src/app/pages/account-settings/account-settings.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { AccountSettingsComponent } from './account-settings.component';
import { AuthService } from '../../services/auth.service';
import { getTranslocoTestingModule } from '../../../testing/transloco-testing';

function setup(patchImpl: () => any) {
  const http = { patch: vi.fn(patchImpl), delete: vi.fn(() => of({})) };
  const loadCurrentUser = vi.fn(() => Promise.resolve());
  const auth = {
    currentUser: signal({ id: 1, email: 'a@b.com', displayName: 'Goog', nickname: 'Nick', avatarUrl: null }),
    loadCurrentUser,
    logout: vi.fn(() => Promise.resolve()),
  };
  TestBed.configureTestingModule({
    imports: [AccountSettingsComponent, RouterModule.forRoot([]), getTranslocoTestingModule()],
    providers: [
      provideZonelessChangeDetection(),
      { provide: HttpClient, useValue: http },
      { provide: AuthService, useValue: auth },
    ],
  });
  const fixture = TestBed.createComponent(AccountSettingsComponent);
  fixture.detectChanges();
  return { comp: fixture.componentInstance, http, loadCurrentUser };
}

describe('AccountSettingsComponent', () => {
  it('seeds nickname from the current user', () => {
    const { comp } = setup(() => of({}));
    expect(comp.nickname()).toBe('Nick');
  });

  it('save() posts FormData and refreshes the current user', async () => {
    const { comp, http, loadCurrentUser } = setup(() => of({ id: 1, nickname: 'New' }));
    comp.nickname.set('New');
    comp.save();
    await new Promise((r) => setTimeout(r));

    expect(http.patch).toHaveBeenCalledWith('/api/auth/profile', expect.any(FormData));
    const form = http.patch.mock.calls[0][1] as FormData;
    expect(form.get('Nickname')).toBe('New');
    expect(loadCurrentUser).toHaveBeenCalled();
    expect(comp.saveSuccess()).toBe(true);
    expect(comp.saving()).toBe(false);
  });

  it('save() surfaces an error on failure', async () => {
    const { comp } = setup(() => throwError(() => new Error('boom')));
    comp.save();
    await new Promise((r) => setTimeout(r));

    expect(comp.saveError()).toBeTruthy();
    expect(comp.saving()).toBe(false);
  });
});
```

- [ ] **Step 2: Run the spec to verify it fails**

Run:

```bash
cd fortunecards.client && ng test --watch=false
```

Expected: FAIL — `save`/`nickname` not defined (or type errors).

- [ ] **Step 3: Implement the component logic**

Replace `fortunecards.client/src/app/pages/account-settings/account-settings.component.ts` with:

```ts
import { Component, inject, signal, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../../services/auth.service';
import { UserDto } from '../../models/user';
import { NavigationBar } from '../../components/Navigation/navigation-bar/navigation-bar';

@Component({
  selector: 'app-account-settings',
  standalone: true,
  templateUrl: './account-settings.component.html',
  styleUrls: ['./account-settings.component.css'],
  imports: [CommonModule, FormsModule, NavigationBar, TranslocoDirective],
})
export class AccountSettingsComponent {
  protected readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly transloco = inject(TranslocoService);

  nickname = signal(this.auth.currentUser()?.nickname ?? '');
  photoFile = signal<File | null>(null);
  photoPreview = signal<string | null>(this.auth.currentUser()?.avatarUrl ?? null);
  saving = signal(false);
  saveSuccess = signal(false);
  saveError = signal<string | null>(null);
  deleting = signal(false);

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.photoFile.set(file);
    if (file) this.photoPreview.set(URL.createObjectURL(file));
  }

  save(): void {
    this.saving.set(true);
    this.saveSuccess.set(false);
    this.saveError.set(null);

    const form = new FormData();
    form.append('Nickname', this.nickname().trim());
    const file = this.photoFile();
    if (file) form.append('Photo', file);

    this.http.patch<UserDto>('/api/auth/profile', form)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: async () => {
          await this.auth.loadCurrentUser();
          this.photoFile.set(null);
          this.saving.set(false);
          this.saveSuccess.set(true);
        },
        error: () => {
          this.saving.set(false);
          this.saveError.set(this.transloco.translate('errors.saveFailed'));
        },
      });
  }

  goBack(): void {
    this.router.navigate(['/profile']);
  }

  deleteAccount(): void {
    if (!confirm(this.transloco.translate('pages.accountDeleteConfirm'))) return;
    this.deleting.set(true);
    this.http.delete('/api/auth/account')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.auth.logout().then(() => this.router.navigate(['/decks']));
        },
        error: () => {
          this.deleting.set(false);
          alert(this.transloco.translate('errors.accountDeleteFailed'));
        },
      });
  }
}
```

- [ ] **Step 4: Add the edit UI to the template**

In `fortunecards.client/src/app/pages/account-settings/account-settings.component.html`, add a new profile section inside the `@if (auth.currentUser(); as user)` block, **before** the `connectedAccountLabel` section (after line 10):

```html
    <section class="settings-section">
      <div class="settings-label">{{ t('pages.profileSectionLabel') }}</div>

      <div class="profile-photo-row">
        <div class="settings-avatar">
          @if (photoPreview()) {
            <img class="settings-avatar-img" [src]="photoPreview()" [alt]="t('pages.profilePhotoAlt')" />
          } @else {
            {{ (nickname() || user.displayName)[0] }}
          }
        </div>
        <label class="choose-photo-btn">
          {{ t('pages.choosePhotoButton') }}
          <input type="file" accept="image/*" (change)="onPhotoSelected($event)" hidden />
        </label>
      </div>

      <label class="field-label" for="nickname">{{ t('pages.nicknameLabel') }}</label>
      <input
        id="nickname"
        class="text-input"
        type="text"
        maxlength="50"
        [placeholder]="t('pages.nicknamePlaceholder')"
        [ngModel]="nickname()"
        (ngModelChange)="nickname.set($event)" />

      @if (saveError()) {
        <p class="save-error">{{ saveError() }}</p>
      }
      @if (saveSuccess()) {
        <p class="save-success">{{ t('pages.profileSavedMessage') }}</p>
      }

      <button class="save-profile-btn" (click)="save()" [disabled]="saving()">
        {{ saving() ? t('pages.savingButton') : t('common.save') }}
      </button>
    </section>
```

- [ ] **Step 5: Add styles**

Append to `fortunecards.client/src/app/pages/account-settings/account-settings.component.css`:

```css
.profile-photo-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.settings-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: #4285f4;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 28px;
  font-weight: 600;
  overflow: hidden;
  flex-shrink: 0;
}

.settings-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.choose-photo-btn {
  border: 1px solid #555;
  color: #ccc;
  padding: 7px 16px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}

.choose-photo-btn:hover { background: rgba(255, 255, 255, 0.06); }

.field-label {
  display: block;
  font-size: 13px;
  color: #888;
  margin-bottom: 6px;
}

.text-input {
  width: 100%;
  box-sizing: border-box;
  background: #1e1e1e;
  border: 1px solid #444;
  border-radius: 6px;
  color: #eee;
  padding: 9px 12px;
  font-size: 14px;
  margin-bottom: 14px;
}

.save-profile-btn {
  background: #4285f4;
  border: none;
  color: #fff;
  padding: 8px 18px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
}

.save-profile-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.save-error { color: #f76e6e; font-size: 13px; margin: 0 0 12px; }
.save-success { color: #6ec37f; font-size: 13px; margin: 0 0 12px; }
```

- [ ] **Step 6: Run the spec to verify it passes**

Run:

```bash
cd fortunecards.client && ng test --watch=false
```

Expected: PASS (AccountSettings specs plus the full suite).

- [ ] **Step 7: Commit**

```bash
git add fortunecards.client/src/app/pages/account-settings
git commit -m "67: Add nickname and photo editing to account settings"
```

---

### Task 6: Profile page displays photo + nickname

**Files:**
- Modify: `fortunecards.client/src/app/pages/profile/profile.component.html`
- Modify: `fortunecards.client/src/app/pages/profile/profile.component.css`
- Modify: `fortunecards.client/src/app/pages/profile/profile.component.spec.ts`

**Interfaces:**
- Consumes: `UserDto.nickname`, `UserDto.avatarUrl`.

- [ ] **Step 1: Add failing display specs**

In `fortunecards.client/src/app/pages/profile/profile.component.spec.ts`, add a helper to build the AuthService provider with an overridable user and two new tests. Replace the single `AuthService` provider usage by parameterizing it — add these tests inside the `describe`:

```ts
  function renderWithUser(user: any) {
    const svc = { getMyDecks: vi.fn(() => of([])) };
    TestBed.configureTestingModule({
      imports: [ProfileComponent, RouterModule.forRoot([]), NavigationBar, getTranslocoTestingModule()],
      providers: [
        provideZonelessChangeDetection(),
        { provide: DeckService, useValue: svc },
        { provide: AuthService, useValue: { isLoggedIn: signal(true), currentUser: signal(user) } },
      ],
    });
    const fixture = TestBed.createComponent(ProfileComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders the avatar image when avatarUrl is set', () => {
    const el = renderWithUser({ displayName: 'Goog', email: 't@e.com', nickname: null, avatarUrl: 'https://img/x.png' });
    const img = el.querySelector('.profile-avatar-img') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img!.src).toContain('https://img/x.png');
  });

  it('shows the nickname over the display name', () => {
    const el = renderWithUser({ displayName: 'Goog', email: 't@e.com', nickname: 'Nick', avatarUrl: null });
    expect(el.querySelector('h1')!.textContent).toContain('Nick');
    expect(el.querySelector('.profile-avatar-img')).toBeNull(); // letter fallback
  });
```

- [ ] **Step 2: Run the spec to verify it fails**

Run:

```bash
cd fortunecards.client && ng test --watch=false
```

Expected: FAIL — `.profile-avatar-img` not found / `h1` shows `Goog` not `Nick`.

- [ ] **Step 3: Update the profile template**

In `fortunecards.client/src/app/pages/profile/profile.component.html`, replace the `profile-header` section (lines 8-15) with:

```html
    <section class="profile-header">
      <div class="profile-avatar">
        @if (user.avatarUrl) {
          <img class="profile-avatar-img" [src]="user.avatarUrl" [alt]="user.nickname || user.displayName" />
        } @else {
          {{ (user.nickname || user.displayName)[0] }}
        }
      </div>
      <div class="profile-info">
        <h1>{{ user.nickname || user.displayName }}</h1>
        <p class="profile-email">{{ user.email }}</p>
        <button class="settings-link" (click)="goToSettings()">{{ t('pages.accountSettingsLink') }} →</button>
      </div>
    </section>
```

- [ ] **Step 4: Add the avatar-image style**

In `fortunecards.client/src/app/pages/profile/profile.component.css`, add `overflow: hidden;` to the existing `.profile-avatar` rule (after line 38, before its closing brace add `  overflow: hidden;`), then append:

```css
.profile-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
```

- [ ] **Step 5: Run the spec to verify it passes**

Run:

```bash
cd fortunecards.client && ng test --watch=false
```

Expected: PASS (full suite).

- [ ] **Step 6: Commit**

```bash
git add fortunecards.client/src/app/pages/profile
git commit -m "67: Display custom photo and nickname on profile page"
```

---

## Final verification

- [ ] Backend: `dotnet build FortuneCards.Server` — succeeds.
- [ ] Backend: `dotnet test FortuneCards.Server.Tests` — all pass.
- [ ] Frontend: `cd fortunecards.client && ng test --watch=false` — all pass.
- [ ] Manual smoke (optional, requires running app): sign in → `/profile/settings` → set a nickname, choose a photo, Save → confirm `/profile` shows the new photo and nickname, and a reload preserves them.
