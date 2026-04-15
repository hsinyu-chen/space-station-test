import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  readonly isSettingsOpen = signal(false);

  open() {
    this.isSettingsOpen.set(true);
  }

  close() {
    this.isSettingsOpen.set(false);
  }
}
