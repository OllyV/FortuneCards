import { Component, inject, signal, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../services/auth.service';
import { DeckService } from '../../services/deck.service';
import { Deck } from '../../models/deck';
import { NavigationBar } from '../../components/Navigation/navigation-bar/navigation-bar';
import { getDeckGradientStyle } from '../../utils/deck-colors';

@Component({
  selector: 'app-profile',
  standalone: true,
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css'],
  imports: [CommonModule, NavigationBar],
})
export class ProfileComponent {
  protected readonly auth = inject(AuthService);
  private readonly deckService = inject(DeckService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  decks = signal<Deck[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  constructor() {
    this.deckService.getDecks()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (all) => {
          this.decks.set(all.filter(d => d.isOwner));
          this.loading.set(false);
        },
        error: () => { this.error.set('Failed to load decks.'); this.loading.set(false); }
      });
  }

  getDeckGradient(colorIndex: number): string {
    return getDeckGradientStyle(colorIndex);
  }

  goBack(): void {
    this.router.navigate(['/decks']);
  }

  goToSettings(): void {
    this.router.navigate(['/profile/settings']);
  }

  goToNewDeck(): void {
    this.router.navigate(['/decks/new']);
  }

  goToDeck(id: number): void {
    this.router.navigate(['/decks', id]);
  }
}
