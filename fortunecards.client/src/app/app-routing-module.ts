import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DeckListComponent } from './components/deck-list/deck-list.component';
import { DeckDetailComponent } from './components/deck-detail/deck-detail.component';
import { DrawnCardComponent } from './components/drawn-card/drawn-card.component';

const routes: Routes = [
  { path: '', redirectTo: 'decks', pathMatch: 'full' },
  { path: 'decks', component: DeckListComponent },
  { path: 'decks/:id', component: DeckDetailComponent },
  { path: 'decks/:id/draw', component: DrawnCardComponent },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
