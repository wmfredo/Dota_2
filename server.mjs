import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DISCORD_API = "https://discord.com/api/v10";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const STATE_TTL_SECONDS = 10 * 60;
const sessions = new Map();
const publicExtensions = new Set([".html", ".css", ".js", ".jpeg", ".jpg", ".png", ".svg", ".webp", ".ico"]);
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

const config = {
  clientId: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  guildId: process.env.DISCORD_GUILD_ID,
  publicUrl: process.env.PUBLIC_URL,
  port: Number(process.env.PORT || 3000)
};

function validateConfig() {
  const missing = ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "DISCORD_GUILD_ID", "PUBLIC_URL"]
    .filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Falta configurar: ${missing.join(", ")}.`);
  }
  const publicUrl = new URL(config.publicUrl);
  if (publicUrl.protocol !== "https:" || publicUrl.pathname !== "/" || publicUrl.search || publicUrl.hash) {
    throw new Error("PUBLIC_URL debe ser el origen HTTPS del sitio, por ejemplo https://ratoger.com.");
  }
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error("PORT debe ser un puerto válido.");
  }
  config.publicUrl = publicUrl.origin;
}

function send(response, status, body, contentType = "text/html; charset=utf-8", headers = {}) {
  response.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self' https:; form-action 'self'; base-uri 'self'; frame-ancestors 'none'`,
    ...headers
  });
  response.end(body);
}

function redirect(response, location, status = 302, headers = {}) {
  response.writeHead(status, {
    Location: location,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    ...headers
  });
  response.end();
}

function cookie(name, value, maxAge, route) {
  return `${name}=${value}; Path=${route}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function getCookie(request, name) {
  const cookies = request.headers.cookie || "";
  const entry = cookies.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return entry ? entry.slice(name.length + 1) : "";
}

function sameSecret(left, right) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function randomToken() {
  return randomBytes(32).toString("hex");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character]);
}

function renderPage(title, content, status = 200) {
  const imageUrl = `${config.publicUrl}/assets/Clan_Ratoger.jpeg`;
  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)} | RATOGER</title>
    <style>
      :root { color-scheme: dark; --text: #f2f2f2; --muted: #aaa; --line: #444; --accent: #ff7844; }
      * { box-sizing: border-box; }
      body { position: relative; isolation: isolate; margin: 0; min-height: 100vh; background: #000; color: var(--text); font: 16px/1.5 system-ui, sans-serif; }
      body::before, body::after { position: fixed; inset: 0; z-index: -2; pointer-events: none; content: ""; }
      body::before { inset: -18px; background: url("${imageUrl}") center / cover no-repeat; filter: blur(14px) brightness(.4); transform: scale(1.04); }
      body::after { z-index: -1; background: rgba(0, 0, 0, .58); }
      a { color: inherit; }
      a:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }
      .member-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; width: min(100% - 40px, 900px); margin: 0 auto; padding: 20px 0; }
      .brand { font-weight: 800; letter-spacing: .2em; text-decoration: none; }
      .account { display: flex; align-items: center; gap: 18px; color: var(--muted); font-size: 14px; }
      .account form { margin: 0; }
      .text-button { padding: 0; border: 0; background: none; color: var(--text); cursor: pointer; font: inherit; text-decoration: underline; }
      .panel { width: min(100% - 40px, 760px); margin: clamp(90px, 18vh, 180px) auto 60px; padding: clamp(24px, 6vw, 52px); border: 1px solid var(--line); background: rgba(0, 0, 0, .72); }
      .member-header + .panel { margin-top: clamp(48px, 12vh, 120px); }
      h1 { margin: 0 0 24px; font-size: clamp(36px, 6vw, 58px); line-height: 1.08; }
      p { margin: 0 0 18px; }
      .eyebrow, .small { color: var(--muted); font-size: 13px; }
      .button { display: inline-block; margin: 8px 0 12px; padding: 12px 18px; border: 1px solid var(--accent); background: rgba(255, 120, 68, .16); color: var(--text); font-weight: 700; text-decoration: none; }
      .button:hover { background: rgba(255, 120, 68, .34); }
      .button.secondary { border-color: var(--line); background: rgba(0, 0, 0, .3); }
      .notice { margin: 24px 0; color: #ff9878; }
      .small { margin-top: 20px; }
      @media (max-width: 520px) {
        .member-header { width: calc(100% - 28px); align-items: flex-start; }
        .account { align-items: flex-end; flex-direction: column; gap: 4px; text-align: right; }
        .panel { width: calc(100% - 28px); }
      }
    </style>
  </head>
  <body>${content}</body>
</html>`;
  send(response, status, html);
}

