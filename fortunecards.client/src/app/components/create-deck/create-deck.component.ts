import { Component, EventEmitter, Output, signal } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { DeckService } from '../../services/deck.service';

@Component({
  selector: 'app-create-deck',
  templateUrl: './create-deck.component.html',
  standalone: false,
})
export class CreateDeckComponent {
  @Output() deckCreated = new EventEmitter<void>();

  form: FormGroup;
  submitting = signal(false);

  constructor(private fb: FormBuilder, private deckService: DeckService) {
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(200)]],
      description: ['', Validators.maxLength(1000)]
    });
  }

  submit(): void {
    if (this.form.invalid) return;
    this.submitting.set(true);
    const { name, description } = this.form.value as { name: string; description: string };
    this.deckService.createDeck({ name, description: description || null }).subscribe({
      next: () => { this.submitting.set(false); this.deckCreated.emit(); },
      error: () => { this.submitting.set(false); alert('Failed to create deck.'); }
    });
  }
}
