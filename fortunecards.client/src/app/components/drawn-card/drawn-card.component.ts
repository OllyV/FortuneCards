import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DeckService } from '../../services/deck.service';
import { Card } from '../../models/card';

@Component({
  selector: 'app-drawn-card',
  templateUrl: './drawn-card.component.html',
  standalone: false,
})
export class DrawnCardComponent implements OnInit {
  card = signal<Card | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);

  private deckId = 0;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private deckService: DeckService
  ) {}

  ngOnInit(): void {
    this.deckId = Number(this.route.snapshot.paramMap.get('id'));
    this.draw();
  }

  draw(): void {
    this.loading.set(true);
    this.error.set(null);
    this.card.set(null);
    this.deckService.getDeck(this.deckId).subscribe({
      next: (deck) => {
        this.loading.set(false);
        if (!deck.cards || deck.cards.length === 0) {
          this.error.set('This deck has no cards yet.');
          return;
        }
        const i = Math.floor(Math.random() * deck.cards.length);
        this.card.set(deck.cards[i]);
      },
      error: () => { this.loading.set(false); this.error.set('Failed to load deck.'); }
    });
  }

  goBack(): void {
    this.router.navigate(['/decks', this.deckId]);
  }
}
