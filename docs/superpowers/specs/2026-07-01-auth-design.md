# Auth & User Cabinet Design

**Date:** 2026-07-01  
**Status:** Approved  
**Scope:** Google OAuth login, JWT httpOnly cookie, user cabinet, deck ownership and visibility

---

## Overview

Add user authentication to FortuneCards using a custom thin auth layer (no ASP.NET Core Identity). Users log in with Google. A JWT is issued as an httpOnly cookie. Decks gain public/private visibility and are associated with their creator. Unauthenticated users can browse and draw from public decks.

---

## Architecture

**Required configuration (stored in User Secrets for dev, environment variables for prod):**
```
Google:ClientId = <from Google Cloud Console>
Google:ClientSecret = <from Google Cloud Console>
Google:RedirectUri = https://localhost:7242/api/auth/google/callback
Jwt:Secret = <random 256-bit key>
```

**Stack additions:**
- Backend: `Google.Apis.Auth` (token verification), `Microsoft.IdentityModel.Tokens` + `System.IdentityModel.Tokens.Jwt` (JWT generation)
- Frontend: no new packages — Angular signals + HttpClient

**Flow:**
1. User clicks "Sign in with Google" → Angular redirects to `GET /api/auth/google/login`
2. Backend builds Google OAuth2 authorization URL and redirects the browser
3. Google redirects to `GET /api/auth/google/callback?code=...`
4. Backend exchanges code for tokens via `HttpClient` POST to Google's token endpoint, then validates the ID token using `Google.Apis.Auth.GoogleJsonWebSignature.ValidateAsync()`, upserts user in DB
5. Backend issues JWT, sets it as `fortune_auth` httpOnly cookie, redirects to `/`
6. Angular calls `GET /api/auth/me` on app boot to load current user into `AuthService` signal

**JWT cookie properties:**
| Property | Value |
|----------|-------|
| Name | `fortune_auth` |
| HttpOnly | true |
| Secure | true |
| SameSite | Strict (provides CSRF protection for same-origin requests) |
| Expiry | 7 days |
| Contents | userId, email, displayName |

Angular never reads the token — it calls `/api/auth/me` for user state. The browser sends the cookie automatically on every request.

---

## Data Model

### New: `Users` table

```csharp
public class User
{
    public int Id { get; set; }
    public string GoogleId { get; set; } = string.Empty;   // unique index
    public string Email { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? AvatarUrl { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public ICollection<Deck> Decks { get; set; } = [];
}
```

### Updated: `Deck` model

Two new columns added:

```csharp
public int? UserId { get; set; }          // FK to Users, nullable for system user
public bool IsPublic { get; set; } = false; // new decks default to private
public User? User { get; set; }           // navigation property
```

### Migration

1. Create `Users` table with unique index on `GoogleId`
2. Add `UserId` (nullable int FK) and `IsPublic` (bool, default `true`) to `Decks`
3. Seed a system user (`GoogleId = "system"`, `DisplayName = "FortuneCards"`)
4. Update all existing decks: set `UserId = <system user id>`, `IsPublic = true`

New decks created after migration default to `IsPublic = false`.

### Updated DTOs

**`DeckSummary`** — add:
```csharp
public bool IsPublic { get; set; }
public bool IsOwner { get; set; }  // computed: callerUserId == deck.UserId
```

**New: `UserDto`**
```csharp
public record UserDto(int Id, string Email, string DisplayName, string? AvatarUrl);
```

---

## API

