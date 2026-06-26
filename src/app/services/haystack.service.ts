import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { LLMManager, LLMProviderConfig } from '@hcs/llm-core';
import { lastValueFrom } from 'rxjs';

type LogTemplate = `[TIME] ${string}: [VAL]${string}` | `[TIME] ${string}: [VAL]`;

interface ChatterData {
  partA: string[];
  partB: string[];
  partC: string[];
  partD: string[];
}

interface SecretsData {
  leaks: string[];
  decoys: string[];
}

export type LeakCategory = 'leak' | 'decoy' | 'clean';

export interface LeakRange {
  category: LeakCategory;
  value: string | null;
  startTs: string;
  endTs: string;
}

@Injectable({
  providedIn: 'root'
})
export class HaystackService {
  private llmManager = inject(LLMManager);
  private http = inject(HttpClient);

  private chatterData: ChatterData | null = null;

  private readonly TEMPLATES: { template: LogTemplate; min: number; max: number; precision?: number }[] = [
    { template: '[TIME] TEMP: [VAL]C', min: 21.0, max: 23.5, precision: 1 },
    { template: '[TIME] HUMID: [VAL]%', min: 40.0, max: 45.0, precision: 1 },
    { template: '[TIME] CABIN_PRESSURE: [VAL]kPa', min: 100.0, max: 102.5, precision: 1 },
    { template: '[TIME] O2_LEVEL: [VAL]%', min: 20.8, max: 21.2, precision: 1 },
    { template: '[TIME] CO2_LEVEL: [VAL]ppm', min: 400, max: 450, precision: 0 },
    { template: '[TIME] RADIATION: [VAL]rem', min: 0.01, max: 0.05, precision: 2 },
    { template: '[TIME] BATTERY_CHARGE: [VAL]%', min: 98.0, max: 100.0, precision: 1 },
    { template: '[TIME] NETWORK_LATENCY: [VAL]ms', min: 12, max: 25, precision: 0 },
    { template: '[TIME] FAN_SPEED: [VAL]RPM', min: 1200, max: 1250, precision: 0 },
    { template: '[TIME] LIGHT_INTENSITY: [VAL]lux', min: 300, max: 350, precision: 0 },
    { template: '[TIME] WATER_SUPPLY: [VAL]L', min: 950, max: 1000, precision: 1 },
  ];

  private readonly CODE_WORDS = [
    'ALPHA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO', 'FOXTROT', 'GOLF', 'HOTEL',
    'INDIA', 'JULIET', 'KILO', 'LIMA', 'MIKE', 'NOVEMBER', 'OSCAR', 'PAPA',
    'QUEBEC', 'ROMEO', 'SIERRA', 'TANGO', 'UNIFORM', 'VICTOR', 'WHISKEY',
    'XRAY', 'YANKEE', 'ZULU', 'OMEGA', 'NEXUS', 'ORION', 'VEGA'
  ];

  private virtualTime = new Date().getTime();

  async generateHaystack(
    targetTokenCount: number,
    targetProviderId: string,
    targetConfig: LLMProviderConfig
  ): Promise<string[]> {
    console.log(`Generating haystack for ${targetTokenCount} tokens...`);

    // Ensure chatter data is loaded
    if (!this.chatterData) {
      await this.loadChatterData();
    }

    // Reset virtual time to something stable for the start of haystack
    this.virtualTime = new Date('2026-04-14T08:00:00Z').getTime();

    // 1. Density Estimation
    const sampleSize = 50;
    const sampleLogs = Array.from({ length: sampleSize }, () => this.getRandomLog());
    const sampleText = sampleLogs.join('\n');

    const provider = this.llmManager.getProvider(targetProviderId);
    if (!provider) throw new Error(`Provider ${targetProviderId} not found`);

    const tokens = await provider.countTokens(targetConfig, targetConfig.modelId!, [{ role: 'user', parts: [{ text: sampleText }] }]);
    const tokensPerLine = tokens / sampleSize;

    console.log(`Estimated density: ${tokensPerLine.toFixed(2)} tokens per line`);

    // 2. Line Targeting
    const targetLines = Math.ceil(targetTokenCount / tokensPerLine);
    console.log(`Targeting ${targetLines} lines total`);

    // 3. Array-Based Generation
    // We generate lines sequentially to keep virtual clock moving forward
    return Array.from({ length: targetLines }, () => this.getRandomLog());
  }

