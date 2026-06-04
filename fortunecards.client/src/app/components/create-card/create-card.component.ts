import { Component, OnInit, signal, inject, DestroyRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DeckService } from '../../services/deck.service';

@Component({
  selector: 'app-create-card',
  templateUrl: './create-card.component.html',
  styleUrls: ['./create-card.component.css'],
  standalone: false
})
export class CreateCardComponent implements OnInit {
  deckId = signal(0);

  form!: FormGroup;

  imageFile = signal<File | null>(null);
  imagePreview = signal<string | null>(null);
  submitting = signal(false);
  error = signal<string | null>(null);

  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private deckService: DeckService
  ) {
    this.form = this.fb.group({
      title:       ['', [Validators.required, Validators.maxLength(200)]],
      description: ['', [Validators.required, Validators.maxLength(2000)]],
    });
  }

  ngOnInit(): void {
    this.route.params.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      this.deckId.set(Number(params['id']));
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
    if (this.form.invalid || !this.imageFile()) return;
    this.error.set(null);
    this.submitting.set(true);
    const v = this.form.value;
    this.deckService.addCard(this.deckId(), v.title!, v.description!, this.imageFile()!).subscribe({
      next: () => this.router.navigate(['/decks', this.deckId()]),
      error: () => { this.error.set('Failed to add card.'); this.submitting.set(false); }
    });
  }

  cancel(): void {
    this.router.navigate(['/decks', this.deckId()]);
  }
}
