import { createHash, randomUUID } from 'crypto';
import { db } from '../auth.js';
import type { Script, ScriptWithCode } from '@/shared/types.js';

export interface ScriptVersionRow {
  id: string;
  scriptId: string;
  version: number;
  code: string;
  contentHash: string;
  createdAt: string;
}

interface ScriptRow {
  id: string;
  name: string;
  description: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function normalizeCode(code: string): string {
  let text = code.replace(/\r\n?/g, '\n');
  text = text
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n');
  text = text.replace(/\n+$/g, '');
  return text + '\n';
}

export function hashCode(code: string): string {
  return createHash('sha256').update(normalizeCode(code)).digest('hex');
}

function toIsoDate(value: string): string {
  // SQLite CURRENT_TIMESTAMP returns "YYYY-MM-DD HH:MM:SS" in UTC; normalize to ISO.
  if (value.includes('T')) return value;
  return value.replace(' ', 'T') + 'Z';
}

function rowToScript(row: ScriptRow, latestVersion: number): Script {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    archivedAt: row.archivedAt ? toIsoDate(row.archivedAt) : null,
    createdAt: toIsoDate(row.createdAt),
    updatedAt: toIsoDate(row.updatedAt),
    latestVersion,
  };
}

class ScriptService {
  listScripts(includeArchived = false): Script[] {
    const rows = db
      .prepare(
        includeArchived
          ? 'SELECT * FROM script ORDER BY updatedAt DESC'
          : 'SELECT * FROM script WHERE archivedAt IS NULL ORDER BY updatedAt DESC'
      )
      .all() as ScriptRow[];

    return rows.map((row) => {
      const latest = this.getLatestVersion(row.id);
      return rowToScript(row, latest?.version ?? 0);
    });
  }

  getScript(id: string): ScriptWithCode | null {
    const row = db.prepare('SELECT * FROM script WHERE id = ?').get(id) as
      | ScriptRow
      | undefined;
    if (!row) return null;

    const latest = this.getLatestVersion(id);
    if (!latest) {
      // Script exists but has no versions yet — shouldn't happen because createScript always inserts v1.
      return { ...rowToScript(row, 0), code: '' };
    }

    return { ...rowToScript(row, latest.version), code: latest.code };
  }

  createScript(input: { name: string; description?: string | null; code: string }): ScriptWithCode {
    const id = randomUUID();
    const versionId = randomUUID();
    const normalized = normalizeCode(input.code);
    const hash = hashCode(input.code);

    const tx = db.transaction(() => {
      db.prepare(
        'INSERT INTO script (id, name, description) VALUES (?, ?, ?)'
      ).run(id, input.name, input.description ?? null);

      db.prepare(
        'INSERT INTO script_version (id, scriptId, version, code, contentHash) VALUES (?, ?, 1, ?, ?)'
      ).run(versionId, id, normalized, hash);
    });
    tx();

    const script = this.getScript(id);
    if (!script) throw new Error('Failed to create script');
    return script;
  }

  updateScript(
    id: string,
    input: { name?: string; description?: string | null; code?: string }
  ): ScriptWithCode {
    const existing = db.prepare('SELECT * FROM script WHERE id = ?').get(id) as
      | ScriptRow
      | undefined;
    if (!existing) throw new Error(`Script ${id} not found`);

    const fields: string[] = [];
    const values: unknown[] = [];
    if (input.name !== undefined) {
      fields.push('name = ?');
      values.push(input.name);
    }
    if (input.description !== undefined) {
      fields.push('description = ?');
      values.push(input.description);
    }

    const tx = db.transaction(() => {
      if (input.code !== undefined) {
        const latest = this.getLatestVersion(id);
        const hash = hashCode(input.code);
        if (!latest || latest.contentHash !== hash) {
          const nextVersion = (latest?.version ?? 0) + 1;
          db.prepare(
            'INSERT INTO script_version (id, scriptId, version, code, contentHash) VALUES (?, ?, ?, ?, ?)'
          ).run(randomUUID(), id, nextVersion, normalizeCode(input.code), hash);
        }
      }

      if (fields.length > 0 || input.code !== undefined) {
        fields.push('updatedAt = CURRENT_TIMESTAMP');
        if (fields.length === 1) {
          // Only updatedAt changed — still a valid update (e.g. when code changed without metadata).
          db.prepare(`UPDATE script SET ${fields.join(', ')} WHERE id = ?`).run(id);
        } else {
          values.push(id);
          db.prepare(`UPDATE script SET ${fields.join(', ')} WHERE id = ?`).run(...values);
        }
      }
    });
    tx();

    const updated = this.getScript(id);
    if (!updated) throw new Error(`Script ${id} vanished after update`);
    return updated;
  }

  archiveScript(id: string): void {
    const result = db
      .prepare(
        'UPDATE script SET archivedAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND archivedAt IS NULL'
      )
      .run(id);
    if (result.changes === 0) {
      // Either not found or already archived — treat idempotently but verify existence.
      const exists = db.prepare('SELECT 1 FROM script WHERE id = ?').get(id);
      if (!exists) throw new Error(`Script ${id} not found`);
    }
  }

  unarchiveScript(id: string): void {
    const result = db
      .prepare(
        'UPDATE script SET archivedAt = NULL, updatedAt = CURRENT_TIMESTAMP WHERE id = ?'
      )
      .run(id);
    if (result.changes === 0) {
      throw new Error(`Script ${id} not found`);
    }
  }

  getLatestVersion(scriptId: string): ScriptVersionRow | null {
    const row = db
      .prepare(
        'SELECT * FROM script_version WHERE scriptId = ? ORDER BY version DESC LIMIT 1'
      )
      .get(scriptId) as ScriptVersionRow | undefined;
    return row ?? null;
  }

  getVersionByHash(hash: string): ScriptVersionRow[] {
    return db
      .prepare(
        `SELECT sv.*
         FROM script_version sv
         INNER JOIN script s ON s.id = sv.scriptId
         WHERE sv.contentHash = ? AND s.archivedAt IS NULL`
      )
      .all(hash) as ScriptVersionRow[];
  }

  getScriptNameById(scriptId: string): string | null {
    const row = db.prepare('SELECT name FROM script WHERE id = ?').get(scriptId) as
      | { name: string }
      | undefined;
    return row?.name ?? null;
  }
}

export const scriptService = new ScriptService();
