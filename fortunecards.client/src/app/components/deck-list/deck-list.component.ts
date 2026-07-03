import { Component, OnInit, signal, inject, DestroyRef, effect } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Deck } from '../../models/deck';
import { DeckService } from '../../services/deck.service';
import { AuthService } from '../../services/auth.service';
import { getDeckGradientStyle, getDeckShadowStyle } from '../../utils/deck-colors';

@Component({
  selector: 'app-deck-list',
  templateUrl: './deck-list.component.html',
  styleUrls: ['./deck-list.component.css'],
  standalone: false
})
export class DeckListComponent {
  decks = signal<Deck[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  protected readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  constructor(private deckService: DeckService, private router: Router) {
    effect(() => {
      this.auth.currentUser();
      this.loadDecks();
    });
  }

  loadDecks(): void {
    this.loading.set(true);
    this.deckService.getDecks()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (decks) => { this.decks.set(decks); this.loading.set(false); },
        error: () => { this.error.set('Failed to load decks.'); this.loading.set(false); }
      });
  }

  getDeckGradient(colorIndex: number): string {
    return getDeckGradientStyle(colorIndex);
  }

  getDeckShadow(colorIndex: number): string {
    return getDeckShadowStyle(colorIndex);
  }

  goToNew(): void {
    this.router.navigate(['/decks', 'new']);
  }
}
