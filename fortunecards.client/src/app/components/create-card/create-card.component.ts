import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { DeckService } from '../../services/deck.service';

@Component({
  selector: 'app-create-card',
  templateUrl: './create-card.component.html',
  standalone: false,
})
export class CreateCardComponent {
  @Input() deckId!: number;
  @Output() cardCreated = new EventEmitter<void>();

  form: FormGroup;
  selectedFile = signal<File | null>(null);
  submitting = signal(false);
  previewUrl = signal<string | null>(null);

  constructor(private fb: FormBuilder, private deckService: DeckService) {
    this.form = this.fb.group({
      title: ['', [Validators.required, Validators.maxLength(200)]],
      description: ['', [Validators.required, Validators.maxLength(2000)]]
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      this.selectedFile.set(file);
      const reader = new FileReader();
      reader.onload = (e) => this.previewUrl.set(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  }

  submit(): void {
    const file = this.selectedFile();
    if (this.form.invalid || !file) return;
    this.submitting.set(true);
    const { title, description } = this.form.value as { title: string; description: string };
    this.deckService.addCard(this.deckId, title, description, file).subscribe({
      next: () => { this.submitting.set(false); this.cardCreated.emit(); },
      error: () => { this.submitting.set(false); alert('Failed to add card.'); }
    });
  }
}
