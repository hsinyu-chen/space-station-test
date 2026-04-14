import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalService } from '../services/modal.service';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="modal-overlay" [class.visible]="modalService.isOpen()" (click)="closeOnBackdrop($event)">
      <div class="modal-container" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h2>{{ modalService.title() }}</h2>
        </div>
        <div class="modal-body">
          <p>{{ modalService.message() }}</p>
        </div>
        <div class="modal-footer">
          <button class="btn-close" (click)="modalService.close()">Dismiss</button>
        </div>
      </div>
    </div>
  `,
  styleUrl: './modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModalComponent {
  protected modalService = inject(ModalService);

  closeOnBackdrop(event: MouseEvent) {
    this.modalService.close();
  }
}
