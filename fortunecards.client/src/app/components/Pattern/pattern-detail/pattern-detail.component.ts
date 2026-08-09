import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationBar } from '../../Navigation/navigation-bar/navigation-bar';
import { PatternHeroComponent } from '../pattern-hero/pattern-hero.component';
import { PatternTableViewComponent } from '../pattern-table-view/pattern-table-view.component';
import { Pattern, EditablePatternCard } from '../../../models/pattern';
import { PatternService } from '../../../services/pattern.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-pattern-detail',
  standalone: true,
  templateUrl: './pattern-detail.component.html',
  styleUrls: ['./pattern-detail.component.css'],
  imports: [CommonModule, NavigationBar, PatternHeroComponent, PatternTableViewComponent],
})
export class PatternDetailComponent implements OnInit {
  readonly pattern = signal<Pattern | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly tableCards = computed<EditablePatternCard[]>(() =>
    (this.pattern()?.cards ?? []).map((c, i) => ({
      id: String(c.id ?? i), text: c.text, order: c.order, x: c.x, y: c.y, rotation: c.rotation,
    }))
  );

  private readonly destroyRef = inject(DestroyRef);
  protected readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly patternService = inject(PatternService);

  ngOnInit(): void {
    this.route.params.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.patternService.getPattern(Number(params['id']))
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (pattern) => { this.pattern.set(pattern); this.loading.set(false); },
          error: () => { this.error.set('Failed to load pattern.'); this.loading.set(false); },
        });
    });
  }

  goBack(): void {
    this.router.navigate([this.pattern()?.isOwner ? '/patterns/mine' : '/patterns/search']);
  }

  usePattern(): void {
    const p = this.pattern();
    if (p) this.router.navigate(['/table'], { queryParams: { pattern: p.id } });
  }

  editPattern(): void {
    const p = this.pattern();
    if (p) this.router.navigate(['/patterns', p.id, 'edit']);
  }

  editQuestions(): void {
    const p = this.pattern();
    if (p) this.router.navigate(['/patterns', p.id, 'cards']);
  }

  toggleFavorite(): void {
    const p = this.pattern();
    if (!p) return;
    const next = !p.isFavorite;
    this.pattern.set({ ...p, isFavorite: next });
    const request = next ? this.patternService.addFavorite(p.id) : this.patternService.removeFavorite(p.id);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      error: () => {
        const current = this.pattern();
        if (current) this.pattern.set({ ...current, isFavorite: !next });
      },
    });
  }
}
