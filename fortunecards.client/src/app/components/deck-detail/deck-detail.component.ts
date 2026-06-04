import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Deck } from '../../models/deck';
import { DeckService } from '../../services/deck.service';
import { CardService } from '../../services/card.service';
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

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private deckService: DeckService,
    private cardService: CardService
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.deckService.getDeck(Number(params['id'])).subscribe({
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
    this.router.navigate(['/decks']);
  }

  deleteCard(cardId: number): void {
    if (!confirm('Remove this card from the deck?')) return;
    this.cardService.deleteCard(cardId).subscribe({
      next: () => {
        this.deck.update(d => d ? {
          ...d,
          cards: (d.cards ?? []).filter(c => c.id !== cardId)
        } : null);
      },
      error: () => this.error.set('Failed to delete card.')
    });
  }
}
