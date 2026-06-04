import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DeckListComponent } from './components/deck-list/deck-list.component';
import { DeckDetailComponent } from './components/deck-detail/deck-detail.component';
import { DrawnCardComponent } from './components/drawn-card/drawn-card.component';
import { CreateDeckComponent } from './components/create-deck/create-deck.component';
import { CreateCardComponent } from './components/create-card/create-card.component';

const routes: Routes = [
  { path: '', redirectTo: '/decks', pathMatch: 'full' },
  { path: 'decks/new', component: CreateDeckComponent },
  { path: 'decks/:id/cards/new', component: CreateCardComponent },
  { path: 'decks/:id/draw', component: DrawnCardComponent },
  { path: 'decks/:id', component: DeckDetailComponent },
  { path: 'decks', component: DeckListComponent },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
