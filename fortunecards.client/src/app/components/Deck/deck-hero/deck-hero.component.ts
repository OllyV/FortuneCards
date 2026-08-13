import { Component, computed, input, output } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { getDeckGradientStyle } from '../../../utils/deck-colors';

@Component({
  selector: 'app-deck-hero',
  standalone: true,
  templateUrl: './deck-hero.component.html',
  styleUrl: './deck-hero.component.css',
  imports: [TranslocoDirective],
})
export class DeckHeroComponent {
  readonly name = input.required<string>();
  readonly emoji = input.required<string>();
  readonly description = input<string | null>(null);
  readonly cardCount = input.required<number>();
  readonly colorIndex = input.required<number>();
  readonly isOwner = input.required<boolean>();
  readonly isFavorite = input.required<boolean>();
  readonly isLoggedIn = input.required<boolean>();

  readonly drawCard = output<void>();
  readonly editDeck = output<void>();
  readonly addCard = output<void>();
  readonly toggleFavorite = output<void>();

  readonly gradient = computed(() => getDeckGradientStyle(this.colorIndex()));
}
