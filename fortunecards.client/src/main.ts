import { bootstrapApplication } from '@angular/platform-browser';
import {
  APP_INITIALIZER,
  ErrorHandler,
  isDevMode,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideTransloco } from '@jsverse/transloco';

import { App } from './app/app';
import { routes } from './app/app.routes';
import { AuthService } from './app/services/auth.service';
import { MonitoringService } from './app/services/monitoring.service';
import { MonitoringErrorHandler } from './app/monitoring-error-handler';
import { retryInterceptor } from './app/services/http/retry.interceptor';
import { TranslocoHttpLoader } from './app/services/transloco-loader';
import { LANGUAGES, LanguageService } from './app/services/language.service';

function initAuth(auth: AuthService): () => Promise<void> {
  return () => auth.loadCurrentUser();
}

function initMonitoring(monitoring: MonitoringService): () => Promise<void> {
  return () => monitoring.initFromConfig();
}

function initLanguage(language: LanguageService): () => Promise<void> {
  return () => language.init();
}

bootstrapApplication(App, {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideHttpClient(withInterceptors([retryInterceptor])),
    provideRouter(routes),
    provideTransloco({
      config: {
        availableLangs: LANGUAGES.map((l) => l.code),
        defaultLang: 'en',
        fallbackLang: 'en',
        reRenderOnLangChange: true,
        missingHandler: { logMissingKey: false },
        prodMode: !isDevMode(),
      },
      loader: TranslocoHttpLoader,
    }),
    { provide: APP_INITIALIZER, useFactory: initAuth, deps: [AuthService], multi: true },
    { provide: APP_INITIALIZER, useFactory: initMonitoring, deps: [MonitoringService], multi: true },
    { provide: APP_INITIALIZER, useFactory: initLanguage, deps: [LanguageService], multi: true },
    { provide: ErrorHandler, useClass: MonitoringErrorHandler },
  ],
}).catch((err) => console.error(err));
