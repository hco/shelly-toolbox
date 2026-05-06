import { betterAuth } from 'better-auth';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { SERVER_PORT, VITE_DEV_PORT } from '@/shared/constants.js';

// Ensure data directory exists
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'database.sqlite');

export const db = new Database(dbPath);

// Run migrations on startup
function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      emailVerified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expiresAt DATETIME NOT NULL,
      ipAddress TEXT,
      userAgent TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS account (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      accountId TEXT NOT NULL,
      providerId TEXT NOT NULL,
      accessToken TEXT,
      refreshToken TEXT,
      accessTokenExpiresAt DATETIME,
      refreshTokenExpiresAt DATETIME,
      scope TEXT,
      idToken TEXT,
      password TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS verification (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      expiresAt DATETIME NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_session_userId ON session(userId);
    CREATE INDEX IF NOT EXISTS idx_session_token ON session(token);
    CREATE INDEX IF NOT EXISTS idx_account_userId ON account(userId);
    CREATE INDEX IF NOT EXISTS idx_user_email ON user(email);

    CREATE TABLE IF NOT EXISTS script (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      archivedAt DATETIME,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS script_version (
      id TEXT PRIMARY KEY,
      scriptId TEXT NOT NULL,
      version INTEGER NOT NULL,
      code TEXT NOT NULL,
      contentHash TEXT NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (scriptId) REFERENCES script(id) ON DELETE CASCADE,
      UNIQUE (scriptId, version)
    );

    CREATE INDEX IF NOT EXISTS idx_script_version_scriptId ON script_version(scriptId);
    CREATE INDEX IF NOT EXISTS idx_script_version_contentHash ON script_version(contentHash);
    CREATE INDEX IF NOT EXISTS idx_script_archivedAt ON script(archivedAt);
  `);
}

runMigrations();

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_BASE_URL || `http://localhost:${SERVER_PORT}`,
  database: db,
  emailAndPassword: {
    enabled: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days in seconds
    updateAge: 60 * 60 * 24, // Update session age daily
  },
  trustedOrigins: [`http://localhost:${SERVER_PORT}`, `http://localhost:${VITE_DEV_PORT}`],
});

export type Session = typeof auth.$Infer.Session.session;
export type User = typeof auth.$Infer.Session.user;
