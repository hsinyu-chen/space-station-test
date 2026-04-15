import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LLMProviderRegistry } from '@hcs/llm-core';

// Providers and their corresponding UI components
import { GeminiProvider } from '@hcs/llm-provider-gemini';
import { GeminiConfigComponent } from '@hcs/llm-angular-ui-gemini';

import { OpenAIProvider } from '@hcs/llm-provider-openai';
import { OpenAIConfigComponent } from '@hcs/llm-angular-ui-openai';

import { LlamaCppProvider } from '@hcs/llm-provider-llama-cpp';
import { LlamaConfigComponent } from '@hcs/llm-angular-ui-llama-cpp';

import { TitleBarComponent } from '../components/title-bar/title-bar.component';
import { TestRunnerComponent } from '../components/test-runner/test-runner.component';
import { ModalComponent } from '../components/modal/modal.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, TitleBarComponent, TestRunnerComponent, ModalComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class App implements OnInit {
  private registry = inject(LLMProviderRegistry);
  protected readonly title = signal('SpaceStationTest');

  ngOnInit() {
    console.log('--- SpaceStationTest Initializing ---');
    
    // 1. Register Gemini
    const gemini = new GeminiProvider();
    this.registry.register(gemini);
    this.registry.registerUIComponent(gemini.settingsComponentId, GeminiConfigComponent);

    // 2. Register OpenAI
    const openai = new OpenAIProvider();
    this.registry.register(openai);
    this.registry.registerUIComponent(openai.settingsComponentId, OpenAIConfigComponent);

    // 3. Register Llama.cpp
    const llama = new LlamaCppProvider();
    this.registry.register(llama);
    this.registry.registerUIComponent(llama.settingsComponentId, LlamaConfigComponent);
    
    console.log('Registered providers:', this.registry.listProviders());
  }
}
