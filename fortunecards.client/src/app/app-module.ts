import { provideHttpClient } from '@angular/common/http';
import {
  NgModule,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { DeckListComponent } from './components/deck-list/deck-list.component';
import { DeckDetailComponent } from './components/deck-detail/deck-detail.component';
import { NavigationBar } from './components/navigation-bar/navigation-bar';

@NgModule({
  declarations: [App, DeckListComponent, DeckDetailComponent],
  imports: [BrowserModule, FormsModule, ReactiveFormsModule, AppRoutingModule, NavigationBar],
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideHttpClient(),
  ],
  bootstrap: [App],
})
export class AppModule {}
