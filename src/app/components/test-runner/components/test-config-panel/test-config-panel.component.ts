import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LLMConfig } from '@hcs/llm-core';
import { Language } from '../../../../services/i18n.service';

@Component({
  selector: 'app-test-config-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './test-config-panel.component.html',
  styleUrl: './test-config-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TestConfigPanelComponent {
  configs = input.required<LLMConfig[]>();
  isTesting = input.required<boolean>();
  
  selectedTargetId = model.required<string>();
  selectedJudgeId = model.required<string>();
  selectedLanguage = model.required<Language>();
  selectedContext = model.required<number>();

  profileChange = output<{ type: 'target' | 'judge'; select: HTMLSelectElement }>();
  startTest = output<void>();

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

  updateLanguage(lang: string) {
    this.selectedLanguage.set(lang as Language);
  }

  onProfileChange(select: HTMLSelectElement, type: 'target' | 'judge') {
    this.profileChange.emit({ type, select });
  }

  onStart() {
    this.startTest.emit();
  }
}
