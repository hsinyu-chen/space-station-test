import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { LLMManager, LLMConfig, LLMContent, LLMUsageMetadata } from '@hcs/llm-core';
import { HaystackService } from './haystack.service';
import { ModalService } from './modal.service';
import { firstValueFrom } from 'rxjs';

export interface Needle {
  needle: string;
  test_prompt: string;
  assessment: string;
}

export interface TestResult {
  question: string;
  answer: string;
  judgeResult: string;
  score: number;
  isPass: boolean;
  type: 'standard' | 'needle';
  status: 'pending' | 'running' | 'completed'; // Added
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
    contextSize: number
  ) {
    this.targetUsage.set(undefined);
    this.judgeUsage.set(undefined);
    this.targetTotalUsage.set({ prompt: 0, cached: 0, candidates: 0 });
    this.judgeTotalUsage.set({ prompt: 0, cached: 0, candidates: 0 });
    this.isTesting.set(true);
    this.results.set([]);
    
    try {
      this.currentStatus.set('Loading needles...');
      const needles = await firstValueFrom(this.http.get<Needle[]>('assets/needles.json'));
      
      this.currentStatus.set('Generating Haystack...');
      const haystackTarget = Math.max(1024, contextSize - this.RESERVED_TOKENS);
      const baseHaystack = await this.haystackService.generateHaystack(
        haystackTarget,
        targetConfig.provider,
        targetConfig.settings
      );

      this.currentStatus.set('Inserting needles & checksums...');
      const insertionNeedles = needles.map((n, i) => ({
        needle: n.needle,
        depth: Math.floor(((i + 1) / needles.length) * 100)
      }));
      
      const { haystack, checksumMap } = this.haystackService.insertNeedles(baseHaystack, insertionNeedles);
      const haystackText = haystack.join('\n');
      this.lastHaystack.set(haystack);

      // Pre-populate results as pending
      const initialResults: TestResult[] = [
        ...checksumMap.map(c => ({
          question: `According to the logs, what is the HEARTBEAT checksum recorded at time '${c.timestamp}'?`,
          answer: '',
          judgeResult: '',
          score: 0,
          isPass: false,
          type: 'standard' as const,
          status: 'pending' as const,
          reference: c.needle
        })),
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
        this.currentStatus.set(`Standard NIAH Check: ${completedCount + 1} / ${totalQuestions}`);
        
        // Mark as running
        this.updateResultStatus(i, 'running');

        try {
          const question = initialResults[i].question;
          const answer = await this.askTarget(targetConfig, haystackText, `Respond only with the checksum value. ${question}`);
          
          const isMatch = answer.toUpperCase().includes(item.checksum.toUpperCase());
          const judgeFeedback = isMatch 
            ? `MATCH SUCCESS: Found ${item.checksum}.`
            : `MATCH FAILED: Expected ${item.checksum}.`;
          
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
          this.updateResult(i, {
            answer: 'ERROR',
            judgeResult: `Execution Error: ${error.message || 'Request failed'}`,
            score: 0,
            isPass: false,
            status: 'completed'
          });
        }

        completedCount++;
        this.currentProgress.set((completedCount / totalQuestions) * 100);
      }

      // Phase 2: Reasoning
      for (let i = 0; i < needles.length; i++) {
        const needleIdx = checksumMap.length + i;
        const needle = needles[i];
        this.currentStatus.set(`Needle Question: ${completedCount + 1} / ${totalQuestions}`);
        
        this.updateResultStatus(needleIdx, 'running');

        try {
          const answer = await this.askTarget(targetConfig, haystackText, needle.test_prompt);
          const judgeRes = await this.judgeAnswer(judgeConfig, needle.needle, needle.test_prompt, answer, needle.assessment);
          
          this.updateResult(needleIdx, {
            answer,
            judgeResult: judgeRes.reason,
            score: judgeRes.score,
            isPass: judgeRes.score >= 7,
            status: 'completed',
            usage: this.targetUsage()
          });
        } catch (error: any) {
          console.error(`Phase 2 Error [Item ${i}]:`, error);
          this.updateResult(needleIdx, {
            answer: 'ERROR',
            judgeResult: `Execution Error: ${error.message || 'Request failed'}`,
            score: 0,
            isPass: false,
            status: 'completed'
          });
        }

        completedCount++;
        this.currentProgress.set((completedCount / totalQuestions) * 100);
      }

      this.currentStatus.set('Completed');
    } catch (error: any) {
      console.error('NIAH Test Error:', error);
      this.currentStatus.set(`Error: ${error.message || 'Unknown error'}`);
      this.modalService.show(`Test Failed: ${error.message}`, 'Execution Error');
    } finally {
      this.isTesting.set(false);
    }
  }

  private updateResultStatus(index: number, status: 'pending' | 'running' | 'completed') {
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

  private async askTarget(config: LLMConfig, context: string, prompt: string): Promise<string> {
    const provider = this.llmManager.getProvider(config.provider);
    if (!provider) throw new Error(`Provider ${config.provider} not found`);

    const systemInstruction = `You are a space station system analyst. Use the following log context as your absolute ground truth:\n\n${context}`;
    const contents: LLMContent[] = [{ role: 'user', parts: [{ text: `[USER_QUESTION]\n${prompt}` }] }];

    let lastUsage: LLMUsageMetadata | undefined;
    let fullText = '';
    const stream = provider.generateContentStream(config.settings, contents, systemInstruction, {});
    for await (const chunk of stream) {
      if (chunk.text) fullText += chunk.text;
      if (chunk.usageMetadata) {
        this.targetUsage.set(chunk.usageMetadata);
        lastUsage = chunk.usageMetadata;
      }
    }

    if (lastUsage) {
      this.targetTotalUsage.update(prev => ({
        prompt: prev.prompt + (lastUsage?.prompt || 0),
        cached: prev.cached + (lastUsage?.cached || 0),
        candidates: prev.candidates + (lastUsage?.candidates || 0)
      }));
    }
    return fullText.trim();
  }

  private async judgeAnswer(config: LLMConfig, needle: string, prompt: string, answer: string, criteria: string): Promise<{ score: number; reason: string }> {
    const provider = this.llmManager.getProvider(config.provider);
    if (!provider) throw new Error(`Provider ${config.provider} not found`);

    const judgePrompt = `NIAH Judge:\nNeedle: ${needle}\nPrompt: ${prompt}\nResponse: ${answer}\nCriteria: ${criteria}\nOutput JSON: {"score": 1-10, "reason": "string"}`;
    const contents: LLMContent[] = [{ role: 'user', parts: [{ text: judgePrompt }] }];

    let lastUsage: LLMUsageMetadata | undefined;
    let fullText = '';
    const stream = provider.generateContentStream(config.settings, contents, 'You are a strict evaluator.', { responseMimeType: 'application/json' });
    for await (const chunk of stream) {
      if (chunk.text) fullText += chunk.text;
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