  private addSecondsToTimeString(timeStr: string, seconds: number): string {
    // We must use a fixed date and UTC to avoid local timezone jumps
    const date = new Date(`2026-04-14T${timeStr}Z`);
    date.setUTCSeconds(date.getUTCSeconds() + seconds);
    return date.toISOString().split('T')[1].split('.')[0];
  }

  private getNextTimeJump(): number {
    // Random increment between 5 and 10 seconds
    return (Math.floor(Math.random() * 6) + 5) * 1000;
  }

  async loadChatterData(): Promise<void> {
    try {
      this.chatterData = await lastValueFrom(this.http.get<ChatterData>('/assets/chatter.json'));
    } catch (e) {
      console.error('Failed to load chatter data', e);
    }
  }

  private generateProceduralChatter(): string {
    if (!this.chatterData) {
      return 'Routine chatter data not available.';
    }
    const { partA, partB, partC, partD } = this.chatterData;
    const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
    return `${pick(partA)} ${pick(partB)}, ${pick(partC)} ${pick(partD)}`;
  }

  getRandomLog(): string {
    // Randomized increment 5-10s
    this.virtualTime += this.getNextTimeJump();
    const date = new Date(this.virtualTime);
    const time = date.toISOString().split('T')[1].split('.')[0];
    const timeStr = `[${time}]`;

    // 20% chance to be procedural chatter
    if (Math.random() < 0.2) {
      if (this.chatterData) {
        return `${timeStr} [COMMS_LINK] TRANSCRIPT: "${this.generateProceduralChatter()}"`;
      } else {
        return `${timeStr} [COMMS_LINK] TRANSCRIPT: "Routine chatter pending..."`;
      }
    }

    const config = this.TEMPLATES[Math.floor(Math.random() * this.TEMPLATES.length)];
    const val = (Math.random() * (config.max - config.min) + config.min).toFixed(config.precision ?? 2);
    
    // Wrap the replaced time in brackets to match [HH:mm:ss] format
    return config.template.replace('[TIME]', timeStr).replace('[VAL]', val);
  }

  insertNeedles(haystack: string[], needles: { needle: string; depth: number }[]): {
    haystack: string[],
    checksumMap: { needle: string, checksum: string, timestamp: string }[]
  } {
    const result = [...haystack];
    const checksumMap: { needle: string, checksum: string, timestamp: string }[] = [];

    // Sort needles by depth descending to maintain index accuracy during splicing
    const sortedNeedles = [...needles].sort((a, b) => b.depth - a.depth);

    for (const item of sortedNeedles) {
      const index = Math.floor(result.length * (item.depth / 100));
      const checksum = Math.random().toString(36).substring(2, 8).toUpperCase();

      // Time Logic: Derive from neighbors to prevent 'Time Paradox'
      // Use the internal virtual clock for more stability if neighbors fail
      let timeStr = new Date(this.virtualTime).toISOString().split('T')[1].split('.')[0];
      const prevLine = result[index - 1];
      if (prevLine) {
        const match = prevLine.match(/\[(\d{2}:\d{2}:\d{2})\]/);
        if (match) {
          timeStr = this.addSecondsToTimeString(match[1], 2);
        }
      }

      const formattedNeedle = `[${timeStr}] ${item.needle}`;
      const heartbeatTime = this.addSecondsToTimeString(timeStr, 2);
      const heartbeat = `[${heartbeatTime}] HEARTBEAT: ${checksum}`;

      result.splice(index, 0, formattedNeedle, heartbeat);
      checksumMap.push({ needle: item.needle, checksum: checksum, timestamp: heartbeatTime });
    }

    // Re-reverse sort to forward order for the test runner map
    return { haystack: result, checksumMap: checksumMap.reverse() };
  }

