declare module "react-dom/client" {
  import type { ReactNode } from "react";

  export type Root = {
    render(children: ReactNode): void;
    unmount(): void;
  };

  export function createRoot(container: Element | DocumentFragment): Root;
}

declare module "vite" {
  export function defineConfig(config: unknown): unknown;
}

declare module "electron" {
  export const app: any;
  export const clipboard: any;
  export const ipcMain: any;
  export const ipcRenderer: any;
  export const shell: any;
  export const BrowserWindow: any;
}
