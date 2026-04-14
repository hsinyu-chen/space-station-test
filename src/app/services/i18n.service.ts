import { inject, Injectable, signal } from '@angular/core';
import { en } from './i18n/en';
import { zh } from './i18n/zh';

export type Language = 'en' | 'zh';

type TranslationValues = typeof en;

@Injectable({
  providedIn: 'root'
})
export class I18nService {
  private translations: Record<Language, TranslationValues> = {
    en,
    zh
  };

  readonly currentLanguage = signal<Language>('en');

  setLanguage(lang: Language) {
    this.currentLanguage.set(lang);
  }

  translate<K extends keyof TranslationValues>(key: K, ...args: any[]): any {
    const lang = this.currentLanguage();
    const value = this.translations[lang][key];
    
    if (typeof value === 'function') {
      return (value as Function)(...args);
    }
    
    return value;
  }

  getLanguage(): Language {
    return this.currentLanguage();
  }
}