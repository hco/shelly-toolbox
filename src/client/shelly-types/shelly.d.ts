// Shelly Gen2+ mJS scripting API — hand-curated type definitions.
// Loaded into Monaco via monaco.languages.typescript.javascriptDefaults.addExtraLib().
// Based on https://shelly-api-docs.shelly.cloud/gen2/Scripts/ShellyScriptLanguageFeatures/.

declare namespace Shelly {
  type RpcCallback<T = unknown> = (
    result: T | null,
    errorCode: number,
    errorMessage: string,
    userdata?: unknown,
  ) => void;

  /**
   * Issue an RPC call against the device's own RPC layer.
   * Method names are the same as the HTTP RPC (e.g. "Switch.Set", "Shelly.GetStatus").
   */
  function call<T = unknown>(
    method: string,
    params?: object | string | null,
    callback?: RpcCallback<T>,
    userdata?: unknown,
  ): void;

  /**
   * Subscribe to device events (component events like "btn_down", "shortpush", "cover_close", ...).
   * Returns a subscription handle; pass it to `removeEventHandler` to detach.
   */
  function addEventHandler(
    callback: (eventData: ShellyEvent, userdata?: unknown) => void,
    userdata?: unknown,
  ): number;

  function removeEventHandler(handle: number): boolean;

  /**
   * Subscribe to status changes for every component.
   */
  function addStatusHandler(
    callback: (statusData: ShellyStatus, userdata?: unknown) => void,
    userdata?: unknown,
  ): number;

  function removeStatusHandler(handle: number): boolean;

  /** Emit a custom event that other scripts / cloud can subscribe to. */
  function emitEvent(name: string, data?: unknown): void;

  /** Current configuration of a component (e.g. "switch:0"). */
  function getComponentConfig(key: string, rpcSource?: string): object;

  /** Current status of a component (e.g. "switch:0"). */
  function getComponentStatus(key: string, rpcSource?: string): object;

  /** Full device information (model, id, firmware version, etc.). */
  function getDeviceInfo(): DeviceInfo;

  /** The id of the running script, as known by Script.List. */
  function getCurrentScriptId(): number;

  /** Get UptimeMs - milliseconds since last boot. Older firmwares may not expose this. */
  function getUptimeMs(): number;

  interface ShellyEvent {
    component: string;
    name: string;
    id?: number;
    now: number;
    info: Record<string, unknown>;
  }

  interface ShellyStatus {
    component: string;
    name?: string;
    id?: number;
    delta: Record<string, unknown>;
  }

  interface DeviceInfo {
    id: string;
    mac: string;
    model: string;
    gen: number;
    fw_id: string;
    ver: string;
    app: string;
    auth_en: boolean;
    auth_domain: string | null;
    [key: string]: unknown;
  }
}

declare namespace Timer {
  /**
   * Schedule a callback.
   * @param periodMs interval in milliseconds (minimum 10ms).
   * @param repeat if true, fire every `periodMs`; if false, fire once.
   * @returns a handle that can be passed to `Timer.clear()`.
   */
  function set(
    periodMs: number,
    repeat: boolean,
    callback: (userdata?: unknown) => void,
    userdata?: unknown,
  ): number;

  /** Cancel a scheduled timer by handle. */
  function clear(handle: number): boolean;

  /** Current seconds since epoch (UTC). Only valid after NTP sync. */
  function now(): number;
}

declare namespace MQTT {
  type MqttCallback = (
    topic: string,
    message: string,
    userdata?: unknown,
  ) => void;

  /** True if the MQTT client is connected to the broker. */
  function isConnected(): boolean;

  function publish(
    topic: string,
    message: string,
    qos?: 0 | 1 | 2,
    retain?: boolean,
  ): boolean;

  function subscribe(topic: string, callback: MqttCallback, userdata?: unknown): void;

  function unsubscribe(topic: string): boolean;

  /** Install a handler that fires whenever the client (re)connects to the broker. */
  function setConnectHandler(handler: () => void): void;

  /** Install a handler that fires whenever the client disconnects. */
  function setDisconnectHandler(handler: () => void): void;
}

declare namespace HTTP {
  interface HttpRequest {
    url: string;
    /** HTTP headers to send with the request. */
    headers?: Record<string, string>;
    /** Request body (string or object which will be JSON-encoded). */
    body?: string | object;
    /** Timeout in seconds. */
    timeout?: number;
    /** Set to true to skip TLS verification (not recommended). */
    ssl_ca?: string;
  }

  interface HttpResponse {
    code: number;
    message: string;
    headers: Record<string, string>;
    body: string;
    body_b64?: string;
  }

  type HttpCallback = (
    response: HttpResponse | null,
    errorCode: number,
    errorMessage: string,
    userdata?: unknown,
  ) => void;

  /** Synchronous GET. Blocks the script until the response arrives. */
  function GET(request: HttpRequest): HttpResponse;

  /** Synchronous POST. */
  function POST(request: HttpRequest): HttpResponse;

  /** Asynchronous request. */
  function Request(request: HttpRequest & { method?: string }, callback: HttpCallback, userdata?: unknown): void;
}

declare namespace BLE {
  namespace Scanner {
    type ScanResult = {
      addr: string;
      addr_type: number;
      advData: string;
      scanRsp: string;
      rssi: number;
    };

    type ScanCallback = (event: number, result: ScanResult | null, userdata?: unknown) => void;

    const SCAN_START: number;
    const SCAN_STOP: number;
    const SCAN_RESULT: number;

    function Start(options?: { duration_ms?: number; active?: boolean; interval_ms?: number; window_ms?: number }, userdata?: unknown): boolean;
    function Stop(): boolean;
    function Subscribe(callback: ScanCallback, userdata?: unknown): number;
    function isRunning(): boolean;
  }
}

declare namespace Virtual {
  /** Get the status/value of a Virtual component (e.g. "boolean:200"). */
  function getHandle(key: string): {
    getValue<T = unknown>(): T;
    setValue(value: unknown): boolean;
    on(eventName: string, callback: (value: unknown) => void): void;
  };
}

/** Print to the script console (also piped to /debug/log). */
declare function print(...args: unknown[]): void;

/** `die(message)` terminates the script immediately. */
declare function die(message?: string): never;

/** Same as JavaScript's built-in atob/btoa — available in mJS. */
declare function atob(data: string): string;
declare function btoa(data: string): string;

/** mJS chr/chr_code helpers for byte-level string handling. */
declare function chr(code: number): string;
