import { Component, OnInit, signal, inject, DestroyRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Deck } from '../../models/deck';
import { DeckService } from '../../services/deck.service';
import { getDeckGradientStyle, getDeckShadowStyle, getCardAccentColor } from '../../utils/deck-colors';

@Component({
  selector: 'app-deck-detail',
  templateUrl: './deck-detail.component.html',
  styleUrls: ['./deck-detail.component.css'],
  standalone: false
})
export class DeckDetailComponent implements OnInit {
  deck = signal<Deck | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private deckService: DeckService,
    private location: Location
  ) {}

  ngOnInit(): void {
    this.route.params.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      this.deckService.getDeck(Number(params['id']))
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (deck) => { this.deck.set(deck); this.loading.set(false); },
          error: () => { this.error.set('Failed to load deck.'); this.loading.set(false); }
        });
    });
  }

  getDeckGradient(): string {
    return getDeckGradientStyle(this.deck()?.colorIndex ?? 0);
  }

  getDeckShadow(): string {
    return getDeckShadowStyle(this.deck()?.colorIndex ?? 0);
  }

  getCardAccent(index: number): string {
    return getCardAccentColor(index);
  }

  drawCard(): void {
    const d = this.deck();
    if (d) this.router.navigate(['/decks', d.id, 'draw']);
  }

  addCard(): void {
    const d = this.deck();
    if (d) this.router.navigate(['/decks', d.id, 'cards', 'new']);
  }

  goBack(): void {
    this.location.back();
  }

  editDeck(): void {
    const d = this.deck();
    if (d) this.router.navigate(['/decks', d.id, 'edit']);
  }

  openCard(cardId: number): void {
    const d = this.deck();
    if (d) this.router.navigate(['/decks', d.id, 'cards', cardId]);
  }
}
