import { APP_INITIALIZER, ErrorHandler, NgModule, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { DeckListComponent } from './components/Deck/deck-list/deck-list.component';
import { DeckDetailComponent } from './components/Deck/deck-detail/deck-detail.component';
import { NavigationBar } from './components/Navigation/navigation-bar/navigation-bar';
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
