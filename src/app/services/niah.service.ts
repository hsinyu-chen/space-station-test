import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { LLMManager, LLMConfig, LLMContent, LLMUsageMetadata } from '@hcs/llm-core';
import { HaystackService } from './haystack.service';
import { ModalService } from './modal.service';
import { firstValueFrom } from 'rxjs';
import { I18nService, Language } from './i18n.service';

export interface Needle {
  needle: string;
  test_prompt: string;
  assessment: string;
}

export interface TestResult {
  question: string;
  answer: string;
  thought?: string;
  judgeResult: string;
  score: number;
  isPass: boolean;
  type: 'standard' | 'needle';
  status: 'pending' | 'fetching' | 'answering' | 'waiting_score' | 'completed'; // Added
  criteria?: string;
  reference?: string;
  usage?: LLMUsageMetadata;
}


@Injectable({
  providedIn: 'root'
})
export class NiahService {
  private http = inject(HttpClient);
  private llmManager = inject(LLMManager);
  private haystackService = inject(HaystackService);
  private modalService = inject(ModalService);
  private i18n = inject(I18nService);

  readonly isTesting = signal(false);
  readonly currentProgress = signal(0);
  readonly currentStatus = signal('');
  readonly targetUsage = signal<LLMUsageMetadata | undefined>(undefined);
  readonly judgeUsage = signal<LLMUsageMetadata | undefined>(undefined);
  readonly targetTotalUsage = signal({ prompt: 0, cached: 0, candidates: 0 });
  readonly judgeTotalUsage = signal({ prompt: 0, cached: 0, candidates: 0 });
  readonly results = signal<TestResult[]>([]);
  readonly lastHaystack = signal<string[]>([]);

  private readonly RESERVED_TOKENS = 1024;

