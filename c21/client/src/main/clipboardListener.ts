import { clipboard, nativeImage } from 'electron';
import { ClipboardContent } from '../shared/types';

type ClipboardChangeCallback = (content: ClipboardContent) => void;

class ClipboardListener {
  private lastText: string = '';
  private lastImage: string = '';
  private pollingInterval: NodeJS.Timeout | null = null;
  private callbacks: Set<ClipboardChangeCallback> = new Set();
  private isRunning: boolean = false;
  private readonly POLL_INTERVAL = 500;

  start(): void {
    if (this.isRunning) return;

    this.lastText = clipboard.readText();
    this.lastImage = this.getImageHash();
    this.isRunning = true;

    this.pollingInterval = setInterval(() => {
      this.checkClipboard();
    }, this.POLL_INTERVAL);

    console.log('[ClipboardListener] Started');
  }

  stop(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.isRunning = false;
    console.log('[ClipboardListener] Stopped');
  }

  onClipboardChange(callback: ClipboardChangeCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  private checkClipboard(): void {
    const currentText = clipboard.readText();
    const currentImage = this.getImageHash();

    if (currentText && currentText !== this.lastText) {
      this.lastText = currentText;
      this.notifyChange({
        type: 'text',
        data: currentText,
        timestamp: Date.now(),
        fromDeviceId: '',
        userId: '',
        encrypted: false
      });
      return;
    }

    if (currentImage && currentImage !== this.lastImage) {
      this.lastImage = currentImage;
      const image = clipboard.readImage();
      if (!image.isEmpty()) {
        const dataUrl = image.toDataURL();
        this.notifyChange({
          type: 'image',
          data: dataUrl,
          timestamp: Date.now(),
          fromDeviceId: '',
          userId: '',
          encrypted: false
        });
      }
    }
  }

  private getImageHash(): string {
    const image = clipboard.readImage();
    if (image.isEmpty()) return '';
    const buffer = image.toPNG();
    let hash = 0;
    for (let i = 0; i < buffer.length; i++) {
      hash = ((hash << 5) - hash) + buffer[i];
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  private notifyChange(content: ClipboardContent): void {
    console.log('[ClipboardListener] Clipboard changed:', content.type);
    this.callbacks.forEach(cb => {
      try {
        cb(content);
      } catch (error) {
        console.error('[ClipboardListener] Callback error:', error);
      }
    });
  }

  writeToClipboard(content: ClipboardContent): void {
    console.log('[ClipboardListener] Writing to clipboard:', content.type);

    if (content.type === 'text') {
      clipboard.writeText(content.data);
      this.lastText = content.data;
    } else if (content.type === 'image') {
      const image = nativeImage.createFromDataURL(content.data);
      clipboard.writeImage(image);
      this.lastImage = this.getImageHash();
    }
  }

  isActive(): boolean {
    return this.isRunning;
  }
}

export const clipboardListener = new ClipboardListener();
