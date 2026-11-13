export type PersonalEntityKind = 'deck' | 'card' | 'reviewLog' | 'studySession' | 'setting';
export interface PersonalEntity {
  kind: PersonalEntityKind;
  id: string;
  value: unknown | null;
  revision: number;
}
export interface PersonalState { revision: number; entities: PersonalEntity[]; }
export interface PersonalChange {
  kind: PersonalEntityKind;
  id: string;
  value: unknown | null;
  expectedRevision: number;
}
export interface PersonalMutation { id: string; baseRevision: number; changes: PersonalChange[]; }
export interface PersonalReceipt { id: string; hash: string; revision: number; }
export interface PersonalMedia {
  id: string;
  mime: string;
  size: number;
  status: 'pending' | 'ready';
}
export interface PersonalDocument {
  entities: PersonalEntity[];
  receipts: PersonalReceipt[];
  media?: PersonalMedia[];
  mediaKey?: string;
}
export interface PersonalObjectFiles {
  get(path: string): Promise<ArrayBuffer | null>;
  putIfAbsent(path: string, bytes: ArrayBuffer): Promise<void>;
}
export interface PersonalRow { revision: number; stateJson: string; }
export interface PersonalRepository {
  read(ownerId: string, libraryKey: string): Promise<PersonalRow | null>;
  compareSwap(ownerId: string, libraryKey: string, expected: number, next: PersonalRow): Promise<boolean>;
}
