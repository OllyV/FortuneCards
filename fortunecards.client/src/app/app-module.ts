import { provideHttpClient } from '@angular/common/http';
import { NgModule, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { DeckListComponent } from './components/deck-list/deck-list.component';
import { DeckDetailComponent } from './components/deck-detail/deck-detail.component';
import { CreateDeckComponent } from './components/create-deck/create-deck.component';
import { CreateCardComponent } from './components/create-card/create-card.component';
import { DrawnCardComponent } from './components/drawn-card/drawn-card.component';

@NgModule({
  declarations: [
    App,
    DeckListComponent,
    DeckDetailComponent,
    CreateDeckComponent,
    CreateCardComponent,
    DrawnCardComponent,
  ],
  imports: [
    BrowserModule,
    FormsModule,
    ReactiveFormsModule,
    AppRoutingModule,
  ],
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideHttpClient(),
  ],
  bootstrap: [App]
})
export class AppModule { }
