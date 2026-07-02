import { Component, OnInit, signal, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Deck } from '../../models/deck';
import { Card } from '../../models/card';
import { DeckService } from '../../services/deck.service';
import { NavigationBar } from '../navigation-bar/navigation-bar';

@Component({
  selector: 'app-card-detail',
  templateUrl: './card-detail.component.html',
  styleUrls: ['./card-detail.component.css'],
  standalone: true,
  imports: [CommonModule, NavigationBar],
})
export class CardDetailComponent implements OnInit {
  deckId = signal(0);
  cardId = signal(0);
  deck = signal<Deck | null>(null);
  card = signal<Card | null>(null);
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
      const deckId = Number(params['id']);
      const cardId = Number(params['cardId']);
      this.deckId.set(deckId);
      this.cardId.set(cardId);
      this.deckService.getDeck(deckId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (deck) => {
            this.deck.set(deck);
            this.card.set((deck.cards ?? []).find(c => c.id === cardId) ?? null);
            this.loading.set(false);
          },
          error: () => { this.error.set('Failed to load card.'); this.loading.set(false); }
        });
    });
  }

  isOwner(): boolean {
    return this.deck()?.isOwner ?? false;
  }

  editCard(): void {
    this.router.navigate(['/decks', this.deckId(), 'cards', this.cardId(), 'edit']);
  }

  goBack(): void {
    this.router.navigate(['/decks', this.deckId()]);
  }
}
