import { contextBridge } from 'electron';

const api = {
  platform: process.platform
};

export type FlagCountApi = typeof api;

contextBridge.exposeInMainWorld('flagcount', api);
