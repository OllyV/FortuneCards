import { Component, signal, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DeckService } from '../../../services/deck.service';
import { getDeckGradientStyle } from '../../../utils/deck-colors';
import { NavigationBar } from '../../Navigation/navigation-bar/navigation-bar';

@Component({
  selector: 'app-create-deck',
  templateUrl: './create-deck.component.html',
  styleUrls: ['./create-deck.component.css'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NavigationBar],
})
export class CreateDeckComponent {
  readonly GRADIENTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

  form: FormGroup;

  private readonly destroyRef = inject(DestroyRef);

  cardBackFile = signal<File | null>(null);
  cardBackPreview = signal<string | null>(null);
  submitting = signal(false);
  error = signal<string | null>(null);

  constructor(
    private fb: FormBuilder,
    private deckService: DeckService,
    private router: Router
  ) {
    this.form = this.fb.group({
      emoji:       ['🎴', [Validators.required, Validators.maxLength(10)]],
      colorIndex:  [0, Validators.required],
      aspectWidth:  [3, [Validators.required, Validators.min(1), Validators.max(100)]],
      aspectHeight: [5, [Validators.required, Validators.min(1), Validators.max(100)]],
      name:        ['', [Validators.required, Validators.maxLength(200)]],
      description: ['', Validators.maxLength(1000)],
      isPublic:    [false],
    });
  }

  getGradientStyle(index: number): string {
    return getDeckGradientStyle(index);
  }

  getSelectedGradient(): string {
    return getDeckGradientStyle(this.form.get('colorIndex')!.value ?? 0);
  }

  selectColor(index: number): void {
    this.form.get('colorIndex')!.setValue(index);
  }

  onCardBackSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.cardBackFile.set(file);
    const reader = new FileReader();
    reader.onload = (e) => this.cardBackPreview.set(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  removeCardBack(): void {
    this.cardBackFile.set(null);
    this.cardBackPreview.set(null);
  }

  submit(): void {
    if (this.form.invalid) return;
    this.error.set(null);
    this.submitting.set(true);
    const v = this.form.value;
    this.deckService.createDeck({
      name: v.name!,
      description: v.description ?? null,
      emoji: v.emoji ?? '🎴',
      colorIndex: v.colorIndex ?? 0,
      aspectWidth: v.aspectWidth ?? 3,
      aspectHeight: v.aspectHeight ?? 5,
      isPublic: v.isPublic ?? false,
      cardBackImage: this.cardBackFile() ?? undefined,
    }).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (deck) => this.router.navigate(['/decks', deck.id]),
        error: () => { this.error.set('Failed to create deck.'); this.submitting.set(false); }
      });
  }

  cancel(): void {
    this.router.navigate(['/decks']);
  }
}
