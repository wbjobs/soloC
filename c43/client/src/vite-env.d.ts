/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module 'simple-peer' {
  export default class SimplePeer {
    constructor(opts: any);
    signal(data: any): void;
    send(data: any): void;
    destroy(): void;
    on(event: string, callback: (data?: any) => void): void;
  }
}
