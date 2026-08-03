import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { NavigationBar } from '../../Navigation/navigation-bar/navigation-bar';
import { AddPatternTableComponent } from '../add-pattern-table/add-pattern-table.component';
import { PatternService } from '../../../services/pattern.service';
import { EditablePatternCard } from '../../../models/pattern';

const ASPECT_MULTIPLIER = 5 / 3;

@Component({
  selector: 'app-add-pattern-cards',
  standalone: true,
  templateUrl: './add-pattern-cards.component.html',
  styleUrl: './add-pattern-cards.component.css',
  imports: [NavigationBar, AddPatternTableComponent],
})
export class AddPatternCardsComponent implements OnInit {
  readonly cards = signal<EditablePatternCard[]>([]);
  readonly cardSizePercent = signal(15);
  readonly tableHeightPercent = signal(60);
  readonly selectedId = signal<string | null>(null);
  readonly saving = signal(false);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  private patternId = 0;
  private nextId = 1;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly patternService = inject(PatternService);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    this.patternId = Number(this.route.snapshot.paramMap.get('id'));
    this.patternService.getPattern(this.patternId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (pattern) => {
          if (!pattern.isOwner) { this.router.navigate(['/patterns/mine']); return; }
          this.cardSizePercent.set(pattern.cardSizePercent ?? 15);
          this.tableHeightPercent.set(pattern.tableHeightPercent ?? 60);
          this.cards.set((pattern.cards ?? []).map((c) => ({
            id: `card-${this.nextId++}`,
            text: c.text, order: c.order, x: c.x, y: c.y, rotation: c.rotation,
          })));
          this.loading.set(false);
        },
        error: () => { this.error.set('Failed to load pattern.'); this.loading.set(false); },
      });
  }

  addQuestion(): void {
    this.cards.update((list) => {
      const order = list.length + 1;
      return this.renumber([
        ...list,
        { id: `card-${this.nextId++}`, text: `Position ${order}`, order, x: 5, y: 5, rotation: 0 },
      ]);
    });
  }

  removeQuestion(id: string): void {
    this.cards.update((list) => this.renumber(list.filter((c) => c.id !== id)));
  }

  moveUp(index: number): void {
    if (index <= 0) return;
    this.cards.update((list) => this.swap(list, index, index - 1));
  }

  moveDown(index: number): void {
    this.cards.update((list) => (index >= list.length - 1 ? list : this.swap(list, index, index + 1)));
  }

  setText(id: string, text: string): void {
    this.cards.update((list) => list.map((c) => (c.id === id ? { ...c, text } : c)));
  }

  selectCard(id: string): void {
    this.selectedId.set(id);
  }

  movePatternCard(event: { id: string; x: number; y: number }): void {
    const cardHeight = this.cardSizePercent() * ASPECT_MULTIPLIER;
    const maxX = Math.max(0, 100 - this.cardSizePercent());
    const maxY = Math.max(0, this.tableHeightPercent() - cardHeight);
    const x = Math.min(maxX, Math.max(0, event.x));
    const y = Math.min(maxY, Math.max(0, event.y));
    this.cards.update((list) => list.map((c) => (c.id === event.id ? { ...c, x, y } : c)));
  }

  rotatePatternCard(event: { id: string; rotation: number }): void {
    const normalized = ((event.rotation % 360) + 360) % 360;
    this.cards.update((list) => list.map((c) => (c.id === event.id ? { ...c, rotation: normalized } : c)));
  }

  onCardSizeChange(size: number): void {
    this.cardSizePercent.set(size);
  }

  onTableHeightChange(height: number): void {
    this.tableHeightPercent.set(height);
  }

  save(): void {
    this.saving.set(true);
    this.error.set(null);
    const payloadCards = this.cards().map((c, i) => ({
      text: c.text, order: i + 1, x: c.x, y: c.y, rotation: c.rotation,
    }));
    forkJoin([
      this.patternService.updatePattern(this.patternId, {
        cardSizePercent: this.cardSizePercent(),
        tableHeightPercent: this.tableHeightPercent(),
      }),
      this.patternService.saveCards(this.patternId, payloadCards),
    ]).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.router.navigate(['/patterns/mine']),
        error: () => { this.error.set('Failed to save.'); this.saving.set(false); },
      });
  }

  cancel(): void {
    this.router.navigate(['/patterns/mine']);
  }

  private renumber(list: EditablePatternCard[]): EditablePatternCard[] {
    return list.map((c, i) => ({ ...c, order: i + 1 }));
  }

  private swap(list: EditablePatternCard[], a: number, b: number): EditablePatternCard[] {
    const next = [...list];
    [next[a], next[b]] = [next[b], next[a]];
    return this.renumber(next);
  }
}
