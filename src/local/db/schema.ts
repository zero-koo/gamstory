import type { Table } from 'dexie';

export type Locale = 'ko-KR' | 'en';

export interface LocalGame {
  id: string;            // ulid
  name: string;
  imageBlob?: Blob;
  createdAt: number;     // epoch ms
}

export interface LocalMemberLink {
  workspaceId: string;
  workspacePlayerId: string;
}

export interface LocalMember {
  id: string;
  name: string;
  avatarBlob?: Blob;
  links: LocalMemberLink[];
  createdAt: number;
}

export type GameRef =
  | { kind: 'global'; id: string }
  | { kind: 'local'; id: string };

export interface LocalPlayParticipant {
  localMemberId: string;
  rank?: number;
  score?: number;
  isWinner: boolean;
  order: number;
}

export type SyncState = 'local' | 'uploading' | 'uploaded' | 'failed';

export interface LocalPlay {
  id: string;
  gameRef: GameRef;
  playedAt: number;         // epoch ms (date-only granularity at write time, but stored as ms)
  participants: LocalPlayParticipant[];
  description?: string;
  photoIds: string[];
  remote?: { workspaceId: string; playId: string; version: number };
  syncState: SyncState;
  idempotencyKey: string;   // uuid v4
  createdAt: number;
  updatedAt: number;
}

export interface LocalPhoto {
  id: string;
  playId: string;
  blob: Blob;
  order: number;
  mimeType: string;
  byteSize: number;
  width?: number;
  height?: number;
  uploadState?: 'pending' | 'uploaded' | 'failed';
  createdAt: number;
}

export interface GameCacheEntry {
  id: string;           // global game id
  name: string;
  imageUrl?: string;
  year?: number;
  minPlayers?: number;
  maxPlayers?: number;
  cachedAt: number;
}

export interface LocalSchemaV1 {
  localGames: Table<LocalGame, string>;
  localMembers: Table<LocalMember, string>;
  localPlays: Table<LocalPlay, string>;
  localPhotos: Table<LocalPhoto, string>;
  gameCache: Table<GameCacheEntry, string>;
}

export const DEXIE_DB_NAME = 'gamstory';
export const DEXIE_VERSION = 1;
