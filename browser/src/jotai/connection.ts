import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

// Connection mode: local (USB) or remote (network)
export const connectionModeAtom = atomWithStorage<'local' | 'remote'>('connectionMode', 'local');

// Server URL for remote mode
export const serverUrlAtom = atomWithStorage<string>('serverUrl', 'http://localhost:3000');

// Connection status
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
export const connectionStatusAtom = atom<ConnectionStatus>('disconnected');

// Error message
export const connectionErrorAtom = atom<string>('');
