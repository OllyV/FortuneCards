# Azure Application Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add end-to-end Azure Application Insights telemetry — ASP.NET Core server SDK (requests, dependencies, exceptions) plus the Angular browser SDK (page views, route changes, AJAX, JS errors) — wired so the browser gets its connection string at runtime from the backend.

**Architecture:** The server registers the App Insights SDK, which reads its connection string from configuration (`ApplicationInsights:ConnectionString` in dev, the `APPLICATIONINSIGHTS_CONNECTION_STRING` env var in Azure). A tiny anonymous `GET /api/config` endpoint returns that connection string to the browser. On Angular bootstrap, an `APP_INITIALIZER` fetches `/api/config` and initializes a `MonitoringService` wrapping `@microsoft/applicationinsights-web` with `enableAutoRouteTracking`. A custom `ErrorHandler` forwards uncaught errors to App Insights. Everything degrades gracefully: if no connection string is present (local dev, tests), monitoring silently no-ops and the app runs normally.

**Tech Stack:** ASP.NET Core 10, `Microsoft.ApplicationInsights.AspNetCore`; Angular 21 (NgModule bootstrap, signals), `@microsoft/applicationinsights-web`; Vitest.

## Global Constraints

- **Branch:** work happens on `8_AppInsightsAdd` (already created off `main`).
- **Connection string is never committed.** Dev: .NET user secrets (`UserSecretsId` already in the csproj). Prod: Azure App Service application setting `APPLICATIONINSIGHTS_CONNECTION_STRING`.
- **Browser gets the connection string at runtime** via `GET /api/config` — not baked into the Angular build, not committed to source.
- **Graceful degradation is mandatory:** an empty/missing connection string, or a failed `/api/config` fetch, must never throw or block app startup — monitoring just stays inactive.
- **Browser SDK = core `@microsoft/applicationinsights-web` with `enableAutoRouteTracking: true`.** Do NOT add `@microsoft/applicationinsights-angularplugin-js` (it lags Angular releases; Angular 21 is too new).
- **Test runner is Vitest** (`ng test --watch=false`; add `--browsers=ChromeHeadless` only if Chrome can't launch). The existing suite is green (35 tests) and must stay green.
- **Backend has no test project** (consistent with the repo); backend verification is `dotnet build` + a manual `GET /api/config` check.
- **Response JSON is camelCase** (global `JsonNamingPolicy.CamelCase` on controllers).
- **`/api` is already dev-proxied** (`proxy.conf.js`) and served same-origin in prod — no proxy change needed.
- Follow the existing `APP_INITIALIZER`/`initAuth` pattern in `app-module.ts` and the `fetch(...)` pattern in `auth.service.ts`.

---

## File Structure

**Backend (`FortuneCards.Server/`)**
- Modify `FortuneCards.Server.csproj` — add the App Insights package.
- Modify `Program.cs` — register the telemetry SDK.
- Create `Controllers/ConfigController.cs` — `GET /api/config` returning the connection string.
- Modify `appsettings.json` — add an empty `ApplicationInsights:ConnectionString` placeholder for discoverability.

**Frontend (`fortunecards.client/src/app/`)**
- Modify `package.json` (via `npm install`) — add `@microsoft/applicationinsights-web`.
- Create `services/monitoring.service.ts` — SDK wrapper (`init`, `initFromConfig`, `trackException`, `trackEvent`).
- Create `services/monitoring.service.spec.ts` — graceful-degradation tests.
- Create `monitoring-error-handler.ts` — `ErrorHandler` forwarding to `MonitoringService`.
- Modify `app-module.ts` — add the monitoring `APP_INITIALIZER` and the `ErrorHandler` provider.

---

## Task 1: Backend — App Insights SDK + `GET /api/config`

**Files:**
- Modify: `FortuneCards.Server/FortuneCards.Server.csproj`
- Modify: `FortuneCards.Server/Program.cs`
- Create: `FortuneCards.Server/Controllers/ConfigController.cs`
- Modify: `FortuneCards.Server/appsettings.json`

**Interfaces:**
- Produces: `GET /api/config` → `200 OK` with JSON `{ "applicationInsightsConnectionString": "<string, possibly empty>" }`. Anonymous (no auth). Later frontend tasks consume this exact property name.

- [ ] **Step 1: Add the App Insights package**

Run (from repo root):
```bash
dotnet add FortuneCards.Server package Microsoft.ApplicationInsights.AspNetCore
```
This adds the latest stable version to `FortuneCards.Server.csproj`. Expected: a new line similar to (version may resolve newer — keep whatever the CLI writes):
```xml
<PackageReference Include="Microsoft.ApplicationInsights.AspNetCore" Version="2.23.0" />
```

- [ ] **Step 2: Register telemetry in `Program.cs`**

Add the registration alongside the other service registrations — insert it right after the `AddMemoryCache()` line:

```csharp
builder.Services.AddMemoryCache();
builder.Services.AddApplicationInsightsTelemetry();
```

No connection string is passed in code: the SDK reads `ApplicationInsights:ConnectionString` (dev user secret) or the `APPLICATIONINSIGHTS_CONNECTION_STRING` env var (Azure). If neither is set, the SDK stays inactive and the app runs normally.

- [ ] **Step 3: Create the config endpoint**

Create `FortuneCards.Server/Controllers/ConfigController.cs`:

```csharp
using Microsoft.AspNetCore.Mvc;

namespace FortuneCards.Server.Controllers
{
    [ApiController]
    [Route("api/config")]
    public class ConfigController : ControllerBase
    {
        private readonly IConfiguration _config;

        public ConfigController(IConfiguration config) => _config = config;

        [HttpGet]
        public IActionResult GetConfig()
        {
            var connectionString =
                _config["ApplicationInsights:ConnectionString"]
                ?? _config["APPLICATIONINSIGHTS_CONNECTION_STRING"]
                ?? string.Empty;

            return Ok(new { applicationInsightsConnectionString = connectionString });
        }
    }
}
```

The endpoint is anonymous by design — the App Insights connection string is an ingestion-only credential safe to expose to the browser (which is where it has to run anyway). Reading both config keys covers dev (`ApplicationInsights:ConnectionString` user secret) and Azure (`APPLICATIONINSIGHTS_CONNECTION_STRING` app setting).

- [ ] **Step 4: Add a config placeholder to `appsettings.json`**

Add an `ApplicationInsights` section (mirrors the empty `DefaultConnection` convention) so the config key is discoverable. Result:

```json
{
  "ConnectionStrings": {
    "DefaultConnection": ""
  },
  "ApplicationInsights": {
    "ConnectionString": ""
  },
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "AllowedHosts": "*"
}
```

- [ ] **Step 5: Build to verify it compiles**

Run: `dotnet build`
Expected: Build succeeded, 0 errors.

- [ ] **Step 6: Commit**

```bash
git add FortuneCards.Server/FortuneCards.Server.csproj FortuneCards.Server/Program.cs FortuneCards.Server/Controllers/ConfigController.cs FortuneCards.Server/appsettings.json
git commit -m "feat: add Application Insights server SDK and /api/config endpoint"
```

---

## Task 2: Frontend — `MonitoringService` + browser SDK

**Files:**
- Modify: `fortunecards.client/package.json` (via `npm install`)
- Create: `fortunecards.client/src/app/services/monitoring.service.ts`
- Create: `fortunecards.client/src/app/services/monitoring.service.spec.ts`

**Interfaces:**
- Consumes: `GET /api/config` (Task 1) returning `{ applicationInsightsConnectionString: string }`.
- Produces: `MonitoringService` (root-provided) with:
  - `init(connectionString: string): void` — no-op if the string is empty or already initialized.
  - `initFromConfig(): Promise<void>` — fetches `/api/config` and calls `init`; never rejects.
  - `trackException(error: unknown): void`
  - `trackEvent(name: string, properties?: Record<string, unknown>): void`

- [ ] **Step 1: Install the browser SDK**

Run (from `fortunecards.client/`):
```bash
npm install @microsoft/applicationinsights-web
```
Expected: `@microsoft/applicationinsights-web` added under `dependencies` in `package.json`.

- [ ] **Step 2: Write the failing spec**

Create `fortunecards.client/src/app/services/monitoring.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { MonitoringService } from './monitoring.service';

describe('MonitoringService', () => {
  let service: MonitoringService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), MonitoringService],
    });
    service = TestBed.inject(MonitoringService);
  });

  it('does not throw when tracking before initialization', () => {
    expect(() => service.trackException(new Error('boom'))).not.toThrow();
    expect(() => service.trackEvent('test')).not.toThrow();
  });

  it('stays inactive when init is called with an empty connection string', () => {
    service.init('');
    expect(service.isInitialized()).toBe(false);
    expect(() => service.trackException(new Error('boom'))).not.toThrow();
  });
});
```

- [ ] **Step 3: Run the spec to verify it fails**

Run: `ng test --watch=false`
Expected: FAIL — `monitoring.service` module / `MonitoringService` does not exist yet.

- [ ] **Step 4: Implement `MonitoringService`**

Create `fortunecards.client/src/app/services/monitoring.service.ts`:

```typescript
import { Injectable } from '@angular/core';
import { ApplicationInsights } from '@microsoft/applicationinsights-web';

interface AppConfig {
  applicationInsightsConnectionString?: string;
}

@Injectable({ providedIn: 'root' })
export class MonitoringService {
  private appInsights: ApplicationInsights | null = null;

  /** Fetch the connection string from the backend and initialize. Never rejects. */
  async initFromConfig(): Promise<void> {
    try {
      const res = await fetch('/api/config');
      if (!res.ok) return;
      const cfg = (await res.json()) as AppConfig;
      this.init(cfg.applicationInsightsConnectionString ?? '');
    } catch {
      // Monitoring is best-effort — never block or fail app startup.
    }
  }

  /** Initialize the SDK. No-op if there is no connection string or it is already initialized. */
  init(connectionString: string): void {
    if (!connectionString || this.appInsights) return;
    this.appInsights = new ApplicationInsights({
      config: {
        connectionString,
        enableAutoRouteTracking: true,
      },
    });
    this.appInsights.loadAppInsights();
    this.appInsights.trackPageView();
  }

  isInitialized(): boolean {
    return this.appInsights !== null;
  }

  trackException(error: unknown): void {
    this.appInsights?.trackException({
      exception: error instanceof Error ? error : new Error(String(error)),
    });
  }

  trackEvent(name: string, properties?: Record<string, unknown>): void {
    this.appInsights?.trackEvent({ name }, properties);
  }
}
```

- [ ] **Step 5: Run the spec to verify it passes**

Run: `ng test --watch=false`
Expected: PASS — the two `MonitoringService` tests are green; the existing suite stays green (37 tests total).

- [ ] **Step 6: Commit**

```bash
git add fortunecards.client/package.json fortunecards.client/package-lock.json fortunecards.client/src/app/services/monitoring.service.ts fortunecards.client/src/app/services/monitoring.service.spec.ts
git commit -m "feat: add MonitoringService wrapping the App Insights web SDK"
```

---

## Task 3: Frontend — wire monitoring into bootstrap

**Files:**
- Create: `fortunecards.client/src/app/monitoring-error-handler.ts`
- Modify: `fortunecards.client/src/app/app-module.ts`

**Interfaces:**
- Consumes: `MonitoringService.initFromConfig()` and `MonitoringService.trackException()` (Task 2).
- Produces: on app bootstrap, monitoring initializes via `APP_INITIALIZER`; uncaught Angular errors flow to App Insights via a custom `ErrorHandler`.

- [ ] **Step 1: Create the error handler**

Create `fortunecards.client/src/app/monitoring-error-handler.ts`:

```typescript
import { ErrorHandler, Injectable, inject } from '@angular/core';
import { MonitoringService } from './services/monitoring.service';

@Injectable()
export class MonitoringErrorHandler implements ErrorHandler {
  private readonly monitoring = inject(MonitoringService);

  handleError(error: unknown): void {
    this.monitoring.trackException(error);
    console.error(error);
  }
}
```

- [ ] **Step 2: Wire the initializer and error handler into `app-module.ts`**

Add the imports, an `initMonitoring` factory (mirroring the existing `initAuth`), a second `APP_INITIALIZER`, and the `ErrorHandler` provider. The full file becomes:

```typescript
import { APP_INITIALIZER, ErrorHandler, NgModule, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { DeckListComponent } from './components/deck-list/deck-list.component';
import { DeckDetailComponent } from './components/deck-detail/deck-detail.component';
import { NavigationBar } from './components/navigation-bar/navigation-bar';
import { AuthService } from './services/auth.service';
import { MonitoringService } from './services/monitoring.service';
import { MonitoringErrorHandler } from './monitoring-error-handler';

function initAuth(auth: AuthService): () => Promise<void> {
  return () => auth.loadCurrentUser();
}

function initMonitoring(monitoring: MonitoringService): () => Promise<void> {
  return () => monitoring.initFromConfig();
}

@NgModule({
  declarations: [App, DeckListComponent, DeckDetailComponent],
  imports: [BrowserModule, FormsModule, ReactiveFormsModule, AppRoutingModule, NavigationBar],
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideHttpClient(),
    { provide: APP_INITIALIZER, useFactory: initAuth, deps: [AuthService], multi: true },
    { provide: APP_INITIALIZER, useFactory: initMonitoring, deps: [MonitoringService], multi: true },
    { provide: ErrorHandler, useClass: MonitoringErrorHandler },
  ],
  bootstrap: [App],
})
export class AppModule {}
```

`initMonitoring` returns a promise that never rejects (Task 2 guarantees `initFromConfig` swallows errors), so a missing/unreachable `/api/config` cannot block bootstrap.

- [ ] **Step 3: Run the full suite**

Run: `ng test --watch=false`
Expected: PASS — all 37 tests green. (Component specs use TestBed, not `AppModule`, so the new `APP_INITIALIZER`/`ErrorHandler` do not run in them; `MonitoringService.initFromConfig` uses `fetch`, not `HttpClient`, so it creates no unflushed `HttpTestingController` request.)

- [ ] **Step 4: Production build to confirm the app compiles and the SDK bundles**

Run (from `fortunecards.client/`): `ng build`
Expected: Build completes with no errors.

- [ ] **Step 5: Commit**

```bash
git add fortunecards.client/src/app/monitoring-error-handler.ts fortunecards.client/src/app/app-module.ts
git commit -m "feat: initialize App Insights on bootstrap and route errors to it"
```

---

## Task 4: Configuration & end-to-end verification

**Files:** none (operational configuration + verification only).

- [ ] **Step 1: Set the dev connection string (user runs, with the real value)**

Run (from repo root — replace with the actual connection string):
```bash
dotnet user-secrets --project FortuneCards.Server set "ApplicationInsights:ConnectionString" "InstrumentationKey=...;IngestionEndpoint=...;LiveEndpoint=..."
```
This makes both the server SDK and the `/api/config` endpoint pick up the string locally. The value stays in the user-secrets store, never in the repo.

- [ ] **Step 2: Set the production connection string in Azure (manual, one-time)**

In the Azure Portal for App Service **FortuneCards** → Settings → Environment variables → Application settings, add:
- Name: `APPLICATIONINSIGHTS_CONNECTION_STRING`
- Value: the connection string
Save and let the app restart. (Linking the App Insights resource to the App Service sets this automatically; verify the setting exists either way.)

- [ ] **Step 3: Verify the config endpoint locally**

Run the backend (`dotnet run --project FortuneCards.Server`) and in another shell:
```bash
curl -k https://localhost:7242/api/config
```
Expected: JSON `{"applicationInsightsConnectionString":"InstrumentationKey=...;..."}` (non-empty, matching your dev secret).

- [ ] **Step 4: Verify browser telemetry end-to-end**

Run both servers (VS F5, or `dotnet run` + `npm start`). In the browser, load the app and navigate between a couple of routes (e.g. `/decks` → a deck → a card). In the Azure Portal, open the App Insights resource → Transaction search (or Live metrics) and confirm within a few minutes:
- Server-side **Request** telemetry for the API calls (e.g. `GET /api/decks`).
- Browser-side **Page View** telemetry for the route changes.

- [ ] **Step 5: Confirm graceful degradation**

Temporarily clear the dev secret (`dotnet user-secrets --project FortuneCards.Server remove "ApplicationInsights:ConnectionString"`), run the app, and confirm it starts and works normally with no console errors from monitoring (the SDK stays inactive, `/api/config` returns an empty string). Restore the secret afterward (Step 1).

---

## Notes for the implementer

- **No database migration**, no changes to auth, decks, or cards.
- The one place ordering matters: Task 3 depends on `MonitoringService` from Task 2, which depends on the `/api/config` shape from Task 1. Implement in order.
- Do not add the Angular App Insights plugin; the core web SDK's `enableAutoRouteTracking` covers SPA route page views.
