# Multi-language UI Support (i18n) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users read the FortuneCards UI in 7 languages and switch language at runtime, with the choice auto-detected and remembered.

**Architecture:** Runtime translation via `@jsverse/transloco`. One JSON file per language served from `public/i18n/`, loaded over HTTP. A signal-based `LanguageService` resolves/persists the active language; a `LanguageSwitcher` in the hamburger menu switches it instantly. Existing specs stay green via a shared Transloco testing helper seeded with the real `en.json`.

**Tech Stack:** Angular 21 (standalone, zoneless, signals), `@jsverse/transloco@^8.4.0`, Vitest.

## Global Constraints

- **Frontend-only.** No backend, DTO, or DB changes. Language preference lives in `localStorage['fc.lang']`, never on the server.
- **Languages (8-code list, `en` is base + fallback):** `en`, `uk`, `ru`, `es`, `de`, `fr`, `pt`. Native display names: `English`, `Українська`, `Русский`, `Español`, `Deutsch`, `Français`, `Português`.
- **Translation JSON location:** `public/i18n/<lang>.json` (this project serves static assets from `public/`, glob `**/*` — see `angular.json`; do NOT use `src/assets/` and do NOT edit `angular.json`). Served at `/i18n/<lang>.json`; the dev proxy only forwards `/api` and `/images`, so `/i18n` is served by the dev server automatically.
- **Key convention:** nested JSON grouped by feature — `common.*`, `language.*`, `nav.*`, `deck.*`, `card.*`, `pattern.*`, `table.*`, `pages.*`, `errors.*`. `common.*` holds shared verbs (Save/Cancel/Delete/Loading/…). Reuse `common.*` keys rather than duplicating a word inside a feature namespace.
- **Every key present in all 7 files.** `en.json` is authored verbatim from the existing English copy. The other 6 are machine-translated by the implementing agent at the time each namespace is added — never leave a non-`en` file missing a key (Transloco would fall back to `en`, but we want full coverage).
- **Components are standalone**; register them in `TestBed` via `imports:`, never `declarations:`. All specs provide `provideZonelessChangeDetection()`.
- **Template usage:** prefer the structural directive `*transloco="let t"` and read `t('group.key')`; use the `| transloco` pipe only for attribute/`aria-label`/`[title]` bindings where a structural directive is awkward.
- **Verification per task:** run the affected specs; the full suite (`ng test --watch=false`) must be green before the final task completes. Never claim green without the command output.

---

## File Structure

**New files**
- `public/i18n/en.json` … `public/i18n/pt.json` — translation dictionaries (7 files).
- `src/app/services/transloco-loader.ts` — `TranslocoHttpLoader` (`TranslocoLoader` impl).
- `src/app/services/language.service.ts` — active-language resolution/persistence (+ `.spec.ts`).
- `src/testing/transloco-testing.ts` — shared testing module seeded with real `en.json`.
- `src/app/components/Navigation/language-switcher/language-switcher.ts` (+ `.html`, `.css`, `.spec.ts`) — switcher UI.

**Modified files**
- `src/main.ts` — add `provideTransloco(...)` and a `LanguageService` app-initializer.
- Every component under `src/app/components/**` and `src/app/pages/**` with user-facing English text (29 templates) + their in-code user-facing strings.
- Specs whose components start using Transloco — add the testing helper to `imports`.

---

## Task 1: Transloco config, HTTP loader, and seed JSON files

**Files:**
- Create: `public/i18n/en.json`, `public/i18n/uk.json`, `public/i18n/ru.json`, `public/i18n/es.json`, `public/i18n/de.json`, `public/i18n/fr.json`, `public/i18n/pt.json`
- Create: `src/app/services/transloco-loader.ts`
- Modify: `src/main.ts`
- Test: `src/app/services/transloco-loader.spec.ts`

**Interfaces:**
- Produces: `TranslocoHttpLoader` (class implementing `TranslocoLoader`, `getTranslation(lang: string): Observable<Translation>` fetching `/i18n/${lang}.json`). `provideTransloco` registered in `main.ts` with `availableLangs: ['en','uk','ru','es','de','fr','pt']`, `defaultLang: 'en'`, `fallbackLang: 'en'`, `reRenderOnLangChange: true`.
- Consumes: `HttpClient` (already provided in `main.ts`).

