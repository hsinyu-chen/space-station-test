import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

import { routes } from './app.routes';
import { 
  LLMManager, 
  LLMProviderRegistry, 
  BrowserIndexedDBStorage 
} from '@hcs/llm-core';
import { 
  LLM_STORAGE_TOKEN, 
  LLM_TRANSLATIONS, 
  DEFAULT_LLM_TRANSLATIONS 
} from '@hcs/llm-angular-common';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideHttpClient(),
    
    // LLM Provider Registry
    { provide: LLMProviderRegistry, useFactory: () => new LLMProviderRegistry() },
    
    // LLM Storage (IndexedDB)
    { provide: LLM_STORAGE_TOKEN, useFactory: () => new BrowserIndexedDBStorage() },
    
    // LLM Manager
    { 
      provide: LLMManager, 
      useFactory: (storage: BrowserIndexedDBStorage, registry: LLMProviderRegistry) => {
        return new LLMManager(storage, registry);
      },
      deps: [LLM_STORAGE_TOKEN, LLMProviderRegistry]
    },
    
    // Default Translations
    { provide: LLM_TRANSLATIONS, useValue: DEFAULT_LLM_TRANSLATIONS }
  ]
};
