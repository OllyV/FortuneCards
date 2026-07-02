import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DeckListComponent } from './components/deck-list/deck-list.component';
import { DeckDetailComponent } from './components/deck-detail/deck-detail.component';
import { authGuard } from './guards/auth.guard';

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
    path: 'decks/:id/edit',
    loadComponent: () => import('./components/deck-edit/deck-edit.component').then((c) => c.DeckEditComponent),
    canActivate: [authGuard]
  },
  {
    path: 'decks/:id/draw',
    loadComponent: () => import('./components/drawn-card/drawn-card.component').then((c) => c.DrawnCardComponent)
  },
  { path: 'decks/:id', component: DeckDetailComponent },
  { path: 'decks', component: DeckListComponent },
  {
    path: 'profile/settings',
    loadComponent: () => import('./pages/account-settings/account-settings.component').then((c) => c.AccountSettingsComponent),
    canActivate: [authGuard]
  },
  {
    path: 'profile',
    loadComponent: () => import('./pages/profile/profile.component').then((c) => c.ProfileComponent),
    canActivate: [authGuard]
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
