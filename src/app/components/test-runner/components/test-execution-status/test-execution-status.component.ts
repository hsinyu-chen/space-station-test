import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NiahService } from '../../../../services/niah.service';

@Component({
  selector: 'app-test-execution-status',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './test-execution-status.component.html',
  styleUrl: './test-execution-status.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TestExecutionStatusComponent {
  protected niah = inject(NiahService);
}
