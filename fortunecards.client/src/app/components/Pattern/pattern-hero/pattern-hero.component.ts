import { Component, computed, input, output } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { getDeckGradientStyle } from '../../../utils/deck-colors';

@Component({
  selector: 'app-pattern-hero',
  standalone: true,
  templateUrl: './pattern-hero.component.html',
  styleUrl: './pattern-hero.component.css',
  imports: [TranslocoDirective],
})
export class PatternHeroComponent {
  readonly name = input.required<string>();
  readonly emoji = input.required<string>();
  readonly description = input<string | null>(null);
  readonly cardCount = input.required<number>();
  readonly colorIndex = input.required<number>();
  readonly isOwner = input.required<boolean>();
  readonly isFavorite = input.required<boolean>();
  readonly isLoggedIn = input.required<boolean>();

  readonly usePattern = output<void>();
  readonly editPattern = output<void>();
  readonly editQuestions = output<void>();
  readonly toggleFavorite = output<void>();

  readonly gradient = computed(() => getDeckGradientStyle(this.colorIndex()));
}
