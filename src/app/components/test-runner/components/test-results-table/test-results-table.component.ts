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
  
  private readonly STATUS_CONFIG: Record<string, { label: string; class: string; feedback: string }> = {
    pending: { label: 'WAITING', class: 'pending', feedback: 'Waiting in queue...' },
    fetching: { label: 'FETCHING', class: 'fetching', feedback: 'Preparing context...' },
    answering: { label: 'ANSWERING', class: 'answering', feedback: 'Generating answer...' },
    waiting_score: { label: 'WAITING SCORE', class: 'waiting-score', feedback: 'Waiting for judge...' }
  };

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

  getStatusConfig(status: string) {
    return this.STATUS_CONFIG[status];
  }

  onResultClick(res: TestResult) {
    const clickableStatuses = ['completed', 'answering', 'waiting_score'];
    if (clickableStatuses.includes(res.status)) {
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