  async runTest(
    targetConfig: LLMConfig,
    judgeConfig: LLMConfig,
    contextSize: number,
    language: Language = 'en'
  ) {
    this.i18n.setLanguage(language);
    this.targetUsage.set(undefined);
    this.judgeUsage.set(undefined);
    this.targetTotalUsage.set({ prompt: 0, cached: 0, candidates: 0 });
    this.judgeTotalUsage.set({ prompt: 0, cached: 0, candidates: 0 });
    this.isTesting.set(true);
    this.results.set([]);
    
    try {
      this.currentStatus.set(this.i18n.translate('loadingNeedles'));
      const assetPath = this.i18n.translate('needlesAsset');
      const needles = await firstValueFrom(this.http.get<Needle[]>(assetPath));
      
      this.currentStatus.set(this.i18n.translate('generatingHaystack'));
      const haystackTarget = Math.max(1024, contextSize - this.RESERVED_TOKENS);
      const baseHaystack = await this.haystackService.generateHaystack(
        haystackTarget,
        targetConfig.provider,
        targetConfig.settings
      );

      this.currentStatus.set(this.i18n.translate('insertingNeedles'));
      const insertionNeedles = needles.map((n, i) => ({
        needle: n.needle,
        depth: Math.floor(((i + 1) / needles.length) * 100)
      }));
      
      const { haystack, checksumMap } = this.haystackService.insertNeedles(baseHaystack, insertionNeedles);
      const haystackText = haystack.join('\n');
      this.lastHaystack.set(haystack);

      // Pre-populate results as pending
      const initialResults: TestResult[] = [
        ...checksumMap.map(c => {
          const question = this.i18n.translate('heartbeatQuestion', c.timestamp);
          return {
            question,
            answer: '',
            judgeResult: '',
            score: 0,
            isPass: false,
            type: 'standard' as const,
            status: 'pending' as const,
            reference: c.needle
          };
        }),
        ...needles.map(n => ({
          question: n.test_prompt,
          answer: '',
          judgeResult: '',
          score: 0,
          isPass: false,
          type: 'needle' as const,
          status: 'pending' as const,
          criteria: n.assessment,
          reference: n.needle
        }))
      ];
      this.results.set(initialResults);

      const totalQuestions = initialResults.length;
      let completedCount = 0;

      // Phase 1: Checksums
      for (let i = 0; i < checksumMap.length; i++) {
        const item = checksumMap[i];
        const statusText = this.i18n.translate('standardCheck');
        this.currentStatus.set(`${statusText}: ${completedCount + 1} / ${totalQuestions}`);
        
        // Mark as fetching
        this.updateResultStatus(i, 'fetching');

        try {
          const question = initialResults[i].question;
          const instruction = this.i18n.translate('checksumInstruction');
          const answer = await this.askTarget(targetConfig, haystackText, `${instruction} ${question}`, i);
          
          const isMatch = answer.toUpperCase().includes(item.checksum.toUpperCase());
          const judgeFeedback = isMatch 
            ? this.i18n.translate('matchSuccess', item.checksum)
            : this.i18n.translate('matchFailed', item.checksum);
          
          this.updateResult(i, {
            answer,
            judgeResult: judgeFeedback,
            score: isMatch ? 10 : 0,
            isPass: isMatch,
            status: 'completed',
            usage: this.targetUsage()
          });
        } catch (error: any) {
          console.error(`Phase 1 Error [Item ${i}]:`, error);
          const errorPrefix = this.i18n.translate('executionError');
          this.updateResult(i, {
            answer: 'ERROR',
            judgeResult: `${errorPrefix}: ${error.message || 'Request failed'}`,
            score: 0,
            isPass: false,
            status: 'completed'
          });
        }

        completedCount++;
        this.currentProgress.set((completedCount / totalQuestions) * 100);
      }

      // Phase 2: Reasoning
      // Step A: Get all target answers first to maintain KV cache
      for (let i = 0; i < needles.length; i++) {
        const needleIdx = checksumMap.length + i;
        const needle = needles[i];
        const statusText = this.i18n.translate('fetchingAnswers');
        this.currentStatus.set(`${statusText}: ${completedCount + 1} / ${totalQuestions}`);
        
        try {
          const answer = await this.askTarget(targetConfig, haystackText, needle.test_prompt, needleIdx);
          this.updateResult(needleIdx, {
            answer,
            status: 'waiting_score' // Now waiting for judging
          });
        } catch (error: any) {
          console.error(`Phase 2 Target Error [Item ${i}]:`, error);
          const errorPrefix = this.i18n.translate('executionError');
          this.updateResult(needleIdx, {
            answer: 'ERROR',
            judgeResult: `${errorPrefix}: ${error.message || 'Request failed'}`,
            score: 0,
            isPass: false,
            status: 'completed'
          });
        }

        completedCount++;
        this.currentProgress.set((completedCount / totalQuestions) * 100);
      }

      // Step B: Now call the judge for all obtained answers
      for (let i = 0; i < needles.length; i++) {
        const needleIdx = checksumMap.length + i;
        const needle = needles[i];
        const currentRes = this.results()[needleIdx];

        if (currentRes.status === 'completed') continue; // Skip those that failed during target phase

        const statusText = this.i18n.translate('judgingAnswers');
        this.currentStatus.set(`${statusText}: ${i + 1} / ${needles.length}`);
        
        try {
          this.updateResultStatus(needleIdx, 'waiting_score');
          const otherNeedleStrings = needles.filter((_, idx) => idx !== i).map(n => n.needle);
          const judgeRes = await this.judgeAnswer(judgeConfig, needle.needle, needle.test_prompt, currentRes.answer, needle.assessment, otherNeedleStrings);
          
          this.updateResult(needleIdx, {
            judgeResult: judgeRes.reason,
            score: judgeRes.score,
            isPass: judgeRes.score >= 7,
            status: 'completed',
            usage: this.targetUsage()
          });
        } catch (error: any) {
          console.error(`Phase 2 Judge Error [Item ${i}]:`, error);
          const errorPrefix = this.i18n.translate('judgingError');
          this.updateResult(needleIdx, {
            judgeResult: `${errorPrefix}: ${error.message || 'Request failed'}`,
            score: 0,
            isPass: false,
            status: 'completed'
          });
        }
      }

      const completedText = this.i18n.translate('completed');
      this.currentStatus.set(completedText);
    } catch (error: any) {
      console.error('NIAH Test Error:', error);
      const errorTitle = this.i18n.translate('executionFailed');
      const errorMessage = this.i18n.translate('testFailed', error.message);
      this.currentStatus.set(`Error: ${error.message || 'Unknown error'}`);
      this.modalService.show(errorMessage, errorTitle);
    } finally {
      this.isTesting.set(false);
    }
  }

  private updateResultStatus(index: number, status: 'pending' | 'fetching' | 'answering' | 'waiting_score' | 'completed') {
    this.results.update(r => {
      const items = [...r];
      if (items[index]) items[index].status = status;
      return items;
    });
  }

  private updateResult(index: number, data: Partial<TestResult>) {
    this.results.update(r => {
      const items = [...r];
      if (items[index]) {
        items[index] = { ...items[index], ...data };
      }
      return items;
    });
  }

