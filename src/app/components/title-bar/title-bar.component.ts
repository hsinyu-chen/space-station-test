import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LLMSettingsComponent } from '@hcs/llm-angular-settings';
import { SettingsService } from '../../services/settings.service';

@Component({
  selector: 'app-title-bar',
  standalone: true,
  imports: [LLMSettingsComponent],
  templateUrl: './title-bar.component.html',
  styleUrl: './title-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TitleBarComponent {
  private settingsService = inject(SettingsService);
  protected isSettingsOpen = this.settingsService.isSettingsOpen;
}
