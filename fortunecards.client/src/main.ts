import { bootstrapApplication } from '@angular/platform-browser';
import {
  APP_INITIALIZER,
  ErrorHandler,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { App } from './app/app';
import { routes } from './app/app.routes';
import { AuthService } from './app/services/auth.service';
import { MonitoringService } from './app/services/monitoring.service';
import { MonitoringErrorHandler } from './app/monitoring-error-handler';

function initAuth(auth: AuthService): () => Promise<void> {
  return () => auth.loadCurrentUser();
}

function initMonitoring(monitoring: MonitoringService): () => Promise<void> {
  return () => monitoring.initFromConfig();
}

bootstrapApplication(App, {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideHttpClient(),
    provideRouter(routes),
    { provide: APP_INITIALIZER, useFactory: initAuth, deps: [AuthService], multi: true },
    { provide: APP_INITIALIZER, useFactory: initMonitoring, deps: [MonitoringService], multi: true },
    { provide: ErrorHandler, useClass: MonitoringErrorHandler },
  ],
}).catch((err) => console.error(err));
