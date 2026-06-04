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
# Frontend (Jasmine + Karma, runs in Chrome)
cd fortunecards.client
ng test

# Single test file
ng test --include="**/app.spec.ts"
```

No backend test project exists yet.

## Architecture

### Backend (`FortuneCards.Server/`)

- **ASP.NET Core 10** minimal API style: no `Startup.cs`, all configuration in `Program.cs`
- Controllers live in `Controllers/`; add new ones following `WeatherForecastController.cs` as a pattern
- In production, `app.UseDefaultFiles()` + `MapStaticAssets()` + `MapFallbackToFile("/index.html")` serve the compiled Angular app from the same origin

### Frontend (`fortunecards.client/`)

- **Angular 21** using NgModules (non-standalone components); root module is `app-module.ts`
- TypeScript strict mode is enabled across all compiler configs
- HTTP calls use `HttpClient` from `HttpClientModule` (imported in `app-module.ts`); use typed generics (`HttpClient.get<T>()`)
- Component state uses Angular signals (`signal()` API)
- Routes defined in `app-routing-module.ts`

### Dev Proxy

`fortunecards.client/src/proxy.conf.js` routes API paths (currently `/weatherforecast`) to the ASP.NET backend. Update this file when adding new API endpoints so the Angular dev server forwards them correctly.

### HTTPS in Development

`aspnetcore-https.js` (run as `prestart`) copies the ASP.NET Core dev certificate for use by the Angular dev server. Both servers use HTTPS locally.
