import { ChangeDetectionStrategy, Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LLMConfig } from '@hcs/llm-core';
import { LLM_STORAGE_TOKEN } from '@hcs/llm-angular-common';
import { NiahService, TestResult } from '../../services/niah.service';
import { Language } from '../../services/i18n.service';
import { ModalService } from '../../services/modal.service';
import { SettingsService } from '../../services/settings.service';

// Sub-components
import { TestConfigPanelComponent } from './components/test-config-panel/test-config-panel.component';
import { TestExecutionStatusComponent } from './components/test-execution-status/test-execution-status.component';
import { TestResultsTableComponent } from './components/test-results-table/test-results-table.component';
import { ResultDetailModalComponent } from './components/result-detail-modal/result-detail-modal.component';
import { HaystackViewerModalComponent } from './components/haystack-viewer-modal/haystack-viewer-modal.component';

@Component({
  selector: 'app-test-runner',
  standalone: true,
  imports: [
    CommonModule, 
    TestConfigPanelComponent,
    TestExecutionStatusComponent,
    TestResultsTableComponent,
    ResultDetailModalComponent,
    HaystackViewerModalComponent
  ],
  templateUrl: './test-runner.component.html',
  styleUrl: './test-runner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TestRunnerComponent implements OnInit, OnDestroy {
  private storage = inject(LLM_STORAGE_TOKEN);
  protected niah = inject(NiahService);
  private modalService = inject(ModalService);
  private settingsService = inject(SettingsService);

  readonly configs = signal<LLMConfig[]>([]);
  readonly selectedTargetId = signal<string>('');
  readonly selectedJudgeId = signal<string>('');
  readonly selectedContext = signal<number>(128000);
  readonly selectedLanguage = signal<Language>('en');
  readonly selectedResult = signal<TestResult | null>(null);
  readonly showHaystack = signal(false);
  readonly copyHaystack = signal(false);
  readonly copyStandard = signal(true);
  readonly copyNeedle = signal(true);

  private unsubscribe?: () => void;

  async ngOnInit() {
    await this.loadConfigs();
    this.unsubscribe = this.storage.subscribe((newConfigs) => this.configs.set(newConfigs));
  }

  ngOnDestroy() {
    this.unsubscribe?.();
  }

  async loadConfigs() {
    const c = await this.storage.getAll();
    this.configs.set(c);
  }

  onProfileChange(event: { type: 'target' | 'judge'; select: HTMLSelectElement }) {
    const val = event.select.value;
    if (val === 'ADD_NEW') {
      event.select.value = '';
      this.settingsService.open();
      return;
    }

    if (event.type === 'target') {
      this.selectedTargetId.set(val);
    } else {
      this.selectedJudgeId.set(val);
    }
  }

  async start() {
    const target = this.configs().find((c: LLMConfig) => c.id === this.selectedTargetId());
    const judge = this.configs().find((c: LLMConfig) => c.id === this.selectedJudgeId());

    if (target && judge) {
      await this.niah.runTest(target, judge, this.selectedContext(), this.selectedLanguage());
    }
  }

  async copyReport() {
    const options = {
      haystack: this.copyHaystack(),
      standard: this.copyStandard(),
      needle: this.copyNeedle()
    };
    const md = this.niah.generateReportMarkdown(options);
    await navigator.clipboard.writeText(md);
    this.modalService.show('Report copied to clipboard based on selected criteria.', 'Success');
  }
}
