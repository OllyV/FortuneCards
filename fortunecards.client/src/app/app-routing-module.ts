import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DeckListComponent } from './components/deck-list/deck-list.component';
import { DeckDetailComponent } from './components/deck-detail/deck-detail.component';

const routes: Routes = [
  { path: '', redirectTo: '/decks', pathMatch: 'full' },
  {
    path: 'decks/new',
    loadComponent: () => import('./components/create-deck/create-deck.component').then((c) => c.CreateDeckComponent)
  },
  {
    path: 'decks/:id/cards/new',
    loadComponent: () => import('./components/create-card/create-card.component').then((c) => c.CreateCardComponent)
  },
  {
    path: 'decks/:id/draw',
    loadComponent: () => import('./components/drawn-card/drawn-card.component').then((c) => c.DrawnCardComponent)
  },
  { path: 'decks/:id', component: DeckDetailComponent },
  { path: 'decks', component: DeckListComponent },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
