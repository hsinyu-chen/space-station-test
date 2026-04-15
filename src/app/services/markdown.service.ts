import { inject, Injectable } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';
import * as katex from 'katex';

@Injectable({
  providedIn: 'root'
})
export class MarkdownService {
  private sanitizer = inject(DomSanitizer);

  render(text: string): SafeHtml {
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

    const html = marked.parse(processedText);
    return this.sanitizer.bypassSecurityTrustHtml(html as string);
  }
}
