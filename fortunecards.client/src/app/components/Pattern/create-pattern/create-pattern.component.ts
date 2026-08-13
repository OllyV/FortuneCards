import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { PatternService } from '../../../services/pattern.service';
import { getDeckGradientStyle } from '../../../utils/deck-colors';
import { NavigationBar } from '../../Navigation/navigation-bar/navigation-bar';

@Component({
  selector: 'app-create-pattern',
  templateUrl: './create-pattern.component.html',
  styleUrls: ['./create-pattern.component.css'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NavigationBar, TranslocoDirective],
})
export class CreatePatternComponent {
  readonly GRADIENTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

  form: FormGroup;
  submitting = signal(false);
  error = signal<string | null>(null);

  private readonly destroyRef = inject(DestroyRef);
  private readonly transloco = inject(TranslocoService);

  constructor(
    private fb: FormBuilder,
    private patternService: PatternService,
    private router: Router
  ) {
    this.form = this.fb.group({
      emoji:       ['🔮', [Validators.required, Validators.maxLength(10)]],
      colorIndex:  [0, Validators.required],
      name:        ['', [Validators.required, Validators.maxLength(200)]],
      description: ['', Validators.maxLength(1000)],
      isPublic:    [false],
    });
  }

  getGradientStyle(index: number): string { return getDeckGradientStyle(index); }
  getSelectedGradient(): string { return getDeckGradientStyle(this.form.get('colorIndex')!.value ?? 0); }
  selectColor(index: number): void { this.form.get('colorIndex')!.setValue(index); }

  submit(): void {
    if (this.form.invalid) return;
    this.error.set(null);
    this.submitting.set(true);
    const v = this.form.value;
    this.patternService.createPattern({
      name: v.name!,
      description: v.description ?? null,
      emoji: v.emoji ?? '🔮',
      colorIndex: v.colorIndex ?? 0,
      isPublic: v.isPublic ?? false,
    }).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (pattern) => this.router.navigate(['/patterns', pattern.id, 'cards']),
        error: () => { this.error.set(this.transloco.translate('errors.patternCreateFailed')); this.submitting.set(false); },
      });
  }

  cancel(): void { this.router.navigate(['/patterns/mine']); }
}