function renderLoginPage(response, message = "", status = 200) {
  const notice = message ? `<p class="notice" role="status">${escapeHtml(message)}</p>` : "";
  renderPage("Acceso miembros", `
    <main class="panel">
      <p class="eyebrow">Comunidad RATOGER</p>
      <h1>Acceso miembros</h1>
      <p>Inicia sesión con Discord para comprobar que formas parte de nuestro servidor.</p>
      ${notice}
      <a class="button" href="/auth/login">Entrar con Discord</a>
      <p class="small"><a href="/">Volver a la página principal</a></p>
    </main>`, status);
}

function renderMemberPage(response, session) {
  const accountHeader = `
    <header class="member-header">
      <a class="brand" href="/">RATOGER</a>
      <div class="account">
        <span>${escapeHtml(session.displayName)}</span>
        <form action="/auth/logout" method="post"><button class="text-button" type="submit">Cerrar sesión</button></form>
      </div>
    </header>`;

  renderPage("Área de miembros", `${accountHeader}
    <main class="panel">
      <p class="eyebrow">Área privada</p>
      <h1>¡Bienvenido, ${escapeHtml(session.displayName)}!</h1>
      <p>Has iniciado sesión con Discord y tu pertenencia al servidor de RATOGER está verificada.</p>
      <a class="button" href="/miembros/listado">Ir a Miembros</a>
    </main>`);
}

function renderMembersPage(response, session) {
  renderPage("Miembros", `
    <header class="member-header">
      <a class="brand" href="/">RATOGER</a>
      <div class="account">
        <span>${escapeHtml(session.displayName)}</span>
        <form action="/auth/logout" method="post"><button class="text-button" type="submit">Cerrar sesión</button></form>
      </div>
    </header>
    <main class="panel">
      <p class="eyebrow">Área privada</p>
      <h1>Miembros</h1>
      <p>El listado de miembros se incorporará más adelante.</p>
      <p class="small">Para mostrar a todos los miembros habrá que añadir un bot de Discord.</p>
      <a class="button secondary" href="/miembros">Volver al área de miembros</a>
    </main>`);
}