- [ ] **Step 1: Install the dependency**

Run:
```bash
cd fortunecards.client && npm install @jsverse/transloco@^8.4.0
```
Expected: `@jsverse/transloco` added to `dependencies` in `package.json`; no peer-dependency errors (peer is `@angular/core >=16`).

- [ ] **Step 2: Create the 7 seed JSON files with the `common` namespace**

Author `public/i18n/en.json`:
```json
{
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "edit": "Edit",
    "close": "Close",
    "loading": "Loading…",
    "retry": "Retry",
    "back": "Back",
    "confirm": "Confirm"
  }
}
```
Create `uk.json`, `ru.json`, `es.json`, `de.json`, `fr.json`, `pt.json` with the SAME keys, values machine-translated. For example `uk.json`:
```json
{
  "common": {
    "save": "Зберегти",
    "cancel": "Скасувати",
    "delete": "Видалити",
    "edit": "Редагувати",
    "close": "Закрити",
    "loading": "Завантаження…",
    "retry": "Повторити",
    "back": "Назад",
    "confirm": "Підтвердити"
  }
}
```
(Translate the remaining `ru/es/de/fr/pt` equivalently.)

- [ ] **Step 3: Write the failing loader test**

Create `src/app/services/transloco-loader.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TranslocoHttpLoader } from './transloco-loader';

describe('TranslocoHttpLoader', () => {
  it('fetches /i18n/<lang>.json', () => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        TranslocoHttpLoader,
      ],
    });
    const loader = TestBed.inject(TranslocoHttpLoader);
    const http = TestBed.inject(HttpTestingController);
    let result: unknown;
    loader.getTranslation('uk').subscribe((t) => (result = t));
    const req = http.expectOne('/i18n/uk.json');
    req.flush({ common: { save: 'Зберегти' } });
    expect(result).toEqual({ common: { save: 'Зберегти' } });
    http.verify();
  });
});
```

- [ ] **Step 4: Run it and confirm it fails**

Run: `npx vitest run src/app/services/transloco-loader.spec.ts`
Expected: FAIL — cannot find module `./transloco-loader`.

- [ ] **Step 5: Implement the loader**

Create `src/app/services/transloco-loader.ts`:
```typescript
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Translation, TranslocoLoader } from '@jsverse/transloco';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class TranslocoHttpLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);

  getTranslation(lang: string): Observable<Translation> {
    return this.http.get<Translation>(`/i18n/${lang}.json`);
  }
}
```

- [ ] **Step 6: Run the loader test — expect PASS**

Run: `npx vitest run src/app/services/transloco-loader.spec.ts`
Expected: PASS.

- [ ] **Step 7: Wire `provideTransloco` into `main.ts`**

In `src/main.ts` add imports and provider. Add to the top:
```typescript
import { provideTransloco } from '@jsverse/transloco';
import { TranslocoHttpLoader } from './app/services/transloco-loader';
```
Add inside the `providers` array (after `provideHttpClient(...)`):
```typescript
    provideTransloco({
      config: {
        availableLangs: ['en', 'uk', 'ru', 'es', 'de', 'fr', 'pt'],
        defaultLang: 'en',
        fallbackLang: 'en',
        reRenderOnLangChange: true,
        missingHandler: { logMissingKey: false },
        prodMode: false,
      },
      loader: TranslocoHttpLoader,
    }),
```

- [ ] **Step 8: Verify build**

Run: `cd fortunecards.client && npx ng build --configuration development`
Expected: build succeeds; `dist/**/i18n/*.json` present in output (copied from `public/`).

- [ ] **Step 9: Commit**

```bash
git add fortunecards.client/package.json fortunecards.client/package-lock.json fortunecards.client/public/i18n fortunecards.client/src/app/services/transloco-loader.ts fortunecards.client/src/app/services/transloco-loader.spec.ts fortunecards.client/src/main.ts
git commit -m "i18n: add Transloco config, HTTP loader, and common namespace"
```

