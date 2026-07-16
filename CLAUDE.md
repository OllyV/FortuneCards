# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FortuneCards is an ASP.NET Core 10.0 + Angular 21 full-stack solution for creating fortune card decks. The backend hosts the compiled Angular SPA in production; during development, an Angular dev server proxies API calls to the backend.

## Development Commands

### Running the App

The typical workflow is to run both the backend and frontend together. The simplest approach is to open the solution in Visual Studio and press F5 — it automatically starts the Angular dev server via `npm start` as part of the SPA proxy configuration.

Alternatively, run each manually:

```powershell
# Backend (from repo root)
dotnet run --project FortuneCards.Server

# Frontend (from fortunecards.client/)
npm start
```

- Backend: `https://localhost:7242` or `http://localhost:5199`
- Frontend dev server: `https://127.0.0.1:51313`

### Build

```powershell
# Backend
dotnet build

# Frontend (production build)
cd fortunecards.client
ng build
```

### Tests

```powershell
cd fortunecards.client
ng test                 # watch mode
ng test --watch=false   # single run (use for CI / verification)
```

The frontend test runner is **Vitest** (via the `@angular/build` builder — not Karma/Jasmine). Specs use `describe`/`it`/`expect` plus `vitest` utilities (e.g. `vi.spyOn`), and all spec files compile as one bundle, so a type error in any spec fails the whole run. All components are **standalone** — register them (and any standalone components their templates render, e.g. `NavigationBar`) in `TestBed` via `imports:`, never `declarations:`. Import `CommonModule` only where a component uses `*ngIf`/`*ngFor` (newer components use the `@if`/`@for` control-flow syntax and don't need it).

No backend test project exists; verify the backend with `dotnet build`.

## Architecture

### Backend (`FortuneCards.Server/`)

- **ASP.NET Core 10** minimal API style: no `Startup.cs`, all configuration in `Program.cs`
- Controllers live in `Controllers/`; follow `DecksController.cs` / `CardsController.cs` as patterns. Business logic lives in `Services/` (`IDeckService`, `ICardService`, `IAuthService`)
- Domain: a `Deck` (owned by a `User`) has many `Card`s, persisted with EF Core (`FortuneCardsDbContext`, SQL Server). Runtime-uploaded images are stored in Azure Blob Storage via `Services/ImageStorage.cs` (`IImageStorage`); absolute blob URLs are persisted on `Card.ImageUrl`/`Deck.CardBackImageUrl` and served directly to the browser from a public-read container.
- Auth: Google OAuth → JWT in an HttpOnly cookie; `JwtMiddleware` populates `HttpContext.Items["UserId"]`. Ownership is enforced by comparing `deck.UserId` to the current user, and both not-found and not-owner return `404` (no existence leak)
- In production, `app.UseDefaultFiles()` + `MapStaticAssets()` + `MapFallbackToFile("/index.html")` serve the compiled Angular app from the same origin

### Frontend (`fortunecards.client/`)

- **Angular 21**, fully **standalone components** (no NgModules); the app is bootstrapped in `main.ts` via `bootstrapApplication(App, { providers: [...] })`, and the root component is `app.ts`
- TypeScript strict mode is enabled across all compiler configs
- HTTP calls use `HttpClient` (provided via `provideHttpClient()` in `main.ts`); use typed generics (`HttpClient.get<T>()`)
- Component state uses Angular signals (`signal()` API)
- Routes defined in `app.routes.ts` (the `routes` array), wired via `provideRouter(routes)` in `main.ts`

### Dev Proxy

`fortunecards.client/src/proxy.conf.js` routes `/api` and `/images` to the ASP.NET backend. New endpoints under those prefixes are forwarded automatically; update this file only if you add a path outside them.

### Monitoring (Application Insights)

- Server telemetry: `Microsoft.ApplicationInsights.AspNetCore` via `builder.Services.AddApplicationInsightsTelemetry()` in `Program.cs`.
- Browser telemetry: `@microsoft/applicationinsights-web`, wrapped by `services/monitoring.service.ts` (`enableAutoRouteTracking`), initialized on startup by an `APP_INITIALIZER` provider in `main.ts`; `monitoring-error-handler.ts` forwards uncaught errors.
- The browser fetches its connection string at runtime from the anonymous `GET /api/config` endpoint (`ConfigController`) — nothing is baked into the build.
- Connection string config: **dev** via `dotnet user-secrets set "ApplicationInsights:ConnectionString" "<value>"`; **prod** via the Azure App Service application setting `APPLICATIONINSIGHTS_CONNECTION_STRING`. With no connection string set, telemetry silently no-ops and the app runs normally.

### HTTPS in Development

`aspnetcore-https.js` (run as `prestart`) copies the ASP.NET Core dev certificate for use by the Angular dev server. Both servers use HTTPS locally.