function cleanExpiredSessions() {
  const now = Date.now();
  for (const [sessionId, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(sessionId);
  }
}

function getSession(request) {
  cleanExpiredSessions();
  const sessionId = getCookie(request, "ratoger_session");
  if (!/^[a-f0-9]{64}$/.test(sessionId)) return null;
  const session = sessions.get(sessionId);
  return session && session.expiresAt > Date.now() ? session : null;
}

async function discordRequest(resource, accessToken) {
  return fetch(`${DISCORD_API}${resource}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10000)
  });
}

async function startLogin(response) {
  const state = randomToken();
  const authorizeUrl = new URL(`${DISCORD_API}/oauth2/authorize`);
  authorizeUrl.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: `${config.publicUrl}/auth/callback`,
    response_type: "code",
    scope: "identify guilds.members.read",
    state
  }).toString();
  redirect(response, authorizeUrl.toString(), 302, {
    "Set-Cookie": cookie("ratoger_oauth_state", state, STATE_TTL_SECONDS, "/auth/callback")
  });
}

async function finishLogin(request, response, url) {
  const state = url.searchParams.get("state") || "";
  const stateCookie = getCookie(request, "ratoger_oauth_state");
  if (!state || !sameSecret(state, stateCookie)) {
    response.setHeader("Set-Cookie", cookie("ratoger_oauth_state", "", 0, "/auth/callback"));
    return renderLoginPage(response, "La solicitud de acceso ha caducado o no es válida. Inténtalo de nuevo.", 400);
  }
  if (url.searchParams.has("error")) {
    response.setHeader("Set-Cookie", cookie("ratoger_oauth_state", "", 0, "/auth/callback"));
    return renderLoginPage(response, "No se autorizó el acceso con Discord.", 401);
  }

  const code = url.searchParams.get("code");
  if (!code) {
    response.setHeader("Set-Cookie", cookie("ratoger_oauth_state", "", 0, "/auth/callback"));
    return renderLoginPage(response, "Discord no devolvió un código de acceso válido.", 400);
  }

  const tokenResponse = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: `${config.publicUrl}/auth/callback`
    }),
    signal: AbortSignal.timeout(10000)
  });
  if (!tokenResponse.ok) {
    throw new Error(`Discord rechazó el intercambio OAuth (${tokenResponse.status}).`);
  }
  const tokenData = await tokenResponse.json();
  if (typeof tokenData.access_token !== "string") {
    throw new Error("Discord no devolvió un token de acceso.");
  }

  const userResponse = await discordRequest("/users/@me", tokenData.access_token);
  if (!userResponse.ok) {
    throw new Error(`Discord no pudo identificar al usuario (${userResponse.status}).`);
  }
  const user = await userResponse.json();
  if (typeof user.id !== "string" || typeof user.username !== "string") {
    throw new Error("Discord devolvió un perfil de usuario no válido.");
  }

  const memberResponse = await discordRequest(
    `/users/@me/guilds/${encodeURIComponent(config.guildId)}/member`,
    tokenData.access_token
  );
  if (memberResponse.status === 404) {
    response.setHeader("Set-Cookie", cookie("ratoger_oauth_state", "", 0, "/auth/callback"));
    return renderLoginPage(response, "Tu cuenta de Discord no pertenece al servidor de RATOGER.", 403);
  }
  if (!memberResponse.ok) {
    throw new Error(`Discord no pudo comprobar la pertenencia al servidor (${memberResponse.status}).`);
  }
  const member = await memberResponse.json();

  cleanExpiredSessions();
  if (sessions.size >= 1000) {
    throw new Error("Se alcanzó el límite de sesiones simultáneas.");
  }
  const sessionId = randomToken();
  sessions.set(sessionId, {
    discordId: user.id,
    username: user.username,
    displayName: typeof user.global_name === "string" && user.global_name ? user.global_name : user.username,
    roles: Array.isArray(member.roles) ? member.roles : [],
    expiresAt: Date.now() + SESSION_TTL_MS
  });

  redirect(response, "/miembros", 302, {
    "Set-Cookie": [
      cookie("ratoger_session", sessionId, SESSION_TTL_MS / 1000, "/"),
      cookie("ratoger_oauth_state", "", 0, "/auth/callback")
    ]
  });
}

function logout(request, response) {
  if (request.headers.origin !== config.publicUrl) {
    return send(response, 403, "<!doctype html><html lang=\"es\"><meta charset=\"utf-8\"><title>Solicitud no válida</title><h1>Solicitud no válida</h1>");
  }

  const sessionId = getCookie(request, "ratoger_session");
  if (/^[a-f0-9]{64}$/.test(sessionId)) sessions.delete(sessionId);
  redirect(response, "/miembros", 303, {
    "Set-Cookie": cookie("ratoger_session", "", 0, "/")
  });
}

async function serveStatic(response, pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return send(response, 400, "Solicitud no válida", "text/plain; charset=utf-8");
  }

  const relativePath = decodedPath === "/"
    ? "index.html"
    : decodedPath.endsWith("/")
      ? `${decodedPath.slice(1)}index.html`
      : decodedPath.slice(1);
  const segments = relativePath.split(/[\\/]/);
  if (segments.some((segment) => !segment || segment.startsWith(".")) || segments.includes("..")) {
    return send(response, 404, "No encontrado", "text/plain; charset=utf-8");
  }

  const filePath = path.resolve(ROOT, relativePath);
  if (!filePath.startsWith(`${ROOT}${path.sep}`) || !publicExtensions.has(path.extname(filePath).toLowerCase())) {
    return send(response, 404, "No encontrado", "text/plain; charset=utf-8");
  }

  try {
    const fileInfo = await stat(filePath);
    if (!fileInfo.isFile()) return send(response, 404, "No encontrado", "text/plain; charset=utf-8");
    const content = await readFile(filePath);
    send(response, 200, content, contentTypes[path.extname(filePath).toLowerCase()]);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EACCES") {
      return send(response, 404, "No encontrado", "text/plain; charset=utf-8");
    }
    throw error;
  }
}

async function handleRequest(request, response) {
  try {
    if (request.method !== "GET" && request.method !== "POST") {
      return send(response, 405, "Método no permitido", "text/plain; charset=utf-8", { Allow: "GET, POST" });
    }

    const url = new URL(request.url, config.publicUrl);
    if (url.pathname === "/auth/login" && request.method === "GET") return await startLogin(response);
    if (url.pathname === "/auth/callback" && request.method === "GET") return await finishLogin(request, response, url);
    if (url.pathname === "/auth/logout" && request.method === "POST") return logout(request, response);

    if (url.pathname === "/miembros" || url.pathname === "/miembros/listado") {
      if (request.method !== "GET") {
        return send(response, 405, "Método no permitido", "text/plain; charset=utf-8", { Allow: "GET" });
      }
      const session = getSession(request);
      if (!session) return renderLoginPage(response);
      return url.pathname === "/miembros/listado"
        ? renderMembersPage(response, session)
        : renderMemberPage(response, session);
    }

    if (request.method !== "GET") {
      return send(response, 405, "Método no permitido", "text/plain; charset=utf-8", { Allow: "GET" });
    }
    return await serveStatic(response, url.pathname);
  } catch (error) {
    console.error("Error en el servidor RATOGER:", error);
    if (!response.headersSent) {
      send(response, 500, "<!doctype html><html lang=\"es\"><meta charset=\"utf-8\"><title>Error</title><h1>No se pudo completar la solicitud</h1><p>Inténtalo de nuevo más tarde.</p>");
    } else {
      response.destroy();
    }
  }
}

try {
  validateConfig();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} 

if (process.exitCode !== 1) {
  const server = createServer((request, response) => {
    void handleRequest(request, response);
  });
  server.listen(config.port, "127.0.0.1", () => {
    console.log(`Servidor RATOGER escuchando en http://127.0.0.1:${config.port}`);
  });
}