---

## Task 2: LanguageService (detect / persist / fallback / html lang)

**Files:**
- Create: `src/app/services/language.service.ts`
- Test: `src/app/services/language.service.spec.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `TranslocoService` (from Task 1 config).
- Produces:
  - `LANGUAGES: readonly { code: string; nativeName: string }[]` — the 7 languages in the Global Constraints order.
  - `LanguageService` with: `readonly current: Signal<string>`; `init(): Promise<void>` (resolves initial lang, loads it, sets it active, sets `<html lang>`); `setLanguage(code: string): void` (sets active lang, persists to `localStorage['fc.lang']`, sets `<html lang>`).
  - `STORAGE_KEY = 'fc.lang'`.

- [ ] **Step 1: Write failing tests**

Create `src/app/services/language.service.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TranslocoService, provideTransloco } from '@jsverse/transloco';
import { of } from 'rxjs';
import { LanguageService, LANGUAGES, STORAGE_KEY } from './language.service';

class StubLoader {
  getTranslation() {
    return of({});
  }
}

function configure(): LanguageService {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideTransloco({
        config: {
          availableLangs: LANGUAGES.map((l) => l.code),
          defaultLang: 'en',
          fallbackLang: 'en',
        },
        loader: StubLoader,
      }),
    ],
  });
  return TestBed.inject(LanguageService);
}

