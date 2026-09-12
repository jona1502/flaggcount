import type { FlagCountApi } from './index';

declare global {
  interface Window {
    flagcount: FlagCountApi;
  }
}
