import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { ModalService } from '../../../../services/modal.service';

@Component({
  selector: 'app-haystack-viewer-modal',
  standalone: true,
  imports: [CommonModule, ScrollingModule],
  templateUrl: './haystack-viewer-modal.component.html',
  styleUrl: './haystack-viewer-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HaystackViewerModalComponent {
  private modalService = inject(ModalService);

  haystack = input.required<string[]>();
  close = output<void>();

  async copyAll() {
    const text = this.haystack().join('\n');
    await navigator.clipboard.writeText(text);
    this.modalService.show('Full haystack copied to clipboard!', 'Success');
  }

  onClose() {
    this.close.emit();
  }
}