  private generateSecretCode(): string {
    const pick = () => this.CODE_WORDS[Math.floor(Math.random() * this.CODE_WORDS.length)];
    const w1 = pick();
    let w2 = pick();
    while (w2 === w1) w2 = pick();
    const digit = Math.floor(Math.random() * 10);
    return `${w1}-${digit}-${w2}`;
  }

  // Distributes leak / decoy / clean ranges across the gaps between consecutive
  // heartbeats. Leak/decoy ranges get a chatter line spliced a few lines before
  // the range's closing heartbeat; clean ranges get nothing.
  insertSecretLeaks(
    haystack: string[],
    checksumMap: { needle: string; checksum: string; timestamp: string }[],
    secrets: SecretsData
  ): { haystack: string[]; leakMap: LeakRange[] } {
    const result = [...haystack];
    const leakMap: LeakRange[] = [];

    // Both template sets are required (decoys are the precision hard-negatives);
    // if secrets failed to load, skip the leak phase rather than crash on pick([]).
    if (!secrets?.leaks?.length || !secrets?.decoys?.length) {
      return { haystack: result, leakMap };
    }

    // Locate each heartbeat by its unique checksum so range boundaries stay valid.
    const heartbeats = checksumMap
      .map(c => ({ timestamp: c.timestamp, index: result.findIndex(line => line.includes(`HEARTBEAT: ${c.checksum}`)) }))
      .filter(h => h.index >= 0)
      .sort((a, b) => a.index - b.index);

    if (heartbeats.length < 2) {
      return { haystack: result, leakMap };
    }

    const rangeCount = heartbeats.length - 1;
    const leakCount = Math.round(rangeCount * 0.4);
    const decoyCount = Math.round(rangeCount * 0.3);
    const categories: LeakCategory[] = [
      ...Array<LeakCategory>(leakCount).fill('leak'),
      ...Array<LeakCategory>(decoyCount).fill('decoy'),
      ...Array<LeakCategory>(rangeCount - leakCount - decoyCount).fill('clean')
    ];
    // Fisher-Yates shuffle so categories aren't positionally predictable.
    for (let i = categories.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [categories[i], categories[j]] = [categories[j], categories[i]];
    }

    const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
    const injections: { index: number; line: string }[] = [];

    for (let i = 1; i < heartbeats.length; i++) {
      const startHb = heartbeats[i - 1];
      const endHb = heartbeats[i];
      const category = categories[i - 1];
      const range: LeakRange = { category, value: null, startTs: startHb.timestamp, endTs: endHb.timestamp };

      if (category !== 'clean') {
        // A few lines before the closing heartbeat, but never past the opening one.
        const offset = 2 + Math.floor(Math.random() * 3);
        const insertIndex = Math.max(startHb.index + 1, endHb.index - offset);
        const prevLine = result[insertIndex - 1];
        const match = prevLine?.match(/\[(\d{2}:\d{2}:\d{2})\]/);
        const timeStr = match ? this.addSecondsToTimeString(match[1], 1) : startHb.timestamp;

        let text: string;
        if (category === 'leak') {
          const value = this.generateSecretCode();
          range.value = value;
          text = pick(secrets.leaks).replace('[VAL]', value);
        } else {
          text = pick(secrets.decoys);
        }
        injections.push({ index: insertIndex, line: `[${timeStr}] [COMMS_LINK] TRANSCRIPT: "${text}"` });
      }

      leakMap.push(range);
    }

    // Splice in descending index order so earlier insertions don't shift later targets.
    injections.sort((a, b) => b.index - a.index);
    for (const inj of injections) {
      result.splice(inj.index, 0, inj.line);
    }

    return { haystack: result, leakMap };
  }
}
