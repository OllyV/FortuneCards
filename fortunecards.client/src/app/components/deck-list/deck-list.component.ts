import { Component, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Deck } from '../../models/deck';
import { DeckService } from '../../services/deck.service';
import { getDeckGradientStyle, getDeckShadowStyle } from '../../utils/deck-colors';

@Component({
  selector: 'app-deck-list',
  templateUrl: './deck-list.component.html',
  styleUrls: ['./deck-list.component.css'],
  standalone: false
})
export class DeckListComponent implements OnInit {
  decks = signal<Deck[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  constructor(private deckService: DeckService, private router: Router) {}

  ngOnInit(): void {
    this.loadDecks();
  }

  loadDecks(): void {
    this.loading.set(true);
    this.deckService.getDecks().subscribe({
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

  deleteDeck(id: number, event: Event): void {
    event.stopPropagation();
    if (!confirm('Delete this deck and all its cards?')) return;
    this.deckService.deleteDeck(id).subscribe({
      next: () => this.decks.update(decks => decks.filter(d => d.id !== id)),
      error: () => this.error.set('Failed to delete deck.')
    });
  }

  goToNew(): void {
    this.router.navigate(['/decks/new']);
  }
}