describe('LanguageService', () => {
  beforeEach(() => localStorage.clear());

  it('exposes the 7 supported languages with native names', () => {
    expect(LANGUAGES.map((l) => l.code)).toEqual(['en', 'uk', 'ru', 'es', 'de', 'fr', 'pt']);
    expect(LANGUAGES.find((l) => l.code === 'uk')!.nativeName).toBe('Українська');
  });

  it('uses the persisted language when present', async () => {
    localStorage.setItem(STORAGE_KEY, 'de');
    const svc = configure();
    await svc.init();
    expect(svc.current()).toBe('de');
    expect(document.documentElement.lang).toBe('de');
  });

  it('falls back through browser language to en', async () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('fr-FR');
    const svc = configure();
    await svc.init();
    expect(svc.current()).toBe('fr');
  });

  it('defaults to en for an unsupported browser language', async () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('ja-JP');
    const svc = configure();
    await svc.init();
    expect(svc.current()).toBe('en');
  });

  it('setLanguage persists and updates active lang + html lang', async () => {
    const svc = configure();
    await svc.init();
    svc.setLanguage('es');
    expect(svc.current()).toBe('es');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('es');
    expect(document.documentElement.lang).toBe('es');
    expect(TestBed.inject(TranslocoService).getActiveLang()).toBe('es');
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/app/services/language.service.spec.ts`
Expected: FAIL — cannot find module `./language.service`.

- [ ] **Step 3: Implement the service**

Create `src/app/services/language.service.ts`:
```typescript
import { inject, Injectable, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

export const STORAGE_KEY = 'fc.lang';

export const LANGUAGES: readonly { code: string; nativeName: string }[] = [
  { code: 'en', nativeName: 'English' },
  { code: 'uk', nativeName: 'Українська' },
  { code: 'ru', nativeName: 'Русский' },
  { code: 'es', nativeName: 'Español' },
  { code: 'de', nativeName: 'Deutsch' },
  { code: 'fr', nativeName: 'Français' },
  { code: 'pt', nativeName: 'Português' },
];

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly transloco = inject(TranslocoService);
  private readonly _current = signal(this.transloco.getDefaultLang());
  readonly current = this._current.asReadonly();

  async init(): Promise<void> {
    const lang = this.resolveInitialLang();
    await firstValueFrom(this.transloco.load(lang));
    this.apply(lang);
  }

  setLanguage(code: string): void {
    if (!LANGUAGES.some((l) => l.code === code)) {
      return;
    }
    localStorage.setItem(STORAGE_KEY, code);
    this.apply(code);
  }

  private apply(code: string): void {
    this.transloco.setActiveLang(code);
    this._current.set(code);
    document.documentElement.lang = code;
  }

  private resolveInitialLang(): string {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && LANGUAGES.some((l) => l.code === stored)) {
      return stored;
    }
    const browser = (navigator.language || 'en').slice(0, 2).toLowerCase();
    return LANGUAGES.some((l) => l.code === browser) ? browser : 'en';
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run src/app/services/language.service.spec.ts`
Expected: PASS (all 5).

- [ ] **Step 5: Wire the app-initializer in `main.ts`**

Add import:
```typescript
import { LanguageService } from './app/services/language.service';
```
Add a factory near `initMonitoring`:
```typescript
function initLanguage(language: LanguageService): () => Promise<void> {
  return () => language.init();
}
```
Add to `providers` (after the two existing `APP_INITIALIZER` entries):
```typescript
    { provide: APP_INITIALIZER, useFactory: initLanguage, deps: [LanguageService], multi: true },
```

- [ ] **Step 6: Verify build + service tests**

Run: `npx ng build --configuration development && npx vitest run src/app/services/language.service.spec.ts`
Expected: build succeeds; tests PASS.

- [ ] **Step 7: Commit**

```bash
git add fortunecards.client/src/app/services/language.service.ts fortunecards.client/src/app/services/language.service.spec.ts fortunecards.client/src/main.ts
git commit -m "i18n: add LanguageService with detect/persist/fallback and startup wiring"
```

---

## Task 3: Shared Transloco testing helper

**Files:**
- Create: `src/testing/transloco-testing.ts`

**Interfaces:**
- Produces: `getTranslocoTestingModule(): DynamicModule` — returns `TranslocoTestingModule.forRoot(...)` seeded with the real `en.json`, `defaultLang: 'en'`, `preloadLangs: true`. Later tasks add `getTranslocoTestingModule()` to a spec's `imports` array so `*transloco`/`| transloco` resolve English synchronously.

- [ ] **Step 1: Implement the helper**

Create `src/testing/transloco-testing.ts`:
```typescript
import { TranslocoTestingModule, TranslocoTestingOptions } from '@jsverse/transloco';
import en from '../../public/i18n/en.json';

export function getTranslocoTestingModule(options: TranslocoTestingOptions = {}) {
  return TranslocoTestingModule.forRoot({
    langs: { en },
    translocoConfig: {
      availableLangs: ['en'],
      defaultLang: 'en',
    },
    preloadLangs: true,
    ...options,
  });
}
```

Note: importing a JSON file requires `resolveJsonModule` — verify it is enabled in `tsconfig.json` (Angular's base config enables it by default). If the import errors, add `"resolveJsonModule": true` to `compilerOptions` in `tsconfig.json` and include it in the commit.

- [ ] **Step 2: Prove the helper compiles and resolves keys**

Add a temporary throwaway check by running the existing suite once (no assertion changes yet):
Run: `npx vitest run src/app/services/transloco-loader.spec.ts`
Expected: PASS (this confirms the JSON import + module compile don't break the bundle).

- [ ] **Step 3: Commit**

```bash
git add fortunecards.client/src/testing/transloco-testing.ts fortunecards.client/tsconfig.json
git commit -m "i18n: add shared Transloco testing helper seeded with en.json"
```

---

## Task 4: LanguageSwitcher component

**Files:**
- Create: `src/app/components/Navigation/language-switcher/language-switcher.ts`, `.html`, `.css`
- Test: `src/app/components/Navigation/language-switcher/language-switcher.spec.ts`
- Modify: `public/i18n/*.json` (add `language` namespace)

**Interfaces:**
- Consumes: `LanguageService` (`current`, `setLanguage`, `LANGUAGES`), `getTranslocoTestingModule` (test only).
- Produces: `<language-switcher />` standalone component (selector `language-switcher`), rendering one `.lang-option` button per language, marking the active one with `aria-current="true"` and a `.active` class, calling `language.setLanguage(code)` on click.

- [ ] **Step 1: Add the `language` namespace to all 7 JSON files**

Add to `en.json`:
```json
  "language": {
    "label": "Language"
  }
```
Add the same key to the other 6 files (`uk`: `"Мова"`, `ru`: `"Язык"`, `es`: `"Idioma"`, `de`: `"Sprache"`, `fr`: `"Langue"`, `pt`: `"Idioma"`).

- [ ] **Step 2: Write the failing test**

Create `src/app/components/Navigation/language-switcher/language-switcher.spec.ts`:
```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { LanguageSwitcherComponent } from './language-switcher';
import { LanguageService, LANGUAGES } from '../../../services/language.service';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing';

describe('LanguageSwitcherComponent', () => {
  let fixture: ComponentFixture<LanguageSwitcherComponent>;
  let setLanguage: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    setLanguage = vi.fn();
    await TestBed.configureTestingModule({
      imports: [LanguageSwitcherComponent, getTranslocoTestingModule()],
      providers: [
        provideZonelessChangeDetection(),
        { provide: LanguageService, useValue: { current: () => 'en', setLanguage, LANGUAGES } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(LanguageSwitcherComponent);
    fixture.detectChanges();
  });

  it('renders one option per supported language', () => {
    const options = fixture.nativeElement.querySelectorAll('.lang-option');
    expect(options.length).toBe(LANGUAGES.length);
  });

  it('marks the active language', () => {
    const active = fixture.nativeElement.querySelector('.lang-option.active');
    expect(active!.textContent).toContain('English');
    expect(active!.getAttribute('aria-current')).toBe('true');
  });

  it('calls setLanguage on click', () => {
    const options = Array.from(
      fixture.nativeElement.querySelectorAll('.lang-option'),
    ) as HTMLButtonElement[];
    options.find((b) => b.textContent!.includes('Español'))!.click();
    expect(setLanguage).toHaveBeenCalledWith('es');
  });
});
```

- [ ] **Step 3: Run and confirm failure**

Run: `npx vitest run src/app/components/Navigation/language-switcher/language-switcher.spec.ts`
Expected: FAIL — cannot find module `./language-switcher`.

- [ ] **Step 4: Implement the component**

Create `language-switcher.ts`:
```typescript
import { Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { LanguageService, LANGUAGES } from '../../../services/language.service';

@Component({
  selector: 'language-switcher',
  standalone: true,
  imports: [TranslocoDirective],
  templateUrl: './language-switcher.html',
  styleUrl: './language-switcher.css',
})
export class LanguageSwitcherComponent {
  private readonly language = inject(LanguageService);
  protected readonly languages = LANGUAGES;
  protected readonly current = this.language.current;

  select(code: string): void {
    this.language.setLanguage(code);
  }
}
```

Create `language-switcher.html`:
```html
<div class="lang-switcher" *transloco="let t">
  <div class="lang-title">{{ t('language.label') }}</div>
  <div class="lang-options" role="group" [attr.aria-label]="t('language.label')">
    @for (lang of languages; track lang.code) {
      <button
        type="button"
        class="lang-option"
        [class.active]="current() === lang.code"
        [attr.aria-current]="current() === lang.code ? 'true' : null"
        (click)="select(lang.code)"
      >
        {{ lang.nativeName }}
      </button>
    }
  </div>
</div>
```

Create `language-switcher.css` (match the existing menu look — reuse the playful theme; keep the component style budget under 4kB):
```css
.lang-switcher { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.25rem 0; }
.lang-title { font-size: 0.75rem; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.04em; }
.lang-options { display: flex; flex-wrap: wrap; gap: 0.25rem; }
.lang-option { border: none; background: transparent; cursor: pointer; padding: 0.35rem 0.6rem; border-radius: 999px; font: inherit; }
.lang-option.active { font-weight: 700; background: rgba(0, 0, 0, 0.08); }
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `npx vitest run src/app/components/Navigation/language-switcher/language-switcher.spec.ts`
Expected: PASS (all 3).

- [ ] **Step 6: Commit**

```bash
git add fortunecards.client/src/app/components/Navigation/language-switcher fortunecards.client/public/i18n
git commit -m "i18n: add LanguageSwitcher component"
```

---

## Task 5: Integrate the switcher + translate the Navigation area

**Files:**
- Modify: `src/app/components/Navigation/main-menu/main-menu.ts`, `main-menu.html`, `main-menu.spec.ts`
- Modify: `src/app/components/Navigation/navigation-bar/navigation-bar.html`, `navigation-bar.spec.ts`
- Modify: `public/i18n/*.json` (add `nav` namespace)

**Interfaces:**
- Consumes: `LanguageSwitcherComponent` (Task 4), `TranslocoDirective`, `getTranslocoTestingModule` (tests).

- [ ] **Step 1: Add the `nav` namespace to all 7 JSON files**

`en.json` `nav` block (values copied verbatim from the current templates):
```json
  "nav": {
    "myDecks": "My decks",
    "searchDecks": "Search decks",
    "myPatterns": "My patterns",
    "browsePatterns": "Browse patterns",
    "table": "Table",
    "myProfile": "My profile",
    "logout": "Logout",
    "signInGoogle": "Sign in with Google",
    "menu": "Menu"
  }
```
Add the same keys, machine-translated, to `uk/ru/es/de/fr/pt`.

- [ ] **Step 2: Convert `navigation-bar.html`**

Wrap the template in the directive and replace literals. Full new `navigation-bar.html`:
```html
<nav class="nav-bar" *transloco="let t">
  <div class="nav-left">
    <main-menu />
    <ng-content />
  </div>
  <!-- auth section -->
  @if (!auth.isLoggedIn()) {
    <button class="nav-login-btn" (click)="login()">{{ t('nav.signInGoogle') }}</button>
  } @else {
    <div class="nav-user">
      <div class="nav-avatar" (click)="goToProfile()">{{ auth.currentUser()!.displayName[0] }}</div>
      <span class="nav-username" (click)="goToProfile()">{{ auth.currentUser()!.displayName }}</span>
      <button class="nav-logout-btn" (click)="logout()">{{ t('nav.logout') }}</button>
    </div>
  }
</nav>
```
Add `TranslocoDirective` to the component's `imports` array in `navigation-bar.ts` (import from `@jsverse/transloco`).

- [ ] **Step 3: Convert `main-menu.html` and add the switcher**

In `main-menu.ts`: add `TranslocoDirective` and `LanguageSwitcherComponent` to `imports`. In `main-menu.html`: add `*transloco="let t"` to the `.menu-panel` container, replace each menu label with `t('nav.*')` (`My decks`→`t('nav.myDecks')`, `Search decks`→`t('nav.searchDecks')`, `My patterns`→`t('nav.myPatterns')`, `Browse patterns`→`t('nav.browsePatterns')`, `Table`→`t('nav.table')`, `My profile`→`t('nav.myProfile')`, `Logout`→`t('nav.logout')`, `Sign in with Google`→`t('nav.signInGoogle')`), replace `aria-label="Menu"` on the toggle button with `[attr.aria-label]="('nav.menu' | transloco)"`, and add `<language-switcher />` after the `menu-divider`.

- [ ] **Step 4: Update the two Navigation specs**

In `main-menu.spec.ts` and `navigation-bar.spec.ts`: import `getTranslocoTestingModule` from `../../../../testing/transloco-testing` and add `getTranslocoTestingModule()` to the `imports` array. Existing assertions on English labels (e.g. `itemLabels()` returning "My decks") stay unchanged — the helper serves the real `en.json`. If `main-menu.spec.ts` asserts an exact count of `.menu-item` elements, the switcher uses `.lang-option` (not `.menu-item`), so counts are unaffected; verify.

- [ ] **Step 5: Run the Navigation specs**

Run: `npx vitest run src/app/components/Navigation`
Expected: PASS (main-menu, navigation-bar, language-switcher).

- [ ] **Step 6: Commit**

```bash
git add fortunecards.client/src/app/components/Navigation fortunecards.client/public/i18n
git commit -m "i18n: translate navigation and mount language switcher in menu"
```

---

## Tasks 6–10: Feature-area string extraction

Each of these tasks follows the **identical recipe** below. Do them one area per task, in order, committing after each. The area's templates, in-code strings, specs, and namespace are listed per task.

### Extraction recipe (apply to every area task)

1. **Read each template and its component `.ts`** in the area. Collect every user-facing English string (visible text, `aria-label`, `[title]`, `placeholder`, `alt`, and user-facing strings built in TypeScript such as error/confirm messages).
2. **Add keys to `public/i18n/en.json`** under the area's namespace, values copied verbatim. Reuse `common.*` for shared verbs (Save/Cancel/Delete/…) instead of adding duplicates.
3. **Add the same keys to the other 6 files**, machine-translated. Every key must exist in all 7 files.
4. **Convert templates:** add `*transloco="let t"` to the outermost element of each template and replace literals with `t('area.key')`; use `| transloco` for attribute bindings (`[attr.aria-label]="('area.key' | transloco)"`, `[placeholder]="'area.key' | transloco"`). Add `TranslocoDirective` (and `TranslocoPipe` if the pipe is used) to each component's `imports`.
5. **Convert in-code strings:** inject `TranslocoService` and use `this.transloco.translate('area.key')` for user-facing strings assigned in the component; leave console/log strings untranslated.
6. **Update the area's specs:** add `getTranslocoTestingModule()` to `imports`. Assertions on English text keep passing. Fix the relative import depth of the helper path per spec location (e.g. from `app/components/Deck/deck-list/` it is `../../../../testing/transloco-testing`).
7. **Run the area specs**, expect PASS. Commit.

**Worked reference (from Task 5):** `navigation-bar.html` shows the exact directive-wrapping + `t('...')` pattern and the spec-helper import. Every area repeats this.

---

### Task 6: `shared` + `errors` namespaces (shared components)

**Files:**
- Templates: `src/app/components/shared/error-state/error-state.component.html`, `pagination/pagination.component.html`, `skeleton/skeleton.component.html`
- Component `.ts` in the same folders (check for in-code strings)
- Specs: `error-state.component.spec.ts`, `pagination.component.spec.ts`, `skeleton.component.spec.ts`
- Modify: `public/i18n/*.json`

**Notes:**
- `error-state` renders a `message` input (may be a caller-supplied string) plus a retry button — the button label should become `common.retry`. Where callers pass literal English error messages into `[message]`, move those literals to `errors.*` keys and have callers pass the translated string (or a key). Add `errors.loadFailedDecks`, `errors.loadFailedPatterns`, `errors.generic` as needed based on the actual caller strings you find.
- `pagination` — translate any "Previous"/"Next"/page-label text to `common.*`/a new `pagination.*` namespace; keep `aria-label`s translated via the pipe.
- The `error-state.component.spec.ts` sets `message` to `'Failed to load.'` directly and asserts it renders — that assertion is unaffected (the message is an input, not a key). Only add the helper if the template uses `*transloco` for the button label.

**Verification:** `npx vitest run src/app/components/shared`
**Commit:** `git commit -m "i18n: translate shared components (error-state, pagination, skeleton)"`

---

### Task 7: `deck` namespace (Deck area)

**Files:**
- Templates: `create-deck`, `deck-detail`, `deck-edit`, `deck-list` (`.component.html` under `src/app/components/Deck/**`)
- Their component `.ts` (in-code strings: validation/confirm/error text)
- Specs: `create-deck`, `deck-detail`, `deck-edit`, `deck-list` `.component.spec.ts`
- Modify: `public/i18n/*.json`

**Verification:** `npx vitest run src/app/components/Deck`
**Commit:** `git commit -m "i18n: translate Deck area"`

---

### Task 8: `card` namespace (Cards area)

**Files:**
- Templates: `card-detail`, `card-edit`, `create-card`, `drawn-card` (`.component.html` under `src/app/components/Cards/**`)
- Their component `.ts`
- Specs: the four matching `.component.spec.ts` (note: `drawn-card` has no spec — skip)
- Modify: `public/i18n/*.json`

**Verification:** `npx vitest run src/app/components/Cards`
**Commit:** `git commit -m "i18n: translate Cards area"`

---

### Task 9: `pattern` namespace (Pattern area)

**Files:**
- Templates (under `src/app/components/Pattern/**`): `add-pattern-cards`, `add-pattern-table`, `create-pattern`, `pattern-detail`, `pattern-hero`, `pattern-list`, `pattern-position-card`, `pattern-table-view`, `update-pattern`
- Their component `.ts`
- Specs: the matching `.component.spec.ts` (note: `create-pattern`, `pattern-table-view`, `update-pattern` may lack specs — translate templates regardless; only add the helper to specs that exist)
- Modify: `public/i18n/*.json`

**Verification:** `npx vitest run src/app/components/Pattern`
**Commit:** `git commit -m "i18n: translate Pattern area"`

---

### Task 10: `table` + `pages` namespaces (Table + pages + app shell)

**Files:**
- Templates (under `src/app/components/TableFortuneTelling/**`): `card-info-dialog`, `deck-selector`, `pattern-selector`, `table-card`, `table-pattern-card`, `table-settings-dialog`, `table`
- Templates (pages): `src/app/pages/account-settings/account-settings.component.html`, `src/app/pages/profile/profile.component.html`, and `src/app/app.html`
- Their component `.ts`
- Specs: matching `.component.spec.ts` that exist (`profile.component.spec.ts` exists; several table specs exist per the inventory)
- Modify: `public/i18n/*.json` (namespaces `table.*` and `pages.*`)

**Verification:** `npx vitest run src/app/components/TableFortuneTelling src/app/pages`
**Commit:** `git commit -m "i18n: translate Table area and pages"`

---

## Task 11: Full verification, build, and changelog

**Files:**
- Modify: `README.md` (add the day entry, matching the existing Day-NN format)

- [ ] **Step 1: Full test suite**

Run: `cd fortunecards.client && npx ng test --watch=false`
Expected: all specs PASS (existing 249 + new LanguageService/loader/switcher tests). If any spec fails because a component now uses Transloco but its spec lacks the helper, add `getTranslocoTestingModule()` to that spec's `imports` and re-run.

- [ ] **Step 2: Grep for stragglers**

Run:
```bash
cd fortunecards.client && grep -rInE '>[A-Z][a-z]+ [a-z]' src/app --include=*.html | grep -v transloco | head -50
```
Review hits: any remaining hardcoded user-facing English in templates should be moved to a namespace. (Some hits will be false positives like interpolations — judge each.)

- [ ] **Step 3: Production build**

Run: `npx ng build`
Expected: succeeds within budgets; `dist/**/i18n/*.json` (7 files) present.

- [ ] **Step 4: Manual smoke test**

Run the app (`dotnet run --project FortuneCards.Server` + `npm start`), open the hamburger menu, switch to each language, confirm instant re-render and that a full page reload preserves the choice (localStorage). Confirm `<html lang>` changes in devtools.

- [ ] **Step 5: README day entry**

Add a `README.md` entry for this feature following the existing Day-NN wording/format (multi-language UI via Transloco, 7 languages, runtime switcher in the menu).

- [ ] **Step 6: Commit**

```bash
git add fortunecards.client README.md
git commit -m "i18n: finalize multi-language UI — full suite green, README entry"
```

---

## Self-Review (completed during authoring)

- **Spec coverage:** library/config (Task 1), JSON location `public/i18n` (Global Constraints + Task 1), LanguageService detect/persist/fallback/html-lang (Task 2), testing helper (Task 3), switcher (Task 4), switcher in hamburger menu (Task 5), full extraction across all 29 templates (Tasks 5–10), out-of-scope items untouched (no backend/DB/splash tasks). Covered.
- **Correction vs. spec:** spec said `src/assets/i18n/` + edit `angular.json`; this project actually serves from `public/`, so the plan uses `public/i18n/` and requires no `angular.json` change. Loader path is `/i18n/<lang>.json`.
- **Type consistency:** `LanguageService.init()/setLanguage()/current`, `LANGUAGES`, `STORAGE_KEY`, `TranslocoHttpLoader.getTranslation()`, `getTranslocoTestingModule()` names are used identically across tasks.
- **Placeholder scan:** no TBD/TODO; area tasks use an explicit shared recipe rather than "similar to Task N", with exact file lists per area.
