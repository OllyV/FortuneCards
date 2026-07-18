import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CreateDeckComponent } from './create-deck.component';

describe('CreateDeckComponent', () => {
  let component: CreateDeckComponent;
  let fixture: ComponentFixture<CreateDeckComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateDeckComponent, ReactiveFormsModule, RouterModule.forRoot([])],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(CreateDeckComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should be invalid when name is empty', () => {
    component.form.get('name')!.setValue('');
    expect(component.form.invalid).toBe(true);
  });

  it('should be valid with name, emoji and colorIndex set', () => {
    component.form.get('name')!.setValue('My Deck');
    component.form.get('emoji')!.setValue('🌈');
    component.form.get('colorIndex')!.setValue(0);
    expect(component.form.valid).toBe(true);
  });

  it('should render 16 color swatches', () => {
    const swatches = fixture.nativeElement.querySelectorAll('.color-swatch');
    expect(swatches.length).toBe(16);
  });

  it('should update selectedColor when a swatch is clicked', () => {
    component.selectColor(2);
    expect(component.form.get('colorIndex')!.value).toBe(2);
  });

  it('defaults aspect ratio to 3 x 5', () => {
    expect(component.form.get('aspectWidth')!.value).toBe(3);
    expect(component.form.get('aspectHeight')!.value).toBe(5);
  });

  it('is invalid when aspectWidth is below 1 or above 100', () => {
    component.form.get('name')!.setValue('My Deck');
    component.form.get('aspectWidth')!.setValue(0);
    expect(component.form.get('aspectWidth')!.invalid).toBe(true);
    component.form.get('aspectWidth')!.setValue(101);
    expect(component.form.get('aspectWidth')!.invalid).toBe(true);
    component.form.get('aspectWidth')!.setValue(3);
    expect(component.form.get('aspectWidth')!.valid).toBe(true);
  });
});
