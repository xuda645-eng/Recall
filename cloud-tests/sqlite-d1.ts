import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { SQLInputValue } from 'node:sqlite';
import type { D1Result, D1Statement, RecallDatabase } from '../shared/server';

export class SqliteD1 implements RecallDatabase {
  readonly sqlite = new DatabaseSync(':memory:');
  beforeBatch?: (statements: SqliteStatement[]) => Promise<void>;
  beforeFirst?: (query: string) => Promise<void>;
  afterFirst?: (query: string) => Promise<void>;
  beforeAll?: (query: string) => Promise<void>;
  beforeRun?: (query: string) => Promise<void>;
  failQuery?: string;
  failAtStatement?: number;
  readonly batchSizes: number[] = [];
  readonly bindings: unknown[][] = [];
  readonly executedStatements: { query: string; changes: number }[] = [];

  constructor() {
    this.sqlite.exec('PRAGMA foreign_keys = ON');
    this.migrate();
  }

  migrate(): void {
    this.sqlite.exec(readFileSync(new URL('../migrations/20261031_recall_cloud.sql', import.meta.url), 'utf8'));
  }

  prepare(query: string): SqliteStatement {
    return new SqliteStatement(this, query);
  }

  async batch<Row = Record<string, unknown>>(statements: D1Statement[]): Promise<D1Result<Row>[]> {
    const prepared = statements as SqliteStatement[];
    await this.beforeBatch?.(prepared);
    this.batchSizes.push(prepared.length);
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const results = prepared.map((statement, index) => {
        if (this.failAtStatement === index) throw new Error('Injected batch failure');
        return statement.execute<Row>();
      });
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }

  close(): void {
    this.sqlite.close();
  }
}

export class SqliteStatement implements D1Statement {
  private values: SQLInputValue[] = [];

  constructor(private db: SqliteD1, readonly query: string) {}

  bind(...values: unknown[]): this {
    this.values = values as SQLInputValue[];
    this.db.bindings.push(values);
    return this;
  }

  async first<Row = Record<string, unknown>>(): Promise<Row | null> {
    await this.db.beforeFirst?.(this.query);
    const result = (this.db.sqlite.prepare(this.query).get(...this.values) ?? null) as Row | null;
    await this.db.afterFirst?.(this.query);
    return result;
  }

  async all<Row = Record<string, unknown>>(): Promise<D1Result<Row>> {
    await this.db.beforeAll?.(this.query);
    return this.execute<Row>();
  }

  async run<Row = Record<string, unknown>>(): Promise<D1Result<Row>> {
    await this.db.beforeRun?.(this.query);
    return this.execute<Row>();
  }

  execute<Row = Record<string, unknown>>(): D1Result<Row> {
    if (this.db.failQuery && this.query.includes(this.db.failQuery)) throw new Error('Injected SQL failure');
    const statement = this.db.sqlite.prepare(this.query);
    let results: Row[] = [];
    let changes = 0;
    if (/^\s*SELECT/i.test(this.query) || /RETURNING/i.test(this.query)) {
      results = statement.all(...this.values) as Row[];
      if (!/^\s*SELECT/i.test(this.query)) {
        changes = (this.db.sqlite.prepare('SELECT changes() AS changes').get() as { changes: number }).changes;
      }
    } else {
      changes = Number(statement.run(...this.values).changes);
    }
    this.db.executedStatements.push({ query: this.query, changes });
    return { success: true, results, meta: { changes } };
  }
}

export function barrier(participants: number): () => Promise<void> {
  let arrivals = 0;
  let release: () => void = () => {};
  const ready = new Promise<void>(resolve => { release = resolve; });
  return async () => {
    arrivals += 1;
    if (arrivals >= participants) release();
    await ready;
  };
}
