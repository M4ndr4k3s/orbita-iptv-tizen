// Mensagens entre a interface e o worker de dados (dono do IndexedDB).

import type { Channel, Group, ImportStats, SavedEntry } from '../playlist/model';
import type { ImportErrorCode, ImportProgress } from '../playlist/runImport';
import type { Source } from '../playlist/source';
import type { EpgStats, Programme } from '../epg/model';
import type { EpgHit } from '../storage/epgStore';
import type { EpgErrorCode } from '../epg/runEpg';

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
  'channels.ids': { args: [string, string | null, string[]?]; result: string[] };
  'channels.getMany': { args: [string[]]; result: Array<Channel | null> };
  'channels.search': { args: [string, string, string[]?]; result: string[] };
  /** ids de filmes ou séries de uma categoria (ou de todas com null) */
  'vod.ids': { args: [string, 'movie' | 'series', string | null, string[]?]; result: string[] };
  /** filmes ou séries adicionados mais recentemente (Xtream; vazio sem a data) */
  'vod.recent': { args: [string, 'movie' | 'series', string[]?]; result: string[] };
  /** busca de filmes ou séries por nome */
  'vod.search': { args: [string, 'movie' | 'series', string, string[]?]; result: string[] };
  /** programas do guia pelo título (no ar ou nas próximas horas), já casados com canais da lista */
  'epg.search': { args: [string, string, string, string[]?]; result: EpgHit[] };
  /** prepara os índices da busca global (filmes, séries e títulos do guia) */
  'search.warm': { args: [string, string | null]; result: void };
  'library.list': { args: ['favorites' | 'history', string]; result: SavedEntry[] };
  'library.toggleFavorite': { args: [SavedEntry]; result: boolean };
  'library.addHistory': { args: [SavedEntry]; result: void };
  'library.clearHistory': { args: []; result: void };
  /** programas de um canal (por tvg-id ou nome) que terminam depois de `from` */
  'epg.schedule': { args: [string, string | null, string, number, number]; result: Programme[] };
}
export type RpcName = keyof RpcMethods;

export type ToWorker =
  | { type: 'start'; jobId: number; gk: string; source: Pick<Source, 'kind' | 'url' | 'server' | 'username' | 'password'> }
  | { type: 'cancel'; jobId: number }
  | { type: 'epgStart'; jobId: number; ek: string; url: string }
  | { type: 'rpc'; id: number; method: RpcName; args: unknown[] };

export type FromWorker =
  | { type: 'progress'; jobId: number; progress: ImportProgress }
  | { type: 'done'; jobId: number; stats: ImportStats & { truncated: boolean } }
  | { type: 'error'; jobId: number; code: ImportErrorCode; status: number }
  | { type: 'epgDone'; jobId: number; stats: EpgStats }
  | { type: 'epgError'; jobId: number; code: EpgErrorCode; status: number }
  | { type: 'rpcResult'; id: number; ok: true; result: unknown }
  | { type: 'rpcResult'; id: number; ok: false; error: string };
