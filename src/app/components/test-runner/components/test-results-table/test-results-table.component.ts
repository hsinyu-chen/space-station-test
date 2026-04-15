import { ChangeDetectionStrategy, Component, inject, model, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NiahService, TestResult } from '../../../../services/niah.service';

@Component({
  selector: 'app-test-results-table',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './test-results-table.component.html',
  styleUrl: './test-results-table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TestResultsTableComponent {
  protected niah = inject(NiahService);

  copyHaystack = model.required<boolean>();
  copyStandard = model.required<boolean>();
  copyNeedle = model.required<boolean>();

  selectResult = output<TestResult>();
  viewHaystack = output<void>();
  copyReport = output<void>();

  getScoreClass(score: number): string {
    if (score >= 8) return 'score-high';
    if (score >= 5) return 'score-mid';
    return 'score-low';
  }

  onResultClick(res: TestResult) {
    if (res.status === 'completed') {
      this.selectResult.emit(res);
    }
  }

  onViewHaystack() {
    this.viewHaystack.emit();
  }

  onCopyReport() {
    this.copyReport.emit();
  }
}
