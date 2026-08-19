# User Profile: Custom Nickname & Photo

**Date:** 2026-08-19
**Branch:** `67_UserNickname`
**Status:** Approved design

## Goal

Let a signed-in user set a **custom nickname** and upload a **custom profile photo**, both of
which override the Google-sourced identity without being overwritten on the next login. Editing
happens on the account-settings page; the profile page displays the result.

## Background / Current State

- `User` (`FortuneCards.Server/Models/User.cs`) has `DisplayName` and `AvatarUrl`, both pulled
  from Google and **overwritten on every login** by `AuthService.UpsertUserAsync`.
- The profile page renders only the first letter of the display name
  (`profile.component.html`), never the avatar image.
- `account-settings.component.ts` has a `displayName` signal and `saving`/`saveSuccess`/
  `saveError` signals, but no save action and no nickname/photo UI.
- Card images already establish the upload pattern: `PATCH /api/cards/{id}` (`[FromForm]` with
  `IFormFile? Image`) → `CardService.UpdateAsync` deletes the old key then calls
  `IImageStorage.SaveAsync`, persisting the returned R2 object **key** on `Card.ImageKey`. The
  server builds public URLs via `IImageStorage.PublicUrl(key)`.

## Scope

In scope:
- Custom nickname (separate nullable field; Google `DisplayName` preserved as fallback).
- Upload / replace custom photo (separate nullable R2 key; Google `AvatarUrl` preserved as
  fallback).
- Display on the profile page (avatar image + effective name).
- Edit on the account-settings page.

Out of scope (per brainstorming):
- Removing a custom photo / explicit revert-to-Google button.
- Showing nickname/photo in the navigation bar or on decks/patterns.
- Native-speaker translation of the new UI strings (other locales copy English, matching the
  deferred-translation note in the i18n work).

## Design

### Chosen approach — Option A

Extend the existing `AuthService` + `AuthController`, which already own all `User` CRUD. No new
controller/service scaffolding. `AuthService` gains an `IImageStorage` dependency (the backend
`TestDb` harness already supplies a fake `IImageStorage`).

### 1. Data model

Add two nullable columns to `User`:

```csharp
public string? Nickname { get; set; }
public string? AvatarImageKey { get; set; }
```

EF migration `AddUserProfile`, applied with the `dotnet ef` CLI + `--connection` from
user-secrets (the VS Package Manager Console path fails here due to the esproj ProjectReference).

### 2. Effective display values

Google data is never overwritten. The `/api/auth/me` DTO changes to:

- `displayName` — Google name, unchanged (fallback).
- `nickname` — raw nullable value, so settings can prefill the input.
- `avatarUrl` — **effective** avatar: `PublicUrl(AvatarImageKey)` when a custom photo exists,
  else the Google `AvatarUrl`. May be null → frontend shows the letter placeholder.

The effective **name** (`nickname ?? displayName`) is computed on the frontend.

### 3. API

`PATCH /api/auth/profile` on `AuthController`:

- Requires `HttpContext.Items["UserId"]` (401 otherwise), consistent with `me` / `account`.
- `[FromForm] UpdateProfileRequest { string? Nickname; IFormFile? Photo; }`, mirroring
  `UpdateCardRequest`.
- Returns the updated user DTO (same shape as `me`).

`AuthService.UpdateProfileAsync(int userId, string? nickname, IFormFile? photo)`:

1. Load the user; return null → 404 if missing.
2. Nickname: `Trim()`; empty/whitespace → `null`; reject a trimmed length over 50 chars with a
   `400` (see Error handling).
3. Photo: if provided, delete the old `AvatarImageKey` (if any) via `IImageStorage.DeleteAsync`,
   then `AvatarImageKey = await _imageStorage.SaveAsync(photo)`. Reuse the same image validation
   the card upload flow relies on.
4. `SaveChangesAsync`; return the user.

`IAuthService` gains the `UpdateProfileAsync` signature.

### 4. Frontend

- `models/user.ts`: add `nickname: string | null` to `UserDto`.
- **Account-settings** (`account-settings.component.ts` / `.html`):
  - Replace the unused `displayName` signal with a `nickname` signal seeded from
    `auth.currentUser()?.nickname`.
  - Add a nickname text input and a photo file input with a live preview
    (`photoPreview` signal from the selected `File`, falling back to the current `avatarUrl`).
  - `save()`: build `FormData` (append `Nickname`, append `Photo` if a file is chosen),
    `PATCH /api/auth/profile`, on success `await auth.loadCurrentUser()` to refresh the signal
    and set `saveSuccess`; on error set `saveError`. Toggle `saving` around the call.
- **Profile** (`profile.component.html`):
  - Render `<img>` with `user.avatarUrl` when present; else keep the first-letter placeholder.
  - Show the name as `user.nickname || user.displayName`.

### 5. i18n

Add keys for the new labels (nickname label + placeholder, photo label + choose-file button,
save button, saving state, success message, error message) to **all** `public/i18n/*.json`
locale files. English gets real copy; other locales copy the English values to avoid
missing-key warnings.

### Error handling

- Nickname over the 50-char limit → `400 Bad Request` from the controller with a message the
  frontend surfaces via `saveError`.
- Photo upload/storage failure → propagates as a 5xx; frontend surfaces the generic save error.
- Unauthenticated → `401`.
- Missing user → `404`.

## Testing

Backend (xUnit, `FortuneCards.Server.Tests`, in-memory SQLite + fake `IImageStorage`):
- Nickname is trimmed; empty/whitespace becomes null.
- Nickname over 50 chars is rejected with a 400.
- Photo upload sets `AvatarImageKey` and calls `SaveAsync`.
- Replacing a photo deletes the old key before saving the new one.
- Google `DisplayName` / `AvatarUrl` are left unchanged by a profile update.

Frontend (Vitest):
- Account-settings `save()` posts the expected `FormData` and refreshes the current user on
  success; sets `saveError` on failure.
- Profile renders the avatar image when `avatarUrl` is set and the letter placeholder when null;
  shows `nickname` when set, else `displayName`.

## Files touched (anticipated)

- `FortuneCards.Server/Models/User.cs`
- `FortuneCards.Server/Migrations/*_AddUserProfile.*`
- `FortuneCards.Server/Services/IAuthService.cs`, `AuthService.cs`
- `FortuneCards.Server/Controllers/AuthController.cs`
- `fortunecards.client/src/app/models/user.ts`
- `fortunecards.client/src/app/pages/account-settings/account-settings.component.{ts,html,css}`
- `fortunecards.client/src/app/pages/profile/profile.component.{html,css}`
- `fortunecards.client/public/i18n/*.json`
- Backend + frontend spec files.