  private async askTarget(config: LLMConfig, context: string, prompt: string, index: number): Promise<string> {
    const provider = this.llmManager.getProvider(config.provider);
    if (!provider) throw new Error(`Provider ${config.provider} not found`);

    const systemInstruction = this.i18n.translate('systemInstruction', context);
    const promptPrefix = this.i18n.translate('userQuestionPrefix');
    const contents: LLMContent[] = [{ role: 'user', parts: [{ text: `${promptPrefix}\n${prompt}` }] }];

    let lastUsage: LLMUsageMetadata | undefined;
    let fullText = '';
    let fullThought = '';
    let hasStartedTG = false;

    this.updateResultStatus(index, 'fetching');

    const stream = provider.generateContentStream(config.settings, contents, systemInstruction, {});
    for await (const chunk of stream) {
      if (!hasStartedTG && (chunk.text || chunk.thought)) {
        hasStartedTG = true;
        this.updateResultStatus(index, 'answering');
      }

      if (chunk.thought) fullThought += chunk.thought;
      if (chunk.text && !chunk.thought) fullText += chunk.text;
      
      // Update result signal in real-time
      if (chunk.text || chunk.thought) {
        this.results.update(r => {
          const items = [...r];
          if (items[index]) {
            items[index] = { 
              ...items[index], 
              answer: fullText, 
              thought: fullThought 
            };
          }
          return items;
        });
      }

      if (chunk.usageMetadata) {
        this.targetUsage.set(chunk.usageMetadata);
        lastUsage = chunk.usageMetadata;
      }
    }

    this.updateResultStatus(index, 'waiting_score');

    if (lastUsage) {
      this.targetTotalUsage.update(prev => ({
        prompt: prev.prompt + (lastUsage?.prompt || 0),
        cached: prev.cached + (lastUsage?.cached || 0),
        candidates: prev.candidates + (lastUsage?.candidates || 0)
      }));
    }
    return fullText.trim();
  }

  private async judgeAnswer(config: LLMConfig, needle: string, prompt: string, answer: string, criteria: string, otherNeedles: string[]): Promise<{ score: number; reason: string }> {
    const provider = this.llmManager.getProvider(config.provider);
    if (!provider) throw new Error(`Provider ${config.provider} not found`);

    const judgePromptHead = this.i18n.translate('judgePromptHead');
    const needleLabel = this.i18n.translate('needleLabel');
    const promptLabel = this.i18n.translate('promptLabel');
    const responseLabel = this.i18n.translate('responseLabel');
    const criteriaLabel = this.i18n.translate('criteriaLabel');
    const outputLabel = this.i18n.translate('outputLabel');
    const otherNeedlesSection = this.i18n.translate('otherNeedlesLabel', otherNeedles.map((n, i) => `${i + 1}. ${n}`).join('\n'));

    const judgePrompt = `${judgePromptHead}\n${needleLabel} ${needle}\n${promptLabel} ${prompt}\n${responseLabel} ${answer}\n${criteriaLabel} ${criteria}${otherNeedlesSection}\n${outputLabel} {"score": 1-10, "reason": "string"}`;
    const contents: LLMContent[] = [{ role: 'user', parts: [{ text: judgePrompt }] }];

    const systemMsg = this.i18n.translate('judgeSystemMsg');
    let lastUsage: LLMUsageMetadata | undefined;
    let fullText = '';
    const stream = provider.generateContentStream(config.settings, contents, systemMsg, { responseMimeType: 'application/json' });
    for await (const chunk of stream) {
      if (chunk.text && !chunk.thought) fullText += chunk.text;
      if (chunk.usageMetadata) {
        this.judgeUsage.set(chunk.usageMetadata);
        lastUsage = chunk.usageMetadata;
      }
    }

    if (lastUsage) {
      this.judgeTotalUsage.update(prev => ({
        prompt: prev.prompt + (lastUsage?.prompt || 0),
        cached: prev.cached + (lastUsage?.cached || 0),
        candidates: prev.candidates + (lastUsage?.candidates || 0)
      }));
    }

    try {
      const jsonMatch = fullText.match(/\{[\s\S]*?\}/);
      return JSON.parse(jsonMatch ? jsonMatch[0] : fullText);
    } catch (e) {
      return { score: 0, reason: `Parse Error: ${fullText}` };
    }
  }

  generateReportMarkdown(options: { haystack: boolean; standard: boolean; needle: boolean }): string {
    const allResults = this.results();
    const filteredResults = allResults.filter(r => {
      if (r.type === 'standard' && !options.standard) return false;
      if (r.type === 'needle' && !options.needle) return false;
      return true;
    });

    const passCount = allResults.filter(r => r.isPass).length;
    const avgScore = allResults.length > 0 ? (allResults.reduce((acc, r) => acc + r.score, 0) / allResults.length).toFixed(1) : '0';
    
    let md = `# SpaceStationTest NIAH Report\n\n## Summary: ${passCount}/${allResults.length} Passed | Avg Score: ${avgScore}/10\n\n`;
    
    if (filteredResults.length > 0) {
      md += `| Type | Score | Status | Question | Feedback |\n|---|---|---|---|---|\n`;
      for (const r of filteredResults) {
        md += `| ${r.type} | ${r.score} | ${r.isPass ? '✅' : '❌'} | ${r.question.substring(0, 50)} | ${r.judgeResult} |\n`;
      }
    }

    if (options.haystack) {
      md += `\n\n## Full Haystack Log\n\n\`\`\`\n${this.lastHaystack().join('\n')}\n\`\`\`\n`;
    }
    
    return md;
  }
}
