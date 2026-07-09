import { Component, OnInit, signal, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DeckService } from '../../../services/deck.service';
import { CardService } from '../../../services/card.service';
import { NavigationBar } from '../../Navigation/navigation-bar/navigation-bar';

@Component({
  selector: 'app-card-edit',
  templateUrl: './card-edit.component.html',
  styleUrls: ['./card-edit.component.css'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NavigationBar],
})
export class CardEditComponent implements OnInit {
  deckId = signal(0);
  cardId = signal(0);
  form: FormGroup;

  currentImageUrl = signal<string | null>(null);
  imageFile = signal<File | null>(null);
  imagePreview = signal<string | null>(null);
  submitting = signal(false);
  deleting = signal(false);
  loading = signal(true);
  error = signal<string | null>(null);

  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private deckService: DeckService,
    private cardService: CardService
  ) {
    this.form = this.fb.group({
      title:       ['', [Validators.required, Validators.maxLength(200)]],
      description: ['', [Validators.required, Validators.maxLength(2000)]],
    });
  }

  ngOnInit(): void {
    this.route.params.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const deckId = Number(params['id']);
      const cardId = Number(params['cardId']);
      this.deckId.set(deckId);
      this.cardId.set(cardId);
      this.deckService.getDeck(deckId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (deck) => {
            if (!deck.isOwner) { this.router.navigate(['/decks', deckId, 'cards', cardId]); return; }
            const card = (deck.cards ?? []).find(c => c.id === cardId);
            if (!card) { this.error.set('Card not found.'); this.loading.set(false); return; }
            this.form.patchValue({ title: card.title, description: card.description });
            this.currentImageUrl.set(card.imageUrl);
            this.loading.set(false);
          },
          error: () => { this.error.set('Failed to load card.'); this.loading.set(false); }
        });
    });
  }

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.imageFile.set(file);
    const reader = new FileReader();
    reader.onload = (e) => this.imagePreview.set(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  removeImage(): void {
    this.imageFile.set(null);
    this.imagePreview.set(null);
  }

  submit(): void {
    if (this.form.invalid) return;
    this.error.set(null);
    this.submitting.set(true);
    const v = this.form.value;
    this.cardService.updateCard(this.cardId(), v.title!, v.description!, this.imageFile() ?? undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.router.navigate(['/decks', this.deckId(), 'cards', this.cardId()]),
        error: () => { this.error.set('Failed to save card.'); this.submitting.set(false); }
      });
  }

  deleteCard(): void {
    if (!confirm('Remove this card from the deck?')) return;
    this.deleting.set(true);
    this.cardService.deleteCard(this.cardId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.router.navigate(['/decks', this.deckId()]),
        error: () => { this.error.set('Failed to delete card.'); this.deleting.set(false); }
      });
  }

  cancel(): void {
    this.router.navigate(['/decks', this.deckId(), 'cards', this.cardId()]);
  }
}
