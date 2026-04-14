import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ModalService {
  readonly isOpen = signal(false);
  readonly title = signal('');
  readonly message = signal('');

  show(message: string, title: string = 'Notice') {
    this.message.set(message);
    this.title.set(title);
    this.isOpen.set(true);
  }

  close() {
    this.isOpen.set(false);
  }
}
