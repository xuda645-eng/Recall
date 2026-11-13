export interface WereadCapabilityStatus {
  available: boolean;
  aiAvailable: boolean;
  accountKey: string | null;
}
export const WEREAD_OPERATIONS = ['books', 'book', 'progress', 'question', 'merge', 'budget'] as const;
export type WereadOperation = typeof WEREAD_OPERATIONS[number];
export interface WereadBooksRequest { cursor?: number; }
export interface WereadBookRequest { bookId: string; }
export interface WereadQuestionRequest { markText: string; summary: boolean; }
export interface WereadBudgetResponse { remaining: number; }
