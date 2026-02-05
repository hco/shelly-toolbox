import { db, auth } from '../auth.js';

class AuthService {
  private hasUsersCache: boolean | null = null;

  /**
   * Check if we're in setup mode (no users exist)
   */
  isSetupMode(): boolean {
    if (this.hasUsersCache === null) {
      this.refreshUserCache();
    }
    return !this.hasUsersCache;
  }

  /**
   * Refresh the user cache from database
   */
  refreshUserCache(): void {
    try {
      const result = db.prepare('SELECT COUNT(*) as count FROM user').get() as { count: number };
      this.hasUsersCache = result.count > 0;
    } catch {
      // Table doesn't exist yet (before migration)
      this.hasUsersCache = false;
    }
  }

  /**
   * Create a new user
   */
  async createUser(email: string, password: string, name: string): Promise<{ id: string; email: string; name: string }> {
    const response = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name,
      },
    });

    if (!response.user) {
      throw new Error('Failed to create user');
    }

    this.refreshUserCache();

    return {
      id: response.user.id,
      email: response.user.email,
      name: response.user.name,
    };
  }

  /**
   * List all users
   */
  listUsers(): Array<{ id: string; email: string; name: string; createdAt: Date }> {
    try {
      const users = db.prepare('SELECT id, email, name, createdAt FROM user ORDER BY createdAt DESC').all() as Array<{
        id: string;
        email: string;
        name: string;
        createdAt: string;
      }>;

      return users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        createdAt: new Date(u.createdAt),
      }));
    } catch {
      return [];
    }
  }

  /**
   * Delete a user by ID
   */
  deleteUser(userId: string): void {
    // Delete associated sessions and accounts first
    db.prepare('DELETE FROM session WHERE userId = ?').run(userId);
    db.prepare('DELETE FROM account WHERE userId = ?').run(userId);
    db.prepare('DELETE FROM user WHERE id = ?').run(userId);

    this.refreshUserCache();
  }

  /**
   * Get user count
   */
  getUserCount(): number {
    try {
      const result = db.prepare('SELECT COUNT(*) as count FROM user').get() as { count: number };
      return result.count;
    } catch {
      return 0;
    }
  }
}

export const authService = new AuthService();
