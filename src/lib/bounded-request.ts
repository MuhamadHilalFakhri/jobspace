export class RequestBodyTooLargeError extends Error {
  readonly statusCode = 413;

  constructor(maxBytes: number) {
    super(`Ukuran request melebihi batas ${maxBytes} byte.`);
    this.name = "RequestBodyTooLargeError";
  }
}

/** Rebuild a request from a stream capped before multipart/JSON parsing. */
export async function readBoundedRequest(
  request: Request,
  maxBytes: number,
): Promise<Request> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new RequestBodyTooLargeError(maxBytes);
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return new Request(request.url, {
      method: request.method,
      headers: request.headers,
    });
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new RequestBodyTooLargeError(maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body,
  });
}
