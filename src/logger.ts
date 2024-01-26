import type { Context, MiddlewareHandler } from "hono";

export const log = async (c: Context, message: string, metadata?: unknown) => {
  if (
    c.env.LOGFLARE_API_KEY === undefined ||
    c.env.LOGFLARE_SOURCE === undefined
  ) {
    console.log(message);
    return;
  }

  await fetch("https://api.logflare.app/logs", {
    method: "POST",
    headers: {
      "x-api-key": c.env.LOGFLARE_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({ source: c.env.LOGFLARE_SOURCE, message, metadata }),
  });
};

export const logger: MiddlewareHandler = async (c, next) => {
  const url = new URL(c.req.url);
  const incoming = `${c.req.method} ${url.pathname}`;
  const reqMetadata = {
    method: c.req.method,
    pathname: url.pathname,
    headers: Object.fromEntries(c.req.raw.headers),
  };
  await log(c, incoming, reqMetadata);

  await next();

  const outgoing = `${c.req.method} ${url.pathname} ${c.res.status}`;
  const resMetadata = {
    method: c.req.method,
    pathname: url.pathname,
    status: c.res.status,
    headers: Object.fromEntries(c.res.headers),
  };
  await log(c, outgoing, resMetadata);
};
