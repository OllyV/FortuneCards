import { Routes } from '@angular/router';
import { DeckListComponent } from './components/Deck/deck-list/deck-list.component';
import { DeckDetailComponent } from './components/Deck/deck-detail/deck-detail.component';
import { authGuard } from './guards/auth.guard';
import { landingRedirectGuard } from './guards/landing-redirect.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', canActivate: [landingRedirectGuard], children: [] },
  {
    path: 'decks/new',
    loadComponent: () => import('./components/Deck/create-deck/create-deck.component').then((c) => c.CreateDeckComponent)
  },
  { path: 'decks/mine', component: DeckListComponent, data: { mode: 'mine' }, canActivate: [authGuard] },
  { path: 'decks/search', component: DeckListComponent, data: { mode: 'search' } },
  {
    path: 'decks/:id/cards/new',
    loadComponent: () => import('./components/Cards/create-card/create-card.component').then((c) => c.CreateCardComponent)
  },
  {
    path: 'decks/:id/cards/:cardId/edit',
    loadComponent: () => import('./components/Cards/card-edit/card-edit.component').then((c) => c.CardEditComponent),
    canActivate: [authGuard]
  },
  {
    path: 'decks/:id/cards/:cardId',
    loadComponent: () => import('./components/Cards/card-detail/card-detail.component').then((c) => c.CardDetailComponent)
  },
  {
    path: 'decks/:id/edit',
    loadComponent: () => import('./components/Deck/deck-edit/deck-edit.component').then((c) => c.DeckEditComponent),
    canActivate: [authGuard]
  },
  {
    path: 'decks/:id/draw',
    loadComponent: () => import('./components/Cards/drawn-card/drawn-card.component').then((c) => c.DrawnCardComponent)
  },
  { path: 'decks/:id', component: DeckDetailComponent },
  { path: 'decks', pathMatch: 'full', canActivate: [landingRedirectGuard], children: [] },
  {
    path: 'patterns/new',
    loadComponent: () => import('./components/Pattern/create-pattern/create-pattern.component').then((c) => c.CreatePatternComponent),
    canActivate: [authGuard]
  },
  {
    path: 'patterns/mine',
    loadComponent: () => import('./components/Pattern/pattern-list/pattern-list.component').then((c) => c.PatternListComponent),
    data: { mode: 'mine' },
    canActivate: [authGuard]
  },
  {
    path: 'patterns/search',
    loadComponent: () => import('./components/Pattern/pattern-list/pattern-list.component').then((c) => c.PatternListComponent),
    data: { mode: 'search' }
  },
  {
    path: 'patterns/:id/edit',
    loadComponent: () => import('./components/Pattern/update-pattern/update-pattern.component').then((c) => c.UpdatePatternComponent),
    canActivate: [authGuard]
  },
  {
    path: 'patterns/:id/cards',
    loadComponent: () => import('./components/Pattern/add-pattern-cards/add-pattern-cards.component').then((c) => c.AddPatternCardsComponent),
    canActivate: [authGuard]
  },
  {
    path: 'table',
    loadComponent: () => import('./components/TableFortuneTelling/table/table.component').then((c) => c.TableComponent)
  },
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
