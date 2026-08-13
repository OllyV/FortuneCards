import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { PatternService } from '../../../services/pattern.service';
import { getDeckGradientStyle } from '../../../utils/deck-colors';
import { NavigationBar } from '../../Navigation/navigation-bar/navigation-bar';

@Component({
  selector: 'app-update-pattern',
  templateUrl: './update-pattern.component.html',
  styleUrls: ['./update-pattern.component.css'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NavigationBar, TranslocoDirective],
})
export class UpdatePatternComponent implements OnInit {
  readonly GRADIENTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

  form: FormGroup;
  patternId = signal(0);
  submitting = signal(false);
  deleting = signal(false);
  loading = signal(true);
  error = signal<string | null>(null);

  private readonly destroyRef = inject(DestroyRef);
  private readonly transloco = inject(TranslocoService);

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private patternService: PatternService
  ) {
    this.form = this.fb.group({
      emoji:       ['🔮', [Validators.required, Validators.maxLength(10)]],
      colorIndex:  [0, Validators.required],
      name:        ['', [Validators.required, Validators.maxLength(200)]],
      description: ['', Validators.maxLength(1000)],
      isPublic:    [false],
    });
  }

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.patternId.set(id);
    this.patternService.getPattern(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (pattern) => {
          if (!pattern.isOwner) { this.router.navigate(['/patterns/mine']); return; }
          this.form.patchValue({
            emoji: pattern.emoji,
            colorIndex: pattern.colorIndex,
            name: pattern.name,
            description: pattern.description ?? '',
            isPublic: pattern.isPublic,
          });
          this.loading.set(false);
        },
        error: () => { this.error.set(this.transloco.translate('errors.patternLoadFailed')); this.loading.set(false); },
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
    this.patternService.updatePattern(this.patternId(), {
      name: v.name!,
      description: v.description ?? null,
      emoji: v.emoji ?? '🔮',
      colorIndex: v.colorIndex ?? 0,
      isPublic: v.isPublic ?? false,
    }).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.router.navigate(['/patterns/mine']),
        error: () => { this.error.set(this.transloco.translate('errors.patternSaveFailed')); this.submitting.set(false); },
      });
  }

  editQuestions(): void { this.router.navigate(['/patterns', this.patternId(), 'cards']); }

  deletePattern(): void {
    if (!confirm(this.transloco.translate('pattern.deleteConfirm'))) return;
    this.deleting.set(true);
    this.patternService.deletePattern(this.patternId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.router.navigate(['/patterns/mine']),
        error: () => { this.error.set(this.transloco.translate('errors.patternDeleteFailed')); this.deleting.set(false); },
      });
  }

  cancel(): void { this.router.navigate(['/patterns/mine']); }
}
