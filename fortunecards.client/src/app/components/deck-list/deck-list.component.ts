import { Component, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DeckService } from '../../services/deck.service';
import { Deck } from '../../models/deck';

@Component({
  selector: 'app-deck-list',
  templateUrl: './deck-list.component.html',
  standalone: false,
})
export class DeckListComponent implements OnInit {
  decks = signal<Deck[]>([]);
  showCreateForm = signal(false);
  loading = signal(false);
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

  openDeck(id: number): void {
    this.router.navigate(['/decks', id]);
  }

  deleteDeck(id: number, event: Event): void {
    event.stopPropagation();
    if (!confirm('Delete this deck and all its cards?')) return;
    this.deckService.deleteDeck(id).subscribe({
      next: () => this.loadDecks(),
      error: () => alert('Failed to delete deck.')
    });
  }

  onDeckCreated(): void {
    this.showCreateForm.set(false);
    this.loadDecks();
  }
}