### New: `AuthController` — `/api/auth`

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/auth/google/login` | — | Redirect to Google OAuth2 consent page |
| GET | `/api/auth/google/callback` | — | Exchange code, upsert user, set JWT cookie, redirect to `/` |
| GET | `/api/auth/me` | JWT cookie | Return current user as `UserDto`. 401 if not authenticated. |
| POST | `/api/auth/logout` | JWT cookie | Clear JWT cookie. Return 200. |
| DELETE | `/api/auth/account` | JWT cookie | Delete account + private decks. Transfer public decks to system user. |

### Updated: `DecksController`

| Method | Route | Auth | Change |
|--------|-------|------|--------|
| GET | `/api/decks` | optional | Returns public decks + caller's own private decks (if authenticated) |
| GET | `/api/decks/{id}` | optional | Returns deck if public OR caller is owner. 403 otherwise. |
| POST | `/api/decks` | required | Sets `UserId` from JWT. `IsPublic` defaults to `false`. |
| DELETE | `/api/decks/{id}` | required | Owner only. 403 for non-owners. |
| POST | `/api/decks/{id}/cards` | required | Deck owner only. 403 otherwise. |
| PATCH | `/api/decks/{id}/visibility` | required | **New.** Toggle `IsPublic`. Owner only. Body: `{"isPublic": bool}` |

### Updated: `CardsController`

| Method | Route | Auth | Change |
|--------|-------|------|--------|
| DELETE | `/api/cards/{id}` | required | Deck owner only. 403 otherwise. |

### Auth middleware

A custom `JwtMiddleware` reads the `fortune_auth` cookie, validates the JWT, and sets `HttpContext.Items["UserId"]` (int) if valid. Endpoints that need the user call a helper to read from context. Optional-auth endpoints check for null. Required-auth endpoints return 401 if null.

---

## Frontend

### New files

| File | Purpose |
|------|---------|
| `services/auth.service.ts` | Holds `currentUser` signal, login/logout/loadCurrentUser methods |
| `guards/auth.guard.ts` | Redirects unauthenticated users away from `/profile` routes |
| `pages/profile/profile.component.ts` | Profile page: avatar, name, email, My Decks grid |
| `pages/account-settings/account-settings.component.ts` | Settings page: edit display name, connected account, delete account |

### Updated files

| File | Change |
|------|--------|
| `app-routing-module.ts` | Add `/profile` and `/profile/settings` routes with `AuthGuard` |
| `app.component.ts` | Navbar: "Sign in with Google" button vs. avatar + name + logout |
| `models/deck.ts` | Add `isPublic: boolean`, `isOwner: boolean` to `Deck` interface |
| `services/deck.service.ts` | Add `toggleVisibility(deckId, isPublic)` method |
| `pages/decks/decks.component.ts` | Show visibility badge; show edit/delete/toggle controls only when `isOwner` |

### `AuthService` (signal-based)

```typescript
currentUser = signal<UserDto | null>(null);
isLoggedIn = computed(() => this.currentUser() !== null);

login()             // window.location.href = '/api/auth/google/login'
logout()            // POST /api/auth/logout, clear signal, navigate to /
loadCurrentUser()   // GET /api/auth/me → set signal (called in APP_INITIALIZER)
```

`loadCurrentUser()` is called via `APP_INITIALIZER` so user state is resolved before the app renders.

### Routes

```
/                     — public deck list (no guard)
/profile              — AuthGuard required
/profile/settings     — AuthGuard required
/decks/:id            — no guard (public decks visible to all)
```

### UI behavior

- **Unauthenticated:** navbar shows "Sign in with Google"; deck cards show only "Draw cards"; no create/edit/delete buttons visible
- **Authenticated, non-owner:** deck cards show "Draw cards" + creator name + public badge; no edit/delete
- **Authenticated, owner:** deck cards show visibility toggle + edit + delete buttons
- **Private deck:** visible only to owner; does not appear in the public deck list for others

---

## Error handling

| Scenario | Behavior |
|----------|----------|
| Google OAuth fails or is cancelled | Redirect to `/` with query param `?auth=error`; show toast in Angular |
| JWT expired | `/api/auth/me` returns 401; `AuthService` clears signal; user sees login button |
| Non-owner tries write operation | Backend returns 403; Angular shows error toast |
| Delete account confirmation | Frontend shows confirmation dialog before calling DELETE `/api/auth/account` |

---

## Migration strategy for existing decks

1. Run EF migration to add columns
2. Seed system user row
3. SQL update: `UPDATE Decks SET UserId = <system_id>, IsPublic = 1 WHERE UserId IS NULL`
4. Make `UserId` non-nullable after backfill (or keep nullable and treat null as system-owned)

Keeping `UserId` nullable is simpler and avoids a second migration — null means "system owned / public".

---

## Out of scope

- Refresh token rotation (7-day JWT expiry is sufficient; user re-logs in when expired)
- Email/password login
- Admin roles or moderation
- Deck sharing via link (separate feature)
- OAuth state parameter CSRF check on the callback (low risk for SameSite=Strict, can be added later)
