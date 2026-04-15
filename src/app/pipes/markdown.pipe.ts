import { inject, Pipe, PipeTransform } from '@angular/core';
import { SafeHtml } from '@angular/platform-browser';
import { MarkdownService } from '../services/markdown.service';

@Pipe({
  name: 'markdown',
  standalone: true
})
export class MarkdownPipe implements PipeTransform {
  private markdownService = inject(MarkdownService);

  transform(value: string | undefined | null): SafeHtml {
    return this.markdownService.render(value || '');
  }
}
