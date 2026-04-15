import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TestResult } from '../../../../services/niah.service';
import { MarkdownPipe } from '../../../../pipes/markdown.pipe';

@Component({
  selector: 'app-result-detail-modal',
  standalone: true,
  imports: [CommonModule, MarkdownPipe],
  templateUrl: './result-detail-modal.component.html',
  styleUrl: './result-detail-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ResultDetailModalComponent {
  result = input.required<TestResult>();
  close = output<void>();

  onClose() {
    this.close.emit();
  }
}
