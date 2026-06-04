import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { CreateCardComponent } from './create-card.component';

describe('CreateCardComponent', () => {
  let component: CreateCardComponent;
  let fixture: ComponentFixture<CreateCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CreateCardComponent],
      imports: [ReactiveFormsModule, RouterModule.forRoot([])],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { params: of({ id: '1' }) } }
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(CreateCardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should be invalid when title is empty', () => {
    component.form.get('title')!.setValue('');
    expect(component.form.invalid).toBe(true);
  });

  it('should be invalid when image is not selected', () => {
    component.form.get('title')!.setValue('The Journey');
    component.form.get('description')!.setValue('Step forward');
    expect(component.imageFile()).toBeNull();
  });

  it('should render a tarot-proportioned upload area', () => {
    const area = fixture.nativeElement.querySelector('.image-upload-area');
    expect(area).toBeTruthy();
  });
});
