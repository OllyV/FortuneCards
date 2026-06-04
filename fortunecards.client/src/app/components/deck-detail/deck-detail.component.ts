import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DeckService } from '../../services/deck.service';
import { CardService } from '../../services/card.service';
import { Deck } from '../../models/deck';

@Component({
  selector: 'app-deck-detail',
  templateUrl: './deck-detail.component.html',
  standalone: false,
})
export class DeckDetailComponent implements OnInit {
  deck = signal<Deck | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);
  showAddCardForm = signal(false);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private deckService: DeckService,
    private cardService: CardService
  ) {}

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.loadDeck(id);
  }

  loadDeck(id: number): void {
    this.loading.set(true);
    this.deckService.getDeck(id).subscribe({
      next: (deck) => { this.deck.set(deck); this.loading.set(false); },
      error: () => { this.error.set('Failed to load deck.'); this.loading.set(false); }
    });
  }

  drawCard(): void {
    const d = this.deck();
    if (d) this.router.navigate(['/decks', d.id, 'draw']);
  }

  deleteCard(cardId: number): void {
    if (!confirm('Delete this card?')) return;
    this.cardService.deleteCard(cardId).subscribe({
      next: () => { const d = this.deck(); if (d) this.loadDeck(d.id); },
      error: () => alert('Failed to delete card.')
    });
  }

  onCardAdded(): void {
    this.showAddCardForm.set(false);
    const d = this.deck();
    if (d) this.loadDeck(d.id);
  }

  goBack(): void {
    this.router.navigate(['/decks']);
  }
}
