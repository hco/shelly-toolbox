export interface HttpRequestConfig {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
  signal?: AbortSignal; // For external cancellation
}

export interface HttpResponse<T = unknown> {
  ok: boolean;
  status: number;
  statusText: string;
  data?: T;
  text?: string;
  headers: Headers;
}

export class ShellyHttpClient {
  private defaultTimeout = 5000;

  async request<T = unknown>(config: HttpRequestConfig): Promise<HttpResponse<T>> {
    const timeout = config.timeout ?? this.defaultTimeout;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // Use external signal if provided, otherwise use our controller
      const signal = config.signal ?? controller.signal;

      const response = await fetch(config.url, {
        method: config.method ?? 'GET',
        headers: config.headers,
        body: config.body,
        signal,
        redirect: 'manual', // Preserve manual redirect behavior from original code
      });

      clearTimeout(timeoutId);

      // Try to parse response
      let data: T | undefined;

      const contentType = response.headers.get('content-type');
      const responseText = await response.text();
      const text: string | undefined = responseText;

      // Try to parse as JSON if content-type suggests it or if it looks like JSON
      if (contentType?.includes('application/json') ||
          (responseText.startsWith('{') || responseText.startsWith('['))) {
        try {
          data = JSON.parse(responseText) as T;
        } catch {
          // If JSON parsing fails, data remains undefined and text is available
        }
      }

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        data,
        text,
        headers: response.headers,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      // Re-throw the error for caller to handle
      throw error;
    }
  }

  async get<T = unknown>(
    url: string,
    headers?: Record<string, string>,
    timeout?: number
  ): Promise<HttpResponse<T>> {
    return this.request<T>({
      url,
      method: 'GET',
      headers,
      timeout,
    });
  }

  async post<T = unknown>(
    url: string,
    body: unknown,
    headers?: Record<string, string>,
    timeout?: number
  ): Promise<HttpResponse<T>> {
    const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
    const contentTypeHeaders = {
      'Content-Type': 'application/json',
      ...headers,
    };

    return this.request<T>({
      url,
      method: 'POST',
      headers: contentTypeHeaders,
      body: bodyString,
      timeout,
    });
  }
}
