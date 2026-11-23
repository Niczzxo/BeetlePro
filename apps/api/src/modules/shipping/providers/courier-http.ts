import { Injectable } from '@nestjs/common';

/**
 * The HTTP seam for courier adapters.
 *
 * Courier HTTP lives behind this one injectable client, so unit
 * tests hand the adapters a test double and no test ever touches
 * a real courier (the same reason the Phase 3 gateway work kept
 * a configurable API base URL at the network boundary). The
 * production implementation is a thin wrapper over fetch that
 * JSON-encodes request bodies and parses JSON responses
 * defensively: a courier answering HTML or nothing yields a null
 * body, never a throw the adapter did not expect.
 */
export interface CourierHttpRequest {
  method: 'GET' | 'POST';
  url: string;
  headers?: Record<string, string>;
  /** JSON body for POSTs. */
  body?: unknown;
}

export interface CourierHttpResponse {
  status: number;
  /** Parsed JSON body, or null when the answer was not JSON. */
  body: unknown;
}

export abstract class CourierHttpClient {
  abstract request(
    input: CourierHttpRequest,
  ): Promise<CourierHttpResponse>;
}

@Injectable()
export class FetchCourierHttpClient extends CourierHttpClient {
  async request(
    input: CourierHttpRequest,
  ): Promise<CourierHttpResponse> {
    const response = await fetch(input.url, {
      method: input.method,
      headers: {
        ...(input.body !== undefined
          ? { 'content-type': 'application/json' }
          : {}),
        ...input.headers,
      },
      body:
        input.body !== undefined ? JSON.stringify(input.body) : undefined,
    });
    const body: unknown = await response.json().catch(() => null);
    return { status: response.status, body };
  }
}
