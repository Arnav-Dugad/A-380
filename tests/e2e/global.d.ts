import type { Bridge } from '../../src/debug/bridge';

declare global {
  interface Window {
    __a380?: Bridge;
  }
}
export {};
