import { ChangeDetectionStrategy, Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { LLMManager, LLMConfig } from '@hcs/llm-core';
import { marked } from 'marked';
import * as katex from 'katex';
import { LLM_STORAGE_TOKEN } from '@hcs/llm-angular-common';
import { NiahService, TestResult } from '../../services/niah.service';
import { Language } from '../../services/i18n.service';
import { ModalService } from '../../services/modal.service';
import { SettingsService } from '../../services/settings.service';

@Component({
  selector: 'app-test-runner',
  standalone: true,
  imports: [CommonModule, ScrollingModule],
  templateUrl: './test-runner.component.html',
  styleUrl: './test-runner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TestRunnerComponent implements OnInit, OnDestroy {
  private llmManager = inject(LLMManager);
  private storage = inject(LLM_STORAGE_TOKEN);
  protected niah = inject(NiahService);
  private modalService = inject(ModalService);
  private settingsService = inject(SettingsService);
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

  private readonly MIN_TOKENS = 4000;
  private readonly MAX_TOKENS = 2000000;
  private readonly TOKEN_STEP = 4000;

  formatTokens(v: number): string {
    if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
    if (v >= 1000) return (v / 1000).toFixed(0) + 'K';
    return v.toString();
  }

  tokensToSlider(tokens: number): number {
    const range = this.MAX_TOKENS - this.MIN_TOKENS;
    const val = 1000 * Math.pow((tokens - this.MIN_TOKENS) / range, 1 / 3);
    return Math.max(0, Math.min(1000, val));
  }

  onContextSliderChange(event: Event) {
    const sliderVal = +(event.target as HTMLInputElement).value;
    const range = this.MAX_TOKENS - this.MIN_TOKENS;
    const tokens = Math.pow(sliderVal / 1000, 3) * range + this.MIN_TOKENS;
    const snapped = Math.round(tokens / this.TOKEN_STEP) * this.TOKEN_STEP;
    this.selectedContext.set(Math.max(this.MIN_TOKENS, Math.min(this.MAX_TOKENS, snapped)));
  }

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

  onProfileChange(select: HTMLSelectElement, type: 'target' | 'judge') {
    const val = select.value;
    if (val === 'ADD_NEW') {
      select.value = '';
      this.settingsService.open();
      return;
    }

    if (type === 'target') {
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
