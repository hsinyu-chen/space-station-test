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

export type Language = 'en' | 'zh';

@Injectable({
  providedIn: 'root'
})
export class NiahService {
  private http = inject(HttpClient);
  private llmManager = inject(LLMManager);
  private haystackService = inject(HaystackService);
  private modalService = inject(ModalService);

  readonly isTesting = signal(false);
  readonly currentLanguage = signal<Language>('en');
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
    this.currentLanguage.set(language);
    this.targetUsage.set(undefined);
    this.judgeUsage.set(undefined);
    this.targetTotalUsage.set({ prompt: 0, cached: 0, candidates: 0 });
    this.judgeTotalUsage.set({ prompt: 0, cached: 0, candidates: 0 });
    this.isTesting.set(true);
    this.results.set([]);
    
    try {
      this.currentStatus.set(language === 'zh' ? '正在載入測試案例...' : 'Loading needles...');
      const assetPath = language === 'zh' ? 'assets/needles_zh.json' : 'assets/needles.json';
      const needles = await firstValueFrom(this.http.get<Needle[]>(assetPath));
      
      this.currentStatus.set(language === 'zh' ? '正在產生日誌數據...' : 'Generating Haystack...');
      const haystackTarget = Math.max(1024, contextSize - this.RESERVED_TOKENS);
      const baseHaystack = await this.haystackService.generateHaystack(
        haystackTarget,
        targetConfig.provider,
        targetConfig.settings
      );

      this.currentStatus.set(language === 'zh' ? '正在插入測試點與校驗碼...' : 'Inserting needles & checksums...');
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
          const question = language === 'zh' 
            ? `根據日誌記錄，在時間 '${c.timestamp}' 記錄的 HEARTBEAT 校驗碼是什麼？`
            : `According to the logs, what is the HEARTBEAT checksum recorded at time '${c.timestamp}'?`;
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
        const statusText = language === 'zh' ? '標準 NIAH 檢查' : 'Standard NIAH Check';
        this.currentStatus.set(`${statusText}: ${completedCount + 1} / ${totalQuestions}`);
        
        // Mark as running
        this.updateResultStatus(i, 'running');

        try {
          const question = initialResults[i].question;
          const instruction = language === 'zh' ? '僅需回答校驗碼數值。' : 'Respond only with the checksum value.';
          const answer = await this.askTarget(targetConfig, haystackText, `${instruction} ${question}`);
          
          const isMatch = answer.toUpperCase().includes(item.checksum.toUpperCase());
          const judgeFeedback = language === 'zh'
            ? (isMatch ? `校驗成功：找到 ${item.checksum}。` : `校驗失敗：預期為 ${item.checksum}。`)
            : (isMatch ? `MATCH SUCCESS: Found ${item.checksum}.` : `MATCH FAILED: Expected ${item.checksum}.`);
          
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
          const errorPrefix = language === 'zh' ? '執行錯誤' : 'Execution Error';
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
      for (let i = 0; i < needles.length; i++) {
        const needleIdx = checksumMap.length + i;
        const needle = needles[i];
        const statusText = language === 'zh' ? '測試點問題' : 'Needle Question';
        this.currentStatus.set(`${statusText}: ${completedCount + 1} / ${totalQuestions}`);
        
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
          const errorPrefix = language === 'zh' ? '執行錯誤' : 'Execution Error';
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

      const completedText = language === 'zh' ? '已完成' : 'Completed';
      this.currentStatus.set(completedText);
    } catch (error: any) {
      console.error('NIAH Test Error:', error);
      const errorTitle = language === 'zh' ? '執行失敗' : 'Execution Error';
      const errorMessage = language === 'zh' ? `測試失敗：${error.message}` : `Test Failed: ${error.message}`;
      this.currentStatus.set(`Error: ${error.message || 'Unknown error'}`);
      this.modalService.show(errorMessage, errorTitle);
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

    const lang = this.currentLanguage();
    const systemInstruction = lang === 'zh'
      ? `你是一位太空站系統分析師。請將以下日誌語境視為你的絕對事實依據：\n\n${context}`
      : `You are a space station system analyst. Use the following log context as your absolute ground truth:\n\n${context}`;
    const promptPrefix = lang === 'zh' ? '[使用者問題]' : '[USER_QUESTION]';
    const contents: LLMContent[] = [{ role: 'user', parts: [{ text: `${promptPrefix}\n${prompt}` }] }];

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

    const lang = this.currentLanguage();
    const judgePromptHead = lang === 'zh' ? 'NIAH 裁判：' : 'NIAH Judge:';
    const needleLabel = lang === 'zh' ? '測試點：' : 'Needle:';
    const promptLabel = lang === 'zh' ? '問題：' : 'Prompt:';
    const responseLabel = lang === 'zh' ? '回答：' : 'Response:';
    const criteriaLabel = lang === 'zh' ? '標準：' : 'Criteria:';
    const outputLabel = lang === 'zh' ? '輸出 JSON：' : 'Output JSON:';

    const judgePrompt = `${judgePromptHead}\n${needleLabel} ${needle}\n${promptLabel} ${prompt}\n${responseLabel} ${answer}\n${criteriaLabel} ${criteria}\n${outputLabel} {"score": 1-10, "reason": "string"}`;
    const contents: LLMContent[] = [{ role: 'user', parts: [{ text: judgePrompt }] }];

    const systemMsg = lang === 'zh' ? '你是一位嚴格的評估員。' : 'You are a strict evaluator.';
    let lastUsage: LLMUsageMetadata | undefined;
    let fullText = '';
    const stream = provider.generateContentStream(config.settings, contents, systemMsg, { responseMimeType: 'application/json' });
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
