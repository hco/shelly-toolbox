import { ShellyAuthHelper } from '../auth/shellyAuth.js';
import type { DeviceOperationContext } from './types.js';

export interface DeviceScriptInfo {
  id: number;
  name: string;
  enable: boolean;
  running: boolean;
}

/**
 * Issue a Gen2 RPC call to the device, handling digest auth, errors, and timeouts.
 * Returns the parsed `result` field; throws on any failure.
 *
 * Uses the canonical "send → 401 → retry with auth" pattern so we never have to
 * issue a separate auth-challenge request: the actual method body is what elicits
 * the 401 from the device.
 */
async function gen2Rpc<T = unknown>(
  ctx: DeviceOperationContext,
  method: string,
  params?: Record<string, unknown>
): Promise<T> {
  const uri = '/rpc';
  const url = `http://${ctx.device.ipAddress}${uri}`;
  const body = { id: 1, method, params };

  let response = await ctx.httpClient.post(url, body, {}, 10000);

  if (response.status === 401) {
    if (ctx.password === null) {
      throw new Error(
        `Device ${ctx.device.name} requires auth but no password is configured`
      );
    }
    const wwwAuth = response.headers.get('WWW-Authenticate');
    if (!wwwAuth) {
      throw new Error(
        `Auth required by ${ctx.device.name} but no WWW-Authenticate header in 401 response`
      );
    }
    const nonceMatch = wwwAuth.match(/nonce="([^"]+)"/);
    const realmMatch = wwwAuth.match(/realm="([^"]+)"/);
    if (!nonceMatch || !realmMatch) {
      throw new Error(`Could not parse digest challenge from ${ctx.device.name}`);
    }

    const authHeader = ShellyAuthHelper.createDigestAuthHeader({
      username: 'admin',
      realm: realmMatch[1],
      nonce: nonceMatch[1],
      uri,
      password: ctx.password,
      method: 'POST',
    });

    response = await ctx.httpClient.post(url, body, { Authorization: authHeader }, 10000);
  }

  if (!response.ok) {
    throw new Error(`RPC ${method} failed: ${response.status} ${response.text ?? ''}`);
  }

  const data = response.data as { error?: { message?: string }; result?: T };
  if (data?.error) {
    throw new Error(`RPC ${method} error: ${data.error.message ?? JSON.stringify(data.error)}`);
  }

  return data.result as T;
}

export async function listDeviceScripts(
  ctx: DeviceOperationContext
): Promise<DeviceScriptInfo[]> {
  const result = await gen2Rpc<{ scripts: DeviceScriptInfo[] }>(ctx, 'Script.List');
  return result.scripts;
}

export async function getDeviceScriptCode(
  ctx: DeviceOperationContext,
  id: number
): Promise<string> {
  const result = await gen2Rpc<{ data: string; left?: number }>(ctx, 'Script.GetCode', { id });
  return result.data;
}

export async function createDeviceScript(
  ctx: DeviceOperationContext,
  name: string
): Promise<number> {
  const result = await gen2Rpc<{ id: number }>(ctx, 'Script.Create', { name });
  return result.id;
}

export async function putDeviceScriptCode(
  ctx: DeviceOperationContext,
  id: number,
  code: string
): Promise<void> {
  // append=false on the first chunk clears the existing script body; since our scripts are
  // small we send the whole thing in a single call.
  await gen2Rpc(ctx, 'Script.PutCode', { id, code, append: false });
}

export async function setDeviceScriptConfig(
  ctx: DeviceOperationContext,
  id: number,
  config: { name?: string; enable?: boolean }
): Promise<void> {
  await gen2Rpc(ctx, 'Script.SetConfig', { id, config });
}

export async function startDeviceScript(
  ctx: DeviceOperationContext,
  id: number
): Promise<void> {
  await gen2Rpc(ctx, 'Script.Start', { id });
}

export async function stopDeviceScript(
  ctx: DeviceOperationContext,
  id: number
): Promise<void> {
  await gen2Rpc(ctx, 'Script.Stop', { id });
}

export async function deleteDeviceScript(
  ctx: DeviceOperationContext,
  id: number
): Promise<void> {
  await gen2Rpc(ctx, 'Script.Delete', { id });
}
