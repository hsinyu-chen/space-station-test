import { ChangeDetectionStrategy, Component, computed, inject, signal, OnInit, OnDestroy, importProvidersFrom } from '@angular/core';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { LLMManager, LLMConfig } from '@hcs/llm-core';
import { marked } from 'marked';
import * as katex from 'katex';
import { LLM_STORAGE_TOKEN } from '@hcs/llm-angular-common';
import { NiahService, TestResult } from '../services/niah.service';
import { Language } from '../services/i18n.service';
import { ModalService } from '../services/modal.service';

@Component({
  selector: 'app-test-runner',
  standalone: true,
  imports: [CommonModule, ScrollingModule],
  template: `
    <div class="test-runner">
      <!-- 1. Configuration Panel -->
      <section class="panel config-panel">
        <div class="panel-header">
          <h2>Test Configuration</h2>
        </div>
        <div class="config-grid">
          <div class="field">
            <label>Target LLM (to be tested)</label>
            <select #target (change)="selectedTargetId.set(target.value)">
              <option value="">Select a profile...</option>
              @for (cfg of configs(); track cfg.id) {
                <option [value]="cfg.id">{{ cfg.name }} ({{ cfg.provider }})</option>
              }
            </select>
          </div>

          <div class="field">
            <label>Judge LLM (to assess quality)</label>
            <select #judge (change)="selectedJudgeId.set(judge.value)">
              <option value="">Select a profile...</option>
              @for (cfg of configs(); track cfg.id) {
                <option [value]="cfg.id">{{ cfg.name }} ({{ cfg.provider }})</option>
              }
            </select>
          </div>

          <div class="field">
            <label>Context Length (Tokens)</label>
            <select #context (change)="selectedContext.set(+context.value)">
              @for (size of contextSizes; track size.value) {
                <option [value]="size.value" [selected]="size.value === 128000">{{ size.label }}</option>
              }
            </select>
          </div>

          <div class="field">
            <label>Language / 語言</label>
            <select #lang (change)="updateLanguage(lang.value)">
              <option value="en" selected>English</option>
              <option value="zh">繁體中文</option>
            </select>
          </div>
        </div>

        <button class="start-btn" 
                [disabled]="!selectedTargetId() || !selectedJudgeId() || niah.isTesting()"
                (click)="start()">
          @if (niah.isTesting()) {
            <span class="spinner"></span> Testing...
          } @else {
            Start NIAH Test
          }
        </button>
      </section>

      <!-- 2. Execution Status -->
      @if (niah.isTesting() || niah.results().length > 0) {
        <section class="panel status-panel">
          <div class="panel-header">
            <h2>Test Execution</h2>
            <div class="badges">
              <span class="badge" [class.active]="niah.isTesting()">{{ niah.currentStatus() }}</span>
            </div>
          </div>

          <div class="progress-container">
            <div class="progress-bar" [style.width.%]="niah.currentProgress()"></div>
          </div>

          <!-- Real-time Metrics -->
          <div class="metrics-grid multi-row">
            <!-- Row 1: Target Model -->
            <div class="model-row">
              <div class="model-label">Target Model</div>
              @if (niah.targetUsage(); as usage) {
                <div class="metric">
                  <span class="label">PP Progress</span>
                  <span class="value">
                    {{ (usage.promptProcessed || 0) / (usage.promptTotal || 1) * 100 | number:'1.0-1' }}%
                  </span>
                </div>
                <div class="metric">
                  <span class="label">Speed (PP / TG)</span>
                  <span class="value">{{ usage.promptSpeed || 0 | number:'1.0-1' }} / {{ usage.completionSpeed || 0 | number:'1.0-1' }}</span>
                </div>
                <div class="metric usage-metric">
                  <span class="label">Total Usage (I / C / O)</span>
                  <span class="value">
                    {{ niah.targetTotalUsage().prompt }} / {{ niah.targetTotalUsage().cached }} / {{ niah.targetTotalUsage().candidates }}
                  </span>
                </div>
              } @else {
                <div class="metric-placeholder">Waiting for Target Model activity...</div>
              }
            </div>

            <!-- Row 2: Judge Model -->
            <div class="model-row">
              <div class="model-label">Judge Model</div>
              @if (niah.judgeUsage(); as usage) {
                <div class="metric">
                  <span class="label">PP Progress</span>
                  <span class="value">100%</span>
                </div>
                <div class="metric">
                  <span class="label">Speed (PP / TG)</span>
                  <span class="value">{{ usage.promptSpeed || 0 | number:'1.0-1' }} / {{ usage.completionSpeed || 0 | number:'1.0-1' }}</span>
                </div>
                <div class="metric usage-metric">
                  <span class="label">Total Usage (I / C / O)</span>
                  <span class="value">
                    {{ niah.judgeTotalUsage().prompt }} / {{ niah.judgeTotalUsage().cached }} / {{ niah.judgeTotalUsage().candidates }}
                  </span>
                </div>
              } @else {
                <div class="metric-placeholder">Waiting for Judge Model activity...</div>
              }
            </div>
          </div>
        </section>
      }

      <!-- 3. Results Table -->
      @if (niah.results().length > 0) {
        <section class="panel results-panel">
          <div class="panel-header">
            <h2>Results</h2>
            <div class="header-btns">
              @if (niah.lastHaystack().length > 0) {
                <button class="copy-btn secondary" style="margin-right: 1.5rem;" (click)="showHaystack.set(true)">View Full Haystack</button>
              }
              
              <div class="copy-controls">
                <label><input type="checkbox" [checked]="copyHaystack()" (change)="copyHaystack.set(!copyHaystack())"> Haystack</label>
                <label><input type="checkbox" [checked]="copyStandard()" (change)="copyStandard.set(!copyStandard())"> Standard</label>
                <label><input type="checkbox" [checked]="copyNeedle()" (change)="copyNeedle.set(!copyNeedle())"> Needle</label>
                <button class="copy-btn" (click)="copyReport()">Copy Report</button>
              </div>
            </div>
          </div>
          
          <div class="results-table-wrapper">
            <table class="results-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Score</th>
                  <th>Status</th>
                  <th>Question</th>
                  <th>Judge Feedback</th>
                </tr>
              </thead>
              <tbody>
                @for (res of niah.results(); track res.question) {
                  <tr class="result-row" [class.is-running]="res.status === 'running'" 
                      (click)="res.status === 'completed' && selectedResult.set(res)"
                      [style.cursor]="res.status === 'completed' ? 'pointer' : 'default'">
                    <td><span class="type-pill" [attr.data-type]="res.type">{{ res.type }}</span></td>
                    <td>
                      @if (res.status === 'completed') {
                        <span class="score-badge" [ngClass]="getScoreClass(res.score)">{{ res.score }}</span>
                      } @else {
                        <span class="score-badge pending">-</span>
                      }
                    </td>
                    <td>
                      @if (res.status === 'completed') {
                        <span class="status-pill" [class.pass]="res.isPass">{{ res.isPass ? 'PASS' : 'FAIL' }}</span>
                      } @else if (res.status === 'running') {
                        <span class="status-pill running">RUNNING...</span>
                      } @else {
                        <span class="status-pill pending">WAITING</span>
                      }
                    </td>
                    <td class="truncate">{{ res.question }}</td>
                    <td class="truncate" [style.color]="res.status === 'completed' ? 'inherit' : '#64748b'">
                      {{ res.status === 'completed' ? res.judgeResult : (res.status === 'running' ? 'Analyzing log context...' : 'Waiting in queue...') }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }

      <!-- 4. Result Detail Modal -->
      @if (selectedResult(); as res) {
        <div class="modal-overlay" (click)="selectedResult.set(null)">
          <div class="modal-content" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h3>Test Detail (Score: {{ selectedResult()?.score }}/10)</h3>
              <button class="close-btn" (click)="selectedResult.set(null)">&times;</button>
            </div>
            <div class="modal-body detail-view">
              <div class="detail-section">
                <label>Question</label>
                <div class="code-box" [innerHTML]="renderMarkdown(res.question)"></div>
              </div>
              @if (res.reference) {
                <div class="detail-section">
                  <label>Reference (Needle)</label>
                  <div class="code-box" [innerHTML]="renderMarkdown(res.reference)"></div>
                </div>
              }
              @if (res.criteria) {
                <div class="detail-section">
                  <label>Judging Criteria</label>
                  <div class="code-box" [innerHTML]="renderMarkdown(res.criteria)"></div>
                </div>
              }
              <div class="detail-section">
                <label>Model Response</label>
                <div class="code-box" [innerHTML]="renderMarkdown(res.answer)"></div>
              </div>
              <div class="detail-section">
                <label>Judge Reasoning</label>
                <div class="code-box" [class.fail-box]="!res.isPass" [innerHTML]="renderMarkdown(res.judgeResult)"></div>
              </div>
            </div>
          </div>
        </div>
      }

      <!-- Haystack Viewer Modal -->
      @if (showHaystack()) {
        <div class="modal-overlay" (click)="showHaystack.set(false)">
          <div class="modal-content haystack-modal" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h3>Generated Haystack ({{ niah.lastHaystack().length }} lines)</h3>
              <div class="header-btns">
                <button class="action-btn secondary" (click)="copyAllHaystack()">Copy All</button>
                <button class="close-btn" (click)="showHaystack.set(false)">&times;</button>
              </div>
            </div>
            <div class="modal-body terminal-view">
              <cdk-virtual-scroll-viewport itemSize="22" class="haystack-viewport">
                <div *cdkVirtualFor="let line of niah.lastHaystack(); let i = index" class="log-line">
                  <span class="line-num">{{ i + 1 }}</span>
                  <span class="line-content">{{ line }}</span>
                </div>
              </cdk-virtual-scroll-viewport>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styleUrl: './test-runner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TestRunnerComponent implements OnInit, OnDestroy {
  private llmManager = inject(LLMManager);
  private storage = inject(LLM_STORAGE_TOKEN);
  protected niah = inject(NiahService);
  private modalService = inject(ModalService);
  private sanitizer = inject(DomSanitizer);

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

  readonly contextSizes = [
    { label: '4K', value: 4 * 1024 },
    { label: '8K', value: 8 * 1024 },
    { label: '16K', value: 16 * 1024 },
    { label: '32K', value: 32 * 1024 },
    { label: '64K', value: 64 * 1024 },
    { label: '128K', value: 128 * 1024 },
    { label: '256K', value: 256 * 1024 },
    { label: '512K', value: 512 * 1024 },
    { label: '1M', value: 1024 * 1024 },
  ];

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

  updateLanguage(lang: string) {
    this.selectedLanguage.set(lang as Language);
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

  getScoreClass(score: number): string {
    if (score >= 8) return 'score-high';
    if (score >= 5) return 'score-mid';
    return 'score-low';
  }

  async copyAllHaystack() {
    const text = this.niah.lastHaystack().join('\n');
    await navigator.clipboard.writeText(text);
    this.modalService.show('Full haystack copied to clipboard!', 'Success');
  }

  renderMarkdown(text: string): SafeHtml {
    if (!text) return this.sanitizer.bypassSecurityTrustHtml('');

    // Handle block math $$ ... $$
    let processedText = text.replace(/\$\$([\s\S]+?)\$\$/g, (match, formula) => {
      try {
        return `<div class="katex-block">${katex.renderToString(formula, { displayMode: true, throwOnError: false })}</div>`;
      } catch (e) {
        return match;
      }
    });

    // Handle inline math $ ... $
    processedText = processedText.replace(/\$([^\$]+?)\$/g, (match, formula) => {
      try {
        return `<span>${katex.renderToString(formula, { displayMode: false, throwOnError: false })}</span>`;
      } catch (e) {
        return match;
      }
    });

    return this.sanitizer.bypassSecurityTrustHtml(marked.parse(processedText) as string);
  }
}
