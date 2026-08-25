import { Component, DestroyRef, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { PatternService } from '../../../services/pattern.service';
import { Pattern } from '../../../models/pattern';
import { getDeckGradientStyle } from '../../../utils/deck-colors';

@Component({
  selector: 'app-profile-patterns',
  standalone: true,
  templateUrl: './profile-patterns.component.html',
  styleUrl: './profile-patterns.component.css',
  imports: [TranslocoDirective],
})
export class ProfilePatternsComponent {
  private readonly patternService = inject(PatternService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly transloco = inject(TranslocoService);

  readonly patterns = signal<Pattern[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  constructor() {
    this.patternService.getMyPatterns()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (all) => { this.patterns.set(all.filter((p) => p.isOwner)); this.loading.set(false); },
        error: () => { this.error.set(this.transloco.translate('errors.patternsLoadFailed')); this.loading.set(false); },
      });
  }

  gradient(colorIndex: number): string { return getDeckGradientStyle(colorIndex); }
  newPattern(): void { this.router.navigate(['/patterns/new']); }
  openPattern(id: number): void { this.router.navigate(['/patterns', id]); }
}
