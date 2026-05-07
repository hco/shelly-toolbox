import { createHash } from 'crypto';
import type { Device } from '@/shared/types.js';
import type { ShellyHttpClient } from '../http/ShellyHttpClient.js';

export interface DigestAuthParams {
  username: string;
  realm: string;
  nonce: string;
  uri: string;
  password: string;
  method: 'GET' | 'POST';
}

export class ShellyAuthHelper {
  /**
   * Create Basic Auth header for Gen1 devices
   */
  static createBasicAuthHeader(password: string | null): string {
    if (password === null) {
      throw new Error('Cannot create Basic auth header without a password');
    }
    const credentials = Buffer.from(`admin:${password}`).toString('base64');
    return `Basic ${credentials}`;
  }

  /**
   * Create Digest Auth header for Gen2 devices
   */
  static createDigestAuthHeader(params: DigestAuthParams): string {
    const { username, realm, nonce, uri, password, method } = params;
    const nc = '00000001';
    const cnonce = Math.random().toString(36).substring(2, 10);

    // HA1 = SHA256(username:realm:password)
    const ha1 = createHash('sha256')
      .update(`${username}:${realm}:${password}`)
      .digest('hex');

    // HA2 = SHA256(method:uri)
    const ha2 = createHash('sha256')
      .update(`${method}:${uri}`)
      .digest('hex');

    // response = SHA256(HA1:nonce:nc:cnonce:qop:HA2)
    const digestResponse = createHash('sha256')
      .update(`${ha1}:${nonce}:${nc}:${cnonce}:auth:${ha2}`)
      .digest('hex');

    return `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", nc=${nc}, cnonce="${cnonce}", qop=auth, response="${digestResponse}", algorithm=SHA-256`;
  }

  /**
   * Fetch Gen2 auth challenge (nonce and realm) from WWW-Authenticate header
   */
  static async fetchGen2AuthChallenge(
    httpClient: ShellyHttpClient,
    ipAddress: string,
    uri: string,
    method: 'GET' | 'POST'
  ): Promise<{ nonce: string; realm: string } | null> {
    try {
      const response = await httpClient.request({
        url: `http://${ipAddress}${uri}`,
        method,
      });

      // We expect a 401 with WWW-Authenticate header
      if (response.status !== 401) {
        return null;
      }

      const wwwAuth = response.headers.get('WWW-Authenticate');
      if (!wwwAuth) {
        return null;
      }

      // Parse digest auth parameters
      const nonceMatch = wwwAuth.match(/nonce="([^"]+)"/);
      const realmMatch = wwwAuth.match(/realm="([^"]+)"/);

      if (!nonceMatch || !realmMatch) {
        return null;
      }

      return {
        nonce: nonceMatch[1],
        realm: realmMatch[1],
      };
    } catch {
      return null;
    }
  }

  /**
   * Get authenticated headers for a device request
   * Automatically handles Gen1 (Basic) vs Gen2 (Digest) auth
   */
  static async getAuthHeaders(
    httpClient: ShellyHttpClient,
    device: Device,
    password: string | null,
    uri: string,
    method: 'GET' | 'POST' = 'GET'
  ): Promise<Record<string, string> | null> {
    if (password === null) {
      return null;
    }
    if (device.gen >= 2) {
      // Gen2: Fetch challenge and create digest auth header
      const challenge = await this.fetchGen2AuthChallenge(
        httpClient,
        device.ipAddress,
        uri,
        method
      );

      if (!challenge) {
        return null;
      }

      const authHeader = this.createDigestAuthHeader({
        username: 'admin',
        realm: challenge.realm,
        nonce: challenge.nonce,
        uri,
        password,
        method,
      });

      return { Authorization: authHeader };
    } else {
      // Gen1: Basic auth
      return { Authorization: this.createBasicAuthHeader(password) };
    }
  }

  /**
   * Get Gen2 auth header for a specific URI (legacy compatibility method)
   * @deprecated Use getAuthHeaders instead
   */
  static async getGen2AuthHeader(
    httpClient: ShellyHttpClient,
    ipAddress: string,
    password: string,
    uri: string
  ): Promise<string | null> {
    const challenge = await this.fetchGen2AuthChallenge(
      httpClient,
      ipAddress,
      uri,
      'GET'
    );

    if (!challenge) {
      return null;
    }

    return this.createDigestAuthHeader({
      username: 'admin',
      realm: challenge.realm,
      nonce: challenge.nonce,
      uri,
      password,
      method: 'GET',
    });
  }

  /**
   * Get Gen2 auth header for POST requests (legacy compatibility method)
   * @deprecated Use getAuthHeaders instead
   */
  static async getGen2PostAuthHeader(
    httpClient: ShellyHttpClient,
    ipAddress: string,
    password: string,
    uri: string
  ): Promise<string | null> {
    const challenge = await this.fetchGen2AuthChallenge(
      httpClient,
      ipAddress,
      uri,
      'POST'
    );

    if (!challenge) {
      return null;
    }

    return this.createDigestAuthHeader({
      username: 'admin',
      realm: challenge.realm,
      nonce: challenge.nonce,
      uri,
      password,
      method: 'POST',
    });
  }
}
