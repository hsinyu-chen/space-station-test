import { inject, Injectable } from '@angular/core';
import { LLMManager, LLMProviderConfig } from '@hcs/llm-core';

type LogTemplate = `[TIME] ${string}: [VAL]${string}` | `[TIME] ${string}: [VAL]`;

@Injectable({
  providedIn: 'root'
})
export class HaystackService {
  private llmManager = inject(LLMManager);

  private readonly TEMPLATES: { template: LogTemplate; min: number; max: number; precision?: number }[] = [
    { template: '[TIME] TEMP: [VAL]C', min: 21.0, max: 23.5, precision: 1 },
    { template: '[TIME] HUMID: [VAL]%', min: 40.0, max: 45.0, precision: 1 },
    { template: '[TIME] CORE_PRESSURE: [VAL]kPa', min: 100.0, max: 102.5, precision: 1 },
    { template: '[TIME] O2_LEVEL: [VAL]%', min: 20.8, max: 21.2, precision: 1 },
    { template: '[TIME] CO2_LEVEL: [VAL]ppm', min: 400, max: 450, precision: 0 },
    { template: '[TIME] RADIATION: [VAL]rem', min: 0.01, max: 0.05, precision: 2 },
    { template: '[TIME] GRAVITY: [VAL]G', min: 0.99, max: 1.01, precision: 2 },
    { template: '[TIME] BATTERY_CHARGE: [VAL]%', min: 98.0, max: 100.0, precision: 1 },
    { template: '[TIME] NETWORK_LATENCY: [VAL]ms', min: 12, max: 25, precision: 0 },
    { template: '[TIME] FAN_SPEED: [VAL]RPM', min: 1200, max: 1250, precision: 0 },
    { template: '[TIME] LIGHT_INTENSITY: [VAL]lux', min: 300, max: 350, precision: 0 },
    { template: '[TIME] WATER_SUPPLY: [VAL]L', min: 950, max: 1000, precision: 1 },
  ];

  private virtualTime = new Date().getTime();

  async generateHaystack(
    targetTokenCount: number,
    targetProviderId: string,
    targetConfig: LLMProviderConfig
  ): Promise<string[]> {
    console.log(`Generating haystack for ${targetTokenCount} tokens...`);

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

  getRandomLog(): string {
    // Randomized increment 5-10s
    this.virtualTime += this.getNextTimeJump();
    const date = new Date(this.virtualTime);
    const time = date.toISOString().split('T')[1].split('.')[0];

    const config = this.TEMPLATES[Math.floor(Math.random() * this.TEMPLATES.length)];
    const val = (Math.random() * (config.max - config.min) + config.min).toFixed(config.precision ?? 2);
    
    // Wrap the replaced time in brackets to match [HH:mm:ss] format
    return config.template.replace('[TIME]', `[${time}]`).replace('[VAL]', val);
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
}
