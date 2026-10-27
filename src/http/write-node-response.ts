import type { ServerResponse } from "node:http";

/** Write a web-standard `Response` to a Node `ServerResponse` (for OAuth challenges / metadata). */
export async function writeWebResponse(res: ServerResponse, response: Response): Promise<void> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    headers[name] = value;
  });
  res.writeHead(response.status, headers);
  if (response.body === null) {
    res.end();
    return;
  }
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value !== undefined) {
        res.write(value);
      }
    }
  } finally {
    res.end();
  }
}
