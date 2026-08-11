import { Component, OnInit, signal, inject, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { NavigationBar } from '../../Navigation/navigation-bar/navigation-bar';
import { SkeletonDetailComponent } from '../../shared/skeleton/skeleton-detail.component';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';
import { Deck } from '../../../models/deck';
import { DeckService } from '../../../services/deck.service';
import { AuthService } from '../../../services/auth.service';
import { getDeckGradientStyle, getDeckShadowStyle, getCardAccentColor } from '../../../utils/deck-colors';

@Component({
  selector: 'app-deck-detail',
  templateUrl: './deck-detail.component.html',
  styleUrls: ['./deck-detail.component.css'],
  standalone: true,
  imports: [CommonModule, NavigationBar, SkeletonDetailComponent, ErrorStateComponent, TranslocoDirective]
})
export class DeckDetailComponent implements OnInit {
  deck = signal<Deck | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  private readonly destroyRef = inject(DestroyRef);
  protected readonly auth = inject(AuthService);
  private readonly transloco = inject(TranslocoService);
  private currentId = 0;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private deckService: DeckService
  ) {}

  ngOnInit(): void {
    this.route.params.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.load(Number(params['id']));
    });
  }

  load(id: number): void {
    this.currentId = id;
    this.loading.set(true);
    this.error.set(null);
    this.deckService.getDeck(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (deck) => { this.deck.set(deck); this.loading.set(false); },
        error: () => { this.error.set(this.transloco.translate('errors.deckLoadFailed')); this.loading.set(false); },
      });
  }

  retry(): void {
    this.load(this.currentId);
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
    // Always return to a deck list rather than popping browser history, which
    // could land on a card-detail or drawn-card page the user reached this deck
    // from. Owners go to their own list; everyone else to the public Search list.
    this.router.navigate([this.deck()?.isOwner ? '/decks/mine' : '/decks/search']);
  }

  editDeck(): void {
    const d = this.deck();
    if (d) this.router.navigate(['/decks', d.id, 'edit']);
  }

  openCard(cardId: number): void {
    const d = this.deck();
    if (d) this.router.navigate(['/decks', d.id, 'cards', cardId]);
  }

  toggleFavorite(): void {
    const d = this.deck();
    if (!d) return;
    const next = !d.isFavorite;
    this.deck.set({ ...d, isFavorite: next });
    const request = next
      ? this.deckService.addFavorite(d.id)
      : this.deckService.removeFavorite(d.id);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      error: () => {
        const current = this.deck();
        if (current) this.deck.set({ ...current, isFavorite: !next });
      },
    });
  }
}
