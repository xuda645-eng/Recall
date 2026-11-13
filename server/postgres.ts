import type { D1Result, D1Statement, RecallDatabase } from '../shared/server';

export interface PgQueryResult {
  rows: Record<string, unknown>[];
  rowCount: number | null;
  fields?: { name: string; dataTypeID: number }[];
}

export interface PgClient {
  query(sql: string, values?: unknown[]): Promise<PgQueryResult>;
  release(error?: Error): void;
}

export interface PgPool {
  connect(): Promise<PgClient>;
}

export function postgresParameters(sql: string): string {
  let output = '';
  let index = 0;
  let parameter = 0;
  while (index < sql.length) {
    const character = sql[index];
    if (character === "'" || character === '"') {
      const quote = character;
      output += character;
      index += 1;
      let closed = false;
      while (index < sql.length) {
        const next = sql[index++];
        output += next;
        if (next === quote) {
          if (sql[index] === quote) output += sql[index++];
          else { closed = true; break; }
        }
      }
      if (!closed) throw new Error('Unterminated SQL literal');
    } else if (sql.startsWith('--', index)) {
      const end = sql.indexOf('\n', index);
      const boundary = end === -1 ? sql.length : end + 1;
      output += sql.slice(index, boundary);
      index = boundary;
    } else if (sql.startsWith('/*', index) || character === '$' || character === '\\') {
      throw new Error('Unsupported SQL syntax in Recall statement');
    } else {
      output += character === '?' ? `$${++parameter}` : character;
      index += 1;
    }
  }
  return output;
}

function resultRows<Row>(result: PgQueryResult): D1Result<Row> {
  const integerFields = new Set(result.fields?.filter(field => field.dataTypeID === 20).map(field => field.name));
  const rows = result.rows.map(row => Object.fromEntries(Object.entries(row).map(([name, value]) => {
    if (integerFields.has(name) && value !== null) {
      const integer = Number(value);
      if (!Number.isSafeInteger(integer)) throw new Error('PostgreSQL integer outside Recall safe range');
      return [name, integer];
    }
    return [name, value];
  }))) as Row[];
  return { success: true, results: rows, meta: { changes: result.rowCount ?? 0 } };
}

export class PostgresDatabase implements RecallDatabase {
  readonly dialect = 'postgresql';

  constructor(private readonly pool: PgPool) {}

  prepare(query: string): PostgresStatement {
    return new PostgresStatement(this, postgresParameters(query));
  }

  async batch<Row = Record<string, unknown>>(statements: D1Statement[]): Promise<D1Result<Row>[]> {
    const prepared = statements.map(statement => {
      if (!(statement instanceof PostgresStatement) || statement.database !== this) throw new Error('Foreign database statement');
      return statement;
    });
    if (!prepared.length) return [];
    for (let attempt = 0; ; attempt += 1) {
      try { return await this.executeBatch<Row>(prepared); }
      catch (error) {
        const code = error instanceof Error && 'code' in error ? error.code : undefined;
        if (attempt >= 2 || !['40001', '40P01'].includes(String(code))) throw error;
      }
    }
  }

  private async executeBatch<Row>(prepared: PostgresStatement[]): Promise<D1Result<Row>[]> {
    const client = await this.pool.connect();
    let releaseError: Error | undefined;
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      await client.query("SET LOCAL statement_timeout = '15s'");
      await client.query("SET LOCAL lock_timeout = '5s'");
      const results: D1Result<Row>[] = [];
      for (const statement of prepared) results.push(resultRows<Row>(await client.query(statement.sql, statement.values)));
      await client.query('COMMIT');
      return results;
    } catch (error) {
      try { await client.query('ROLLBACK'); }
      catch (rollbackError) { releaseError = rollbackError instanceof Error ? rollbackError : new Error('Rollback failed'); }
      throw error;
    } finally {
      client.release(releaseError);
    }
  }
}

class PostgresStatement implements D1Statement {
  values: unknown[] = [];

  constructor(readonly database: PostgresDatabase, readonly sql: string) {}

  bind(...values: unknown[]): this {
    this.values = values;
    return this;
  }

  async first<Row = Record<string, unknown>>(): Promise<Row | null> {
    return (await this.all<Row>()).results[0] ?? null;
  }

  async all<Row = Record<string, unknown>>(): Promise<D1Result<Row>> {
    return (await this.database.batch<Row>([this]))[0];
  }

  async run<Row = Record<string, unknown>>(): Promise<D1Result<Row>> {
    return this.all<Row>();
  }
}
