import { Component, OnInit, signal, inject, DestroyRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Deck } from '../../models/deck';
import { Card } from '../../models/card';
import { DeckService } from '../../services/deck.service';
import { getDeckGradientStyle } from '../../utils/deck-colors';

@Component({
  selector: 'app-drawn-card',
  templateUrl: './drawn-card.component.html',
  styleUrls: ['./drawn-card.component.css'],
  standalone: false
})
export class DrawnCardComponent implements OnInit {
  deck = signal<Deck | null>(null);
  drawnCard = signal<Card | null>(null);
  flipped = signal(false);
  loading = signal(true);
  error = signal<string | null>(null);

  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private deckService: DeckService
  ) {}

  ngOnInit(): void {
    this.route.params.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      this.deckService.getDeck(Number(params['id']))
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (deck) => {
            this.deck.set(deck);
            this.pickRandom(deck);
            this.loading.set(false);
          },
          error: () => { this.error.set('Failed to load deck.'); this.loading.set(false); }
        });
    });
  }

  private pickRandom(deck: Deck): void {
    const cards = deck.cards ?? [];
    if (!cards.length) return;
    this.drawnCard.set(cards[Math.floor(Math.random() * cards.length)]);
    this.flipped.set(false);
  }

  flipCard(): void {
    if (this.loading() || this.flipped()) return;
    this.flipped.set(true);
  }

  drawAnother(): void {
    const d = this.deck();
    if (d) this.pickRandom(d);
  }

  backToDeck(): void {
    const d = this.deck();
    if (d) this.router.navigate(['/decks', d.id]);
  }

  getCardBackGradient(): string {
    return getDeckGradientStyle(this.deck()?.colorIndex ?? 0);
  }

  hasCustomBack(): boolean {
    return !!this.deck()?.cardBackImageUrl;
  }

  getCardBackImageUrl(): string {
    return this.deck()?.cardBackImageUrl ?? '';
  }
}
