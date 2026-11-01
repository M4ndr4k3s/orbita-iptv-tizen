// Mensagens entre a interface e o worker de dados (dono do IndexedDB).

import type { Channel, Group, ImportStats, SavedEntry } from '../playlist/model';
import type { ImportErrorCode, ImportProgress } from '../playlist/runImport';
import type { Source } from '../playlist/source';

/** Métodos que a interface pode chamar no worker (lista fechada). */
export interface RpcMethods {
  ping: { args: []; result: true };
  'sources.getAll': { args: []; result: Source[] };
  'sources.put': { args: [Source]; result: void };
  'sources.delete': { args: [string]; result: void };
  'gens.cleanup': { args: [string[], string[]]; result: string[] };
  'groups.get': { args: [string]; result: Group[] };
  'channels.page': { args: [string, string, number, number]; result: Channel[] };
  'channels.first': { args: [string]; result: Channel | null };
  'channels.neighbor': { args: [string, number, 1 | -1]; result: Channel | null };
  'channels.byNumber': { args: [string, number]; result: Channel | null };
  /** ids de um grupo (ou todos os ao vivo com null), na ordem da lista */
  'channels.ids': { args: [string, string | null]; result: string[] };
  'channels.getMany': { args: [string[]]; result: Array<Channel | null> };
  'channels.search': { args: [string, string]; result: string[] };
  'library.list': { args: ['favorites' | 'history', string]; result: SavedEntry[] };
  'library.toggleFavorite': { args: [SavedEntry]; result: boolean };
  'library.addHistory': { args: [SavedEntry]; result: void };
}
export type RpcName = keyof RpcMethods;

export type ToWorker =
  | { type: 'start'; jobId: number; gk: string; source: Pick<Source, 'kind' | 'url' | 'server' | 'username' | 'password'> }
  | { type: 'cancel'; jobId: number }
  | { type: 'rpc'; id: number; method: RpcName; args: unknown[] };

export type FromWorker =
  | { type: 'progress'; jobId: number; progress: ImportProgress }
  | { type: 'done'; jobId: number; stats: ImportStats & { truncated: boolean } }
  | { type: 'error'; jobId: number; code: ImportErrorCode; status: number }
  | { type: 'rpcResult'; id: number; ok: true; result: unknown }
  | { type: 'rpcResult'; id: number; ok: false; error: string };
