const { app } = require("@azure/functions");
const { BlobServiceClient } = require("@azure/storage-blob");
const { DefaultAzureCredential } = require("@azure/identity");
const { Pool } = require("pg");
const { rootHtml: redesignedRootHtml } = require("./rootHtml");

const CONTAINER_GROUP_MAP = {
  team1: "READER_GROUP_TEAM1",
  team2: "READER_GROUP_TEAM2",
  team3: "READER_GROUP_TEAM3",
};

const CONTAINER_WRITE_GROUP_MAP = {
  team1: "WRITER_GROUP_TEAM1",
  team2: "WRITER_GROUP_TEAM2",
  team3: "WRITER_GROUP_TEAM3",
};

const VALID_CONTAINERS = Object.keys(CONTAINER_GROUP_MAP);
const DASHBOARD_CACHE_TTL_MS = 60 * 1000;
const FAVORITES_TABLE_SQL = `
create extension if not exists pgcrypto;
create table if not exists user_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  container_name text not null,
  blob_path text not null,
  dashboard_name text not null,
  dashboard_url text not null,
  created_at timestamptz not null default now(),
  unique (user_id, container_name, blob_path)
);
`;

let dashboardCache = null;
let pool = null;
let favoritesTableReady = false;

function displayNameFromContainer(containerName) {
  const match = containerName.match(/^team(\d+)$/i);
  if (match) return `Team ${match[1]}`;
  return containerName
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function displayNameFromPath(path) {
  const fileName = path.split("/").pop() || path;
  return fileName;
}

function formatInitials(nameOrEmail) {
  const clean = (nameOrEmail || "Dashboard User").trim();
  const name = clean.includes("@") ? clean.split("@")[0] : clean;
  const words = name.split(/[.\s_-]+/).filter(Boolean);
  return (words[0]?.[0] || "D").toUpperCase() + (words[1]?.[0] || "U").toUpperCase();
}

function getClientPrincipal(request) {
  const encoded = request.headers.get("x-ms-client-principal");
  if (!encoded) {
    return {
      userId: "local-user",
      displayName: "John Doe",
      email: "john.doe@example.com",
      initials: "JD",
    };
  }

  try {
    const decoded = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    const claims = decoded.claims || [];
    const claim = (...names) =>
      claims.find((item) => names.includes(item.typ) || names.includes(item.type))?.val;
    const email =
      decoded.userDetails ||
      claim("preferred_username", "email", "emails", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress");
    const displayName =
      claim("name", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name") ||
      email ||
      "Dashboard User";
    const userId =
      decoded.userId ||
      claim("oid", "sub", "http://schemas.microsoft.com/identity/claims/objectidentifier") ||
      email ||
      "unknown-user";

    return {
      userId,
      displayName,
      email: email || "",
      initials: formatInitials(displayName || email),
    };
  } catch {
    return {
      userId: "unknown-user",
      displayName: "Dashboard User",
      email: "",
      initials: "DU",
    };
  }
}

function getGroupIdsFromClientPrincipal(request) {
  const encoded = request.headers.get("x-ms-client-principal");
  if (!encoded) return [];

  try {
    const decoded = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    const claims = decoded.claims || [];
    return claims
      .filter((item) =>
        ["groups", "http://schemas.microsoft.com/ws/2008/06/identity/claims/groups"].includes(
          item.typ || item.type
        )
      )
      .map((item) => item.val)
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function getUserGroupIds(accessToken) {
  const response = await fetch(
    "https://graph.microsoft.com/v1.0/me/memberOf?$select=id",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Graph API call failed: ${response.status} - ${text}`);
  }

  const data = await response.json();
  return data.value.map((group) => group.id);
}

async function getGraphAccessToken(request) {
  const accessToken = request.headers.get("x-ms-token-aad-access-token");
  if (accessToken) return accessToken;

  const authMeUrl = `${new URL(request.url).origin}/.auth/me`;
  const cookie = request.headers.get("cookie");
  const resp = await fetch(authMeUrl, {
    headers: { Cookie: cookie || "" },
  });

  if (!resp.ok) throw new Error("Failed to retrieve auth info from /.auth/me");

  const authInfo = await resp.json();
  if (authInfo && authInfo.length > 0 && authInfo[0].access_token) {
    return authInfo[0].access_token;
  }

  throw new Error("No access token available from EasyAuth");
}

async function getAccessibleContainerNames(request) {
  const hasEasyAuth = Boolean(request.headers.get("x-ms-client-principal"));
  if (!hasEasyAuth) return VALID_CONTAINERS;

  let userGroupIds = getGroupIdsFromClientPrincipal(request);
  if (!userGroupIds.length) {
    const accessToken = await getGraphAccessToken(request);
    userGroupIds = await getUserGroupIds(accessToken);
  }

  return VALID_CONTAINERS.filter((containerName) => {
    const groupEnv = CONTAINER_GROUP_MAP[containerName];
    const groupId = process.env[groupEnv];
    return groupId && userGroupIds.includes(groupId);
  });
}

function getBlobServiceClient() {
  const accountName = process.env.STORAGE_ACCOUNT_NAME;
  if (!accountName) return null;
  return new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    new DefaultAzureCredential()
  );
}

function demoDashboards() {
  const rows = [
    ["team1", "executive-overview.html", "executive-overview.html", "2025-05-14T10:32:00.000Z"],
    ["team1", "sales/performance.html", "performance.html", "2025-05-12T16:18:00.000Z"],
    ["team2", "marketing-dashboard.html", "marketing-dashboard.html", "2025-05-11T09:07:00.000Z"],
    ["team2", "business-report.html", "business-report.html", "2025-05-10T14:41:00.000Z"],
    ["team3", "reports/business-outcome-report.html", "business-outcome-report.html", "2025-05-09T11:22:00.000Z"],
    ["team3", "customer-insights.html", "customer-insights.html", "2025-05-08T15:35:00.000Z"],
  ];

  return rows.map(([container, path, name, lastModified]) => ({
    id: `${container}/${path}`,
    container,
    containerDisplayName: displayNameFromContainer(container),
    path,
    name,
    url: `/${container}/${path}`,
    lastModified,
  }));
}

async function listDashboardIndex(request) {
  const accessibleContainers = await getAccessibleContainerNames(request);
  const cacheKey = accessibleContainers.join("|");
  if (
    dashboardCache &&
    dashboardCache.key === cacheKey &&
    Date.now() - dashboardCache.createdAt < DASHBOARD_CACHE_TTL_MS
  ) {
    return dashboardCache.items;
  }

  const blobServiceClient = getBlobServiceClient();
  if (!blobServiceClient) {
    return demoDashboards().filter((item) => accessibleContainers.includes(item.container));
  }

  const dashboards = [];
  for (const container of accessibleContainers) {
    const containerClient = blobServiceClient.getContainerClient(container);
    for await (const blob of containerClient.listBlobsFlat()) {
      if (!blob.name.toLowerCase().endsWith(".html")) continue;
      dashboards.push({
        id: `${container}/${blob.name}`,
        container,
        containerDisplayName: displayNameFromContainer(container),
        path: blob.name,
        name: displayNameFromPath(blob.name),
        url: `/${container}/${blob.name}`,
        lastModified: blob.properties.lastModified
          ? blob.properties.lastModified.toISOString()
          : null,
      });
    }
  }

  dashboards.sort((a, b) => a.name.localeCompare(b.name));
  dashboardCache = {
    key: cacheKey,
    createdAt: Date.now(),
    items: dashboards,
  };
  return dashboards;
}

async function getBlobContent(containerName, blobName) {
  const blobServiceClient = getBlobServiceClient();
  if (!blobServiceClient) throw new Error("STORAGE_ACCOUNT_NAME is not configured");

  const containerClient = blobServiceClient.getContainerClient(containerName);
  const blobClient = containerClient.getBlobClient(blobName);

  const exists = await blobClient.exists();
  if (!exists) return null;

  const downloadResponse = await blobClient.download(0);
  const chunks = [];
  for await (const chunk of downloadResponse.readableStreamBody) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf-8");
}

function getPgPool() {
  if (!process.env.POSTGRES_HOST) return null;
  if (pool) return pool;

  pool = new Pool({
    host: process.env.POSTGRES_HOST,
    database: process.env.POSTGRES_DATABASE || "dashboard_library",
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    port: Number(process.env.POSTGRES_PORT || 5432),
    ssl: { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 30000,
  });

  return pool;
}

async function ensureFavoritesTable() {
  if (favoritesTableReady) return;
  const pgPool = getPgPool();
  if (!pgPool) throw new Error("PostgreSQL is not configured");
  await pgPool.query(FAVORITES_TABLE_SQL);
  favoritesTableReady = true;
}

function jsonResponse(body, status = 200) {
  return {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    jsonBody: body,
  };
}

const rootHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dashboard Library</title>
  <style>
    :root {
      color-scheme: light;
      --blue: #0b57d0;
      --blue-soft: #eaf2ff;
      --blue-mid: #d6e6ff;
      --text: #202124;
      --muted: #5f6368;
      --line: #d8dce2;
      --panel: #ffffff;
      --surface: #f8fafd;
      --star: #f9ab00;
      --shadow: 0 12px 34px rgba(60, 64, 67, 0.16);
    }

    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--text);
      background: var(--surface);
      letter-spacing: 0;
    }
    button, input, select { font: inherit; }
    button { border: 0; cursor: pointer; background: transparent; color: inherit; }
    .app { min-height: 100vh; display: flex; background: #fff; }
    .sidebar {
      width: 240px;
      border-right: 1px solid var(--line);
      background: #fbfcff;
      display: flex;
      flex-direction: column;
      position: sticky;
      top: 0;
      height: 100vh;
      flex: none;
      z-index: 20;
    }
    .brand {
      height: 88px;
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 0 20px;
      font-size: 18px;
      font-weight: 600;
    }
    .brand-mark {
      width: 38px;
      height: 38px;
      background: conic-gradient(from 30deg, #164ea8 0 16%, #2c72df 16% 32%, #75a7ff 32% 48%, #164ea8 48% 64%, #2c72df 64% 80%, #75a7ff 80% 100%);
      clip-path: polygon(50% 0, 92% 25%, 92% 75%, 50% 100%, 8% 75%, 8% 25%);
    }
    .nav { padding: 16px 14px; display: grid; gap: 10px; }
    .nav-button {
      height: 40px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 0 14px;
      color: #2f3337;
      text-decoration: none;
      font-size: 16px;
      font-weight: 500;
    }
    .nav-button.active { background: #edf3ff; color: var(--blue); font-weight: 700; }
    .nav-button:hover { background: #f0f4fa; }
    .nav-icon { width: 22px; height: 22px; display: inline-grid; place-items: center; }
    .badge {
      margin-left: auto;
      min-width: 22px;
      height: 22px;
      border-radius: 999px;
      display: inline-grid;
      place-items: center;
      background: #e9eef7;
      color: #4d5663;
      font-size: 12px;
      font-weight: 700;
    }
    .account {
      margin-top: auto;
      border-top: 1px solid var(--line);
      padding: 18px 18px 22px;
      position: relative;
    }
    .account-card {
      display: flex;
      align-items: center;
      gap: 14px;
      width: 100%;
      border-radius: 8px;
      padding: 6px;
    }
    .account-card:hover { background: #f1f4f9; }
    .avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: #3f6fcf;
      color: #fff;
      display: grid;
      place-items: center;
      font-size: 15px;
      flex: none;
    }
    .account-name {
      min-width: 0;
      flex: 1;
      text-align: left;
      font-size: 16px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .account-menu {
      position: absolute;
      left: 18px;
      right: 18px;
      bottom: 84px;
      background: #fff;
      border: 1px solid var(--line);
      box-shadow: var(--shadow);
      border-radius: 6px;
      padding: 8px;
      display: none;
    }
    .account-menu.open { display: block; }
    .menu-action {
      height: 44px;
      border-radius: 6px;
      width: 100%;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 12px;
      font-size: 16px;
    }
    .menu-action:hover { background: #f4f6fa; }
    .main {
      flex: 1;
      min-width: 0;
      background: #fff;
    }
    .header {
      height: 96px;
      border-bottom: 1px solid var(--line);
      display: flex;
      align-items: center;
      gap: 24px;
      padding: 0 32px;
      position: sticky;
      top: 0;
      background: rgba(255,255,255,0.96);
      z-index: 10;
    }
    .mobile-menu { display: none; }
    h1 {
      font-size: 28px;
      line-height: 1.2;
      margin: 0;
      font-weight: 700;
      flex: 1;
      min-width: 220px;
    }
    .search-wrap {
      width: min(520px, 48vw);
      position: relative;
      flex: none;
    }
    .search {
      height: 48px;
      width: 100%;
      border: 1.5px solid #b7c2d4;
      border-radius: 6px;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 14px;
      background: #fff;
    }
    .search:focus-within {
      border-color: var(--blue);
      box-shadow: 0 0 0 1px var(--blue);
    }
    .search input {
      min-width: 0;
      flex: 1;
      border: 0;
      outline: 0;
      font-size: 18px;
      background: transparent;
    }
    .clear-search {
      width: 28px;
      height: 28px;
      display: grid;
      place-items: center;
      color: #5f6368;
      border-radius: 50%;
    }
    .clear-search:hover { background: #eef2f7; }
    .suggestions {
      position: absolute;
      top: 52px;
      left: 0;
      right: 0;
      background: #fff;
      border: 1px solid var(--line);
      box-shadow: var(--shadow);
      border-radius: 6px;
      padding: 10px 0;
      display: none;
      z-index: 30;
    }
    .suggestions.open { display: block; }
    .suggest-label {
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
      padding: 0 18px 8px;
      text-transform: uppercase;
    }
    .suggestion {
      height: 52px;
      width: 100%;
      display: grid;
      grid-template-columns: 32px 1fr 28px;
      align-items: center;
      gap: 12px;
      padding: 0 18px;
      text-align: left;
    }
    .suggestion:hover, .suggestion.active { background: #f3f7ff; }
    .suggestion-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--blue); font-size: 16px; }
    .suggestion-meta { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .content {
      padding: 30px 32px 48px;
      max-width: 1180px;
    }
    .section-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      margin: 6px 0 18px;
    }
    h2 {
      font-size: 22px;
      line-height: 1.25;
      margin: 0;
      font-weight: 650;
    }
    .toolbar {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      color: var(--muted);
    }
    .crumb {
      color: var(--blue);
      text-decoration: none;
      font-weight: 600;
    }
    .scope, .sort {
      height: 36px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #fff;
      padding: 0 10px;
      color: #34383d;
    }
    .folder-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 42px;
    }
    .folder-tile {
      height: 74px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #fff;
      display: grid;
      grid-template-columns: 52px 1fr 28px;
      align-items: center;
      gap: 14px;
      padding: 0 16px;
      text-align: left;
    }
    .folder-tile:hover, .folder-tile:focus-visible {
      border-color: #adc8ff;
      box-shadow: 0 1px 8px rgba(60,64,67,0.12);
      outline: 0;
    }
    .folder-title { font-size: 17px; margin-bottom: 4px; }
    .folder-meta { color: var(--muted); font-size: 14px; }
    .view-toggle {
      display: inline-flex;
      border: 1px solid var(--line);
      border-radius: 6px;
      overflow: hidden;
      background: #fff;
    }
    .toggle-button {
      width: 42px;
      height: 36px;
      display: grid;
      place-items: center;
      color: #4d5258;
    }
    .toggle-button.active {
      color: var(--blue);
      background: #edf3ff;
      box-shadow: inset 0 0 0 1px var(--blue);
    }
    .table {
      border-collapse: separate;
      border-spacing: 0;
      width: 100%;
      table-layout: fixed;
    }
    .table th {
      height: 40px;
      color: #4b4f55;
      text-align: left;
      font-weight: 500;
      font-size: 15px;
      padding: 0 8px;
    }
    .table td {
      height: 52px;
      border-top: 1px solid var(--line);
      border-bottom: 1px solid var(--line);
      background: #fff;
      padding: 0 8px;
      vertical-align: middle;
    }
    .table tbody tr:hover td { background: #fbfdff; }
    .table td:first-child { border-left: 1px solid var(--line); border-radius: 6px 0 0 6px; }
    .table td:last-child { border-right: 1px solid var(--line); border-radius: 0 6px 6px 0; }
    .name-cell {
      display: flex;
      align-items: center;
      gap: 14px;
      min-width: 0;
    }
    .file-link {
      color: var(--text);
      text-decoration: none;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      display: block;
    }
    .file-link:hover { color: var(--blue); text-decoration: underline; }
    .container-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      max-width: 100%;
    }
    .muted { color: var(--muted); }
    .path-text {
      color: var(--muted);
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .icon-button {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      display: inline-grid;
      place-items: center;
    }
    .icon-button:hover { background: #edf2fa; }
    .star { color: #74777d; }
    .star.pinned { color: var(--star); }
    .empty, .loading, .error {
      min-height: 160px;
      display: grid;
      place-items: center;
      border: 1px dashed var(--line);
      border-radius: 8px;
      color: var(--muted);
      background: #fbfcff;
      text-align: center;
      padding: 24px;
    }
    .mobile-scrim {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.2);
      z-index: 15;
    }
    @media (max-width: 900px) {
      .sidebar { position: fixed; inset: 0 auto 0 0; transform: translateX(-100%); transition: transform 0.18s ease; }
      .sidebar.open { transform: translateX(0); }
      .mobile-scrim.open { display: block; }
      .header { height: auto; min-height: 88px; padding: 18px; flex-wrap: wrap; }
      .mobile-menu { display: grid; width: 40px; height: 40px; place-items: center; border-radius: 6px; }
      .mobile-menu:hover { background: #eef2f7; }
      h1 { min-width: 0; font-size: 24px; }
      .search-wrap { width: 100%; order: 3; }
      .content { padding: 22px 18px 36px; }
      .folder-grid { grid-template-columns: 1fr; }
      .table th:nth-child(2), .table td:nth-child(2),
      .table th:nth-child(3), .table td:nth-child(3) { display: none; }
      .table th, .table td { padding: 0 6px; }
    }
  </style>
</head>
<body>
  <div class="app">
    <aside class="sidebar" id="sidebar">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true"></div>
        <div>Contoso Analytics</div>
      </div>
      <nav class="nav" aria-label="Primary">
        <a href="#/containers" class="nav-button" id="nav-containers">
          <span class="nav-icon" aria-hidden="true">__FOLDER_SMALL__</span>
          <span>Containers</span>
        </a>
        <a href="#/favorites" class="nav-button" id="nav-favorites">
          <span class="nav-icon" aria-hidden="true">__STAR_OUTLINE__</span>
          <span>Favorites</span>
          <span class="badge" id="favorite-count">0</span>
        </a>
      </nav>
      <div class="account">
        <div class="account-menu" id="account-menu">
          <button class="menu-action" id="sign-out" type="button">__LOGOUT__<span>Sign Out</span></button>
        </div>
        <button class="account-card" id="account-button" type="button" aria-expanded="false">
          <span class="avatar" id="avatar">JD</span>
          <span class="account-name" id="account-name">John Doe</span>
          <span aria-hidden="true">⌃</span>
        </button>
      </div>
    </aside>
    <div class="mobile-scrim" id="mobile-scrim"></div>
    <main class="main">
      <header class="header">
        <button class="mobile-menu" id="mobile-menu" type="button" aria-label="Open navigation">☰</button>
        <h1 id="view-title">Dashboard Library</h1>
        <div class="search-wrap">
          <div class="search">
            <span aria-hidden="true">__SEARCH__</span>
            <input id="search-input" type="search" autocomplete="off" spellcheck="false" placeholder="Search dashboards">
            <button class="clear-search" id="clear-search" type="button" aria-label="Clear search">×</button>
          </div>
          <div class="suggestions" id="suggestions" role="listbox"></div>
        </div>
      </header>
      <section class="content" id="content">
        <div class="loading">Loading dashboard library...</div>
      </section>
    </main>
  </div>
  <script>
    const icons = {
      folder: '<svg width="40" height="34" viewBox="0 0 40 34" fill="none" aria-hidden="true"><path d="M2 9.5C2 6.46 4.46 4 7.5 4h8.2c1.48 0 2.88.67 3.8 1.82L22 9h10.5c3.04 0 5.5 2.46 5.5 5.5v12A5.5 5.5 0 0 1 32.5 32h-25A5.5 5.5 0 0 1 2 26.5v-17Z" fill="#4e8df6"/><path d="M2 12h36v14.5A5.5 5.5 0 0 1 32.5 32h-25A5.5 5.5 0 0 1 2 26.5V12Z" fill="#73a7ff"/></svg>',
      folderSmall: '<svg width="22" height="18" viewBox="0 0 22 18" fill="none" aria-hidden="true"><path d="M1 5.2C1 3.43 2.43 2 4.2 2h4.9l1.8 2.5h6.9c1.77 0 3.2 1.43 3.2 3.2v6.1c0 1.77-1.43 3.2-3.2 3.2H4.2A3.2 3.2 0 0 1 1 13.8V5.2Z" fill="currentColor"/></svg>',
      file: '<svg width="24" height="28" viewBox="0 0 24 28" fill="none" aria-hidden="true"><path d="M5 1.5h9l5 5V24a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 3 24V4A2.5 2.5 0 0 1 5.5 1.5Z" fill="#fff" stroke="#0b57d0" stroke-width="1.5"/><path d="M14 1.5V7h5.5" stroke="#0b57d0" stroke-width="1.5"/><path d="m9 12-2.5 2.5L9 17M15 12l2.5 2.5L15 17M13 11l-2 7" stroke="#0b57d0" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      fileHeader: '<svg width="20" height="24" viewBox="0 0 20 24" fill="none" aria-hidden="true"><path d="M4 1.5h8l4.5 4.5V21A1.5 1.5 0 0 1 15 22.5H4A1.5 1.5 0 0 1 2.5 21V3A1.5 1.5 0 0 1 4 1.5Z" stroke="#5f6368" stroke-width="1.4"/><path d="M12 1.5V6h4.5" stroke="#5f6368" stroke-width="1.4"/></svg>',
      star: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 2.6 2.88 5.84 6.44.94-4.66 4.54 1.1 6.42L12 17.31l-5.76 3.03 1.1-6.42-4.66-4.54 6.44-.94L12 2.6Z"/></svg>',
      starOutline: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3.8 2.43 4.92.18.36.4.06 5.43.79-3.93 3.83-.29.28.07.4.93 5.4-4.86-2.55-.36-.2-.36.2-4.86 2.56.93-5.41.07-.4-.29-.28-3.93-3.83 5.43-.79.4-.06.18-.36L12 3.8Z" stroke="currentColor" stroke-width="1.5"/></svg>',
      search: '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true"><circle cx="9.6" cy="9.6" r="6.6" stroke="#202124" stroke-width="1.8"/><path d="m14.4 14.4 5 5" stroke="#202124" stroke-width="1.8" stroke-linecap="round"/></svg>',
      list: '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true"><path d="M8 6h11M8 11h11M8 16h11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M3.5 6h.01M3.5 11h.01M3.5 16h.01" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
      grid: '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true"><rect x="4" y="4" width="5" height="5" stroke="currentColor" stroke-width="1.5"/><rect x="13" y="4" width="5" height="5" stroke="currentColor" stroke-width="1.5"/><rect x="4" y="13" width="5" height="5" stroke="currentColor" stroke-width="1.5"/><rect x="13" y="13" width="5" height="5" stroke="currentColor" stroke-width="1.5"/></svg>',
      more: '<svg width="22" height="22" viewBox="0 0 22 22" fill="currentColor" aria-hidden="true"><circle cx="11" cy="5" r="1.6"/><circle cx="11" cy="11" r="1.6"/><circle cx="11" cy="17" r="1.6"/></svg>',
      logout: '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true"><path d="M9 4H5.5A2.5 2.5 0 0 0 3 6.5v9A2.5 2.5 0 0 0 5.5 18H9M14 7l4 4-4 4M18 11H8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    };

    document.body.innerHTML = document.body.innerHTML
      .replace('__FOLDER_SMALL__', icons.folderSmall)
      .replace('__STAR_OUTLINE__', icons.starOutline)
      .replace('__LOGOUT__', icons.logout)
      .replace('__SEARCH__', icons.search);

    const FAVORITE_KEY = 'dashboardLibrary:favorites:v1';
    const state = {
      loading: true,
      error: '',
      route: { view: 'containers', container: '' },
      user: { displayName: 'John Doe', email: '', initials: 'JD' },
      containers: [],
      dashboards: [],
      favorites: [],
      apiFavorites: false,
      query: '',
      scope: 'all',
      sort: 'name',
      suggestionIndex: -1
    };

    const el = {
      content: document.getElementById('content'),
      title: document.getElementById('view-title'),
      search: document.getElementById('search-input'),
      clearSearch: document.getElementById('clear-search'),
      suggestions: document.getElementById('suggestions'),
      navContainers: document.getElementById('nav-containers'),
      navFavorites: document.getElementById('nav-favorites'),
      favoriteCount: document.getElementById('favorite-count'),
      accountButton: document.getElementById('account-button'),
      accountMenu: document.getElementById('account-menu'),
      accountName: document.getElementById('account-name'),
      avatar: document.getElementById('avatar'),
      signOut: document.getElementById('sign-out'),
      sidebar: document.getElementById('sidebar'),
      mobileMenu: document.getElementById('mobile-menu'),
      mobileScrim: document.getElementById('mobile-scrim')
    };

    function localFavorites() {
      try { return JSON.parse(localStorage.getItem(FAVORITE_KEY) || '[]'); }
      catch { return []; }
    }

    function saveLocalFavorites(items) {
      localStorage.setItem(FAVORITE_KEY, JSON.stringify(items));
    }

    async function api(path, options) {
      const response = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, options || {}));
      if (!response.ok) throw new Error(path + ' failed with ' + response.status);
      return response.json();
    }

    async function load() {
      try {
        const results = await Promise.allSettled([
          api('/api/me'),
          api('/api/containers'),
          api('/api/dashboards'),
          api('/api/favorites')
        ]);

        if (results[0].status === 'fulfilled') state.user = results[0].value;
        if (results[1].status === 'fulfilled') state.containers = results[1].value;
        if (results[2].status === 'fulfilled') state.dashboards = results[2].value;

        if (!state.containers.length || !state.dashboards.length) {
          installDemoData();
        }

        if (results[3].status === 'fulfilled') {
          state.favorites = results[3].value;
          state.apiFavorites = true;
        } else {
          state.favorites = localFavorites();
        }
      } catch (error) {
        state.error = error.message || 'Unable to load dashboards.';
        installDemoData();
        state.favorites = localFavorites();
      } finally {
        state.loading = false;
        parseRoute();
        render();
      }
    }

    function installDemoData() {
      const demo = [
        ['team1', 'executive-overview.html', 'Executive Overview.html', '2025-05-14T10:32:00.000Z'],
        ['team1', 'sales/performance.html', 'Sales Performance.html', '2025-05-12T16:18:00.000Z'],
        ['team2', 'marketing-dashboard.html', 'Marketing Dashboard.html', '2025-05-11T09:07:00.000Z'],
        ['team2', 'business-report.html', 'Business Report.html', '2025-05-10T14:41:00.000Z'],
        ['team3', 'reports/business-outcome-report.html', 'Business Outcome Report.html', '2025-05-09T11:22:00.000Z'],
        ['team3', 'customer-insights.html', 'Customer Insights.html', '2025-05-08T15:35:00.000Z']
      ];
      state.dashboards = demo.map(function (row) {
        return {
          id: row[0] + '/' + row[1],
          container: row[0],
          containerDisplayName: displayContainer(row[0]),
          path: row[1],
          name: row[2],
          url: '/' + row[0] + '/' + row[1],
          lastModified: row[3]
        };
      });
      state.containers = ['team1', 'team2', 'team3'].map(function (name) {
        const dashboards = state.dashboards.filter(function (item) { return item.container === name; });
        const demoCounts = { team1: 12, team2: 8, team3: 15 };
        return {
          name: name,
          displayName: displayContainer(name),
          dashboardCount: demoCounts[name] || dashboards.length,
          lastUpdated: dashboards[0] && dashboards[0].lastModified
        };
      });
    }

    function displayContainer(name) {
      const match = /^team(\\d+)$/i.exec(name);
      return match ? 'Team ' + match[1] : name.replace(/[-_]+/g, ' ').replace(/\\b\\w/g, function (char) { return char.toUpperCase(); });
    }

    function parseRoute() {
      const hash = window.location.hash || '#/containers';
      const parts = hash.replace(/^#\\/?/, '').split('/');
      if (parts[0] === 'favorites') {
        state.route = { view: 'favorites', container: '' };
        state.scope = 'favorites';
      } else if (parts[0] === 'containers' && parts[1]) {
        const nextContainer = decodeURIComponent(parts[1]);
        const isSameContainer = state.route.view === 'container' && state.route.container === nextContainer;
        state.route = { view: 'container', container: nextContainer };
        if (!isSameContainer) state.scope = 'current';
      } else {
        state.route = { view: 'containers', container: '' };
        state.scope = 'all';
        if (hash !== '#/containers') window.history.replaceState(null, '', '#/containers');
      }
      closeMobileNav();
    }

    function isFavorite(item) {
      return state.favorites.some(function (fav) {
        return fav.container === item.container && fav.path === item.path;
      });
    }

    function favoriteFor(item) {
      return {
        id: item.id,
        container: item.container,
        path: item.path,
        name: item.name,
        url: item.url,
        lastModified: item.lastModified,
        favoritedAt: new Date().toISOString()
      };
    }

    async function toggleFavorite(item) {
      const pinned = isFavorite(item);
      const previous = state.favorites.slice();
      if (pinned) {
        state.favorites = state.favorites.filter(function (fav) {
          return !(fav.container === item.container && fav.path === item.path);
        });
      } else {
        state.favorites = [favoriteFor(item)].concat(state.favorites);
      }
      saveLocalFavorites(state.favorites);
      render();

      if (!state.apiFavorites) return;
      try {
        if (pinned) {
          const target = previous.find(function (fav) { return fav.container === item.container && fav.path === item.path; });
          await api('/api/favorites/' + encodeURIComponent(target.id), { method: 'DELETE' });
        } else {
          const saved = await api('/api/favorites', { method: 'PUT', body: JSON.stringify(favoriteFor(item)) });
          state.favorites = [saved].concat(state.favorites.filter(function (fav) {
            return !(fav.container === saved.container && fav.path === saved.path);
          }));
          saveLocalFavorites(state.favorites);
          render();
        }
      } catch {
        state.apiFavorites = false;
      }
    }

    function scopedDashboards() {
      let items = state.dashboards.slice();
      if (state.route.view === 'container' && state.scope !== 'all') {
        items = items.filter(function (item) { return item.container === state.route.container; });
      }
      if (state.route.view === 'favorites') {
        items = state.favorites.map(function (fav) {
          return Object.assign({}, state.dashboards.find(function (item) {
            return item.container === fav.container && item.path === fav.path;
          }) || fav, fav);
        });
      }
      if (state.query.trim()) items = rankMatches(items, state.query);
      return sortDashboards(items);
    }

    function rankMatches(items, query) {
      const q = query.trim().toLowerCase();
      return items
        .map(function (item) {
          const name = (item.name || '').toLowerCase();
          const path = (item.path || '').toLowerCase();
          const container = (item.containerDisplayName || item.container || '').toLowerCase();
          const tokens = (name + ' ' + path + ' ' + container).split(/[^a-z0-9]+/).filter(Boolean);
          let score = 99;
          if (name.startsWith(q)) score = 1;
          else if (tokens.some(function (token) { return token.startsWith(q); })) score = 2;
          else if (name.includes(q)) score = 3;
          else if (path.includes(q) || container.includes(q)) score = 4;
          return Object.assign({ score: score }, item);
        })
        .filter(function (item) { return item.score < 99; })
        .sort(function (a, b) { return a.score - b.score || a.name.length - b.name.length || a.name.localeCompare(b.name); });
    }

    function sortDashboards(items) {
      const sorted = items.slice();
      sorted.sort(function (a, b) {
        if (state.sort === 'modified') return new Date(b.lastModified || 0) - new Date(a.lastModified || 0);
        if (state.sort === 'container') return (a.containerDisplayName || a.container).localeCompare(b.containerDisplayName || b.container) || a.name.localeCompare(b.name);
        return a.name.localeCompare(b.name);
      });
      return sorted;
    }

    function formatDate(iso) {
      if (!iso) return 'Unknown';
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'UTC'
      }).format(new Date(iso)).replace(',', '');
    }

    function render() {
      el.accountName.textContent = state.user.displayName || state.user.email || 'Dashboard User';
      el.avatar.textContent = state.user.initials || 'DU';
      el.favoriteCount.textContent = state.favorites.length;
      el.navContainers.classList.toggle('active', state.route.view !== 'favorites');
      el.navFavorites.classList.toggle('active', state.route.view === 'favorites');
      el.search.value = state.query;

      if (state.loading) {
        el.content.innerHTML = '<div class="loading">Loading dashboard library...</div>';
        return;
      }

      if (state.route.view === 'favorites') renderFavorites();
      else if (state.route.view === 'container') renderContainerDetail();
      else renderContainers();
      renderSuggestions();
    }

    function renderContainers() {
      el.title.textContent = 'Dashboard Library';
      const dashboards = scopedDashboards();
      el.content.innerHTML =
        '<div class="section-bar"><h2>Containers</h2></div>' +
        '<div class="folder-grid">' + state.containers.map(renderFolder).join('') + '</div>' +
        '<div class="section-bar"><h2>Dashboards</h2><div class="toolbar">' + viewToggle() + '</div></div>' +
        renderDashboardTable(dashboards, { showContainer: true });
    }

    function renderContainerDetail() {
      const container = state.containers.find(function (item) { return item.name === state.route.container; }) || { name: state.route.container, displayName: displayContainer(state.route.container) };
      el.title.textContent = container.displayName;
      const dashboards = scopedDashboards();
      el.content.innerHTML =
        '<div class="section-bar"><div class="toolbar"><a class="crumb" href="#/containers">Containers</a><span>/</span><strong>' + escapeHtml(container.displayName) + '</strong></div>' +
        '<div class="toolbar"><select class="scope" id="scope-select" aria-label="Search scope"><option value="current">Current container</option><option value="all">All dashboards</option></select><select class="sort" id="sort-select" aria-label="Sort dashboards"><option value="name">Name</option><option value="modified">Last modified</option><option value="container">Container</option></select></div></div>' +
        '<div class="section-bar"><h2>Dashboards</h2><div class="toolbar">' + viewToggle() + '</div></div>' +
        renderDashboardTable(dashboards, { showContainer: state.scope === 'all' });
      document.getElementById('scope-select').value = state.scope;
      document.getElementById('sort-select').value = state.sort;
      document.getElementById('scope-select').addEventListener('change', function (event) { state.scope = event.target.value; render(); });
      document.getElementById('sort-select').addEventListener('change', function (event) { state.sort = event.target.value; render(); });
    }

    function renderFavorites() {
      el.title.textContent = 'Favorites';
      const dashboards = scopedDashboards();
      el.content.innerHTML =
        '<div class="section-bar"><h2>Favorites</h2><div class="toolbar"><select class="sort" id="sort-select" aria-label="Sort dashboards"><option value="name">Name</option><option value="modified">Last modified</option><option value="container">Container</option></select>' + viewToggle() + '</div></div>' +
        renderDashboardTable(dashboards, { showContainer: true, empty: 'No pinned dashboards yet.' });
      document.getElementById('sort-select').value = state.sort;
      document.getElementById('sort-select').addEventListener('change', function (event) { state.sort = event.target.value; render(); });
    }

    function renderFolder(container) {
      const updated = container.lastUpdated ? '<div class="folder-meta">Updated ' + formatDate(container.lastUpdated) + '</div>' : '';
      return '<a class="folder-tile" href="#/containers/' + encodeURIComponent(container.name) + '">' +
        icons.folder +
        '<span><span class="folder-title">' + escapeHtml(container.displayName || container.name) + '</span><span class="folder-meta">' + (container.dashboardCount ?? 0) + ' dashboards</span>' + updated + '</span>' +
        '<span class="muted">' + icons.more + '</span>' +
        '</a>';
    }

    function viewToggle() {
      return '<div class="view-toggle" aria-label="View mode"><button class="toggle-button active" type="button" title="List view">' + icons.list + '</button><button class="toggle-button" type="button" title="Grid view">' + icons.grid + '</button></div>';
    }

    function renderDashboardTable(items, options) {
      if (!items.length) return '<div class="empty">' + escapeHtml(options.empty || 'No dashboards found.') + '</div>';
      const showContainer = options.showContainer;
      return '<table class="table"><colgroup><col style="width:38%"><col style="width:19%"><col style="width:25%"><col style="width:12%"><col style="width:6%"></colgroup><thead><tr>' +
        '<th><span class="name-cell">' + icons.fileHeader + 'Name</span></th>' +
        '<th>' + (showContainer ? 'Container' : 'Path') + '</th>' +
        '<th>Last modified</th><th>Favorites</th><th></th></tr></thead><tbody>' +
        items.map(function (item) { return renderDashboardRow(item, showContainer); }).join('') +
        '</tbody></table>';
    }

    function renderDashboardRow(item, showContainer) {
      const pinned = isFavorite(item);
      const second = showContainer
        ? '<span class="container-pill">' + icons.folderSmall + '<span>' + escapeHtml(item.containerDisplayName || displayContainer(item.container)) + '</span></span>'
        : '<div class="path-text" title="' + escapeHtml(item.path) + '">' + escapeHtml(item.path) + '</div>';
      return '<tr>' +
        '<td><span class="name-cell">' + icons.file + '<a class="file-link" href="' + escapeAttr(item.url) + '">' + escapeHtml(item.name) + '</a></span></td>' +
        '<td>' + second + '</td>' +
        '<td class="muted">' + formatDate(item.lastModified) + '</td>' +
        '<td><button class="icon-button star ' + (pinned ? 'pinned' : '') + '" type="button" data-favorite="' + escapeAttr(item.id) + '" aria-label="' + (pinned ? 'Remove favorite' : 'Add favorite') + '">' + (pinned ? icons.star : icons.starOutline) + '</button></td>' +
        '<td><button class="icon-button muted" type="button" title="More actions">' + icons.more + '</button></td>' +
        '</tr>';
    }

    function renderSuggestions() {
      const q = state.query.trim();
      if (q.length < 2) {
        el.suggestions.classList.remove('open');
        el.suggestions.innerHTML = '';
        return;
      }
      const items = rankMatches(state.dashboards, q).slice(0, 5);
      if (!items.length) {
        el.suggestions.classList.remove('open');
        el.suggestions.innerHTML = '';
        return;
      }
      el.suggestions.innerHTML = '<div class="suggest-label">Files</div>' + items.map(function (item, index) {
        return '<button class="suggestion ' + (index === state.suggestionIndex ? 'active' : '') + '" type="button" data-suggestion="' + escapeAttr(item.id) + '">' +
          icons.file + '<span><span class="suggestion-title">' + escapeHtml(item.name) + '</span><span class="suggestion-meta">' + escapeHtml((item.containerDisplayName || item.container) + ' / ' + item.path) + '</span></span>' +
          '<span class="star ' + (isFavorite(item) ? 'pinned' : '') + '">' + (isFavorite(item) ? icons.star : icons.starOutline) + '</span></button>';
      }).join('');
      el.suggestions.classList.add('open');
    }

    function escapeHtml(value) {
      return String(value || '').replace(/[&<>"']/g, function (char) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
      });
    }

    function escapeAttr(value) {
      return escapeHtml(value).replace(/"/g, '&quot;');
    }

    document.addEventListener('click', function (event) {
      const favButton = event.target.closest('[data-favorite]');
      if (favButton) {
        const item = state.dashboards.find(function (dashboard) { return dashboard.id === favButton.dataset.favorite; });
        if (item) toggleFavorite(item);
        return;
      }
      const suggestion = event.target.closest('[data-suggestion]');
      if (suggestion) {
        const item = state.dashboards.find(function (dashboard) { return dashboard.id === suggestion.dataset.suggestion; });
        if (item) window.location.href = item.url;
        return;
      }
      if (!event.target.closest('.search-wrap')) {
        el.suggestions.classList.remove('open');
      }
      if (!event.target.closest('.account')) {
        el.accountMenu.classList.remove('open');
        el.accountButton.setAttribute('aria-expanded', 'false');
      }
    });

    el.search.addEventListener('input', function (event) {
      state.query = event.target.value;
      state.suggestionIndex = -1;
      render();
    });
    el.search.addEventListener('keydown', function (event) {
      const suggestions = rankMatches(state.dashboards, state.query).slice(0, 5);
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        state.suggestionIndex = Math.min(suggestions.length - 1, state.suggestionIndex + 1);
        renderSuggestions();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        state.suggestionIndex = Math.max(-1, state.suggestionIndex - 1);
        renderSuggestions();
      } else if (event.key === 'Enter') {
        const target = suggestions[state.suggestionIndex] || suggestions[0] || scopedDashboards()[0];
        if (target) window.location.href = target.url;
      } else if (event.key === 'Escape') {
        el.suggestions.classList.remove('open');
      }
    });
    el.clearSearch.addEventListener('click', function () {
      state.query = '';
      state.suggestionIndex = -1;
      render();
      el.search.focus();
    });
    el.accountButton.addEventListener('click', function () {
      const open = !el.accountMenu.classList.contains('open');
      el.accountMenu.classList.toggle('open', open);
      el.accountButton.setAttribute('aria-expanded', String(open));
    });
    el.signOut.addEventListener('click', function () {
      window.location.href = '/.auth/logout';
    });
    el.mobileMenu.addEventListener('click', function () {
      el.sidebar.classList.add('open');
      el.mobileScrim.classList.add('open');
    });
    el.mobileScrim.addEventListener('click', closeMobileNav);
    function closeMobileNav() {
      el.sidebar.classList.remove('open');
      el.mobileScrim.classList.remove('open');
    }
    window.addEventListener('hashchange', function () { parseRoute(); render(); });

    load();
  </script>
</body>
</html>`;

app.http("apiMe", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "api/me",
  handler: async (request) => jsonResponse(getClientPrincipal(request)),
});

app.http("apiContainers", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "api/containers",
  handler: async (request) => {
    const dashboards = await listDashboardIndex(request);
    const hasEasyAuth = Boolean(request.headers.get("x-ms-client-principal"));
    let userGroupIds = [];
    if (hasEasyAuth) {
      userGroupIds = getGroupIdsFromClientPrincipal(request);
      if (!userGroupIds.length) {
        const accessToken = await getGraphAccessToken(request);
        userGroupIds = await getUserGroupIds(accessToken);
      }
    }
    const containers = (await getAccessibleContainerNames(request)).map((name) => {
      const items = dashboards.filter((item) => item.container === name);
      const readerGroupId = process.env[CONTAINER_GROUP_MAP[name]];
      const writerGroupId = process.env[CONTAINER_WRITE_GROUP_MAP[name]];
      return {
        name,
        displayName: displayNameFromContainer(name),
        canRead: !hasEasyAuth || Boolean(readerGroupId && userGroupIds.includes(readerGroupId)),
        canWrite: !hasEasyAuth
          ? name === "team1" || name === "team3"
          : Boolean(writerGroupId && userGroupIds.includes(writerGroupId)),
        dashboardCount: items.length,
        lastUpdated: items
          .map((item) => item.lastModified)
          .filter(Boolean)
          .sort()
          .pop() || null,
      };
    });
    return jsonResponse(containers);
  },
});

app.http("apiDashboards", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "api/dashboards",
  handler: async (request) => jsonResponse(await listDashboardIndex(request)),
});

app.http("apiFavorites", {
  methods: ["GET", "PUT"],
  authLevel: "anonymous",
  route: "api/favorites",
  handler: async (request) => {
    if (!getPgPool()) {
      return jsonResponse({ error: "PostgreSQL is not configured" }, 503);
    }
    await ensureFavoritesTable();
    const user = getClientPrincipal(request);
    const pgPool = getPgPool();

    if (request.method === "GET") {
      const result = await pgPool.query(
        `select id, container_name, blob_path, dashboard_name, dashboard_url, created_at
         from user_favorites
         where user_id = $1
         order by created_at desc`,
        [user.userId]
      );
      return jsonResponse(
        result.rows.map((row) => ({
          id: row.id,
          container: row.container_name,
          path: row.blob_path,
          name: row.dashboard_name,
          url: row.dashboard_url,
          favoritedAt: row.created_at,
        }))
      );
    }

    const body = await request.json();
    const result = await pgPool.query(
      `insert into user_favorites (user_id, container_name, blob_path, dashboard_name, dashboard_url)
       values ($1, $2, $3, $4, $5)
       on conflict (user_id, container_name, blob_path)
       do update set dashboard_name = excluded.dashboard_name, dashboard_url = excluded.dashboard_url
       returning id, container_name, blob_path, dashboard_name, dashboard_url, created_at`,
      [user.userId, body.container, body.path, body.name, body.url]
    );
    const row = result.rows[0];
    return jsonResponse({
      id: row.id,
      container: row.container_name,
      path: row.blob_path,
      name: row.dashboard_name,
      url: row.dashboard_url,
      favoritedAt: row.created_at,
    });
  },
});

app.http("apiFavoriteDelete", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "api/favorites/{favoriteId}",
  handler: async (request) => {
    if (!getPgPool()) {
      return jsonResponse({ error: "PostgreSQL is not configured" }, 503);
    }
    await ensureFavoritesTable();
    const user = getClientPrincipal(request);
    const favoriteId = request.params.favoriteId;
    const pgPool = getPgPool();
    await pgPool.query("delete from user_favorites where user_id = $1 and id = $2", [
      user.userId,
      favoriteId,
    ]);
    return jsonResponse({ ok: true });
  },
});

app.http("serveHtml", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "{containerName}/{*blobPath}",
  handler: async (request, context) => {
    const containerName = request.params.containerName;
    const blobPath = request.params.blobPath;

    context.log(`Request for container=${containerName}, blob=${blobPath}`);

    if (!VALID_CONTAINERS.includes(containerName)) {
      return {
        status: 404,
        headers: { "Content-Type": "text/html" },
        body: "<html><body><h1>404 - Not Found</h1><p>Invalid container.</p></body></html>",
      };
    }

    if (!blobPath) {
      return {
        status: 400,
        headers: { "Content-Type": "text/html" },
        body: "<html><body><h1>400 - Bad Request</h1><p>Please specify an HTML file path.</p></body></html>",
      };
    }

    const requiredGroupEnvVar = CONTAINER_GROUP_MAP[containerName];
    const requiredGroupId = process.env[requiredGroupEnvVar];

    const hasEasyAuth = Boolean(request.headers.get("x-ms-client-principal"));
    if (hasEasyAuth) {
      if (!requiredGroupId) {
        context.log(`Reader group not configured for container: ${containerName}`);
        return {
          status: 500,
          headers: { "Content-Type": "text/html" },
          body: "<html><body><h1>500 - Configuration Error</h1><p>Reader group not configured for this container.</p></body></html>",
        };
      }

      let userGroupIds;
      try {
        userGroupIds = getGroupIdsFromClientPrincipal(request);
        if (!userGroupIds.length) {
          const accessToken = await getGraphAccessToken(request);
          userGroupIds = await getUserGroupIds(accessToken);
        }
      } catch (err) {
        context.log(`Failed to get user groups: ${err.message}`);
        return {
          status: 403,
          headers: { "Content-Type": "text/html" },
          body: "<html><body><h1>403 - Forbidden</h1><p>Unable to verify group membership.</p></body></html>",
        };
      }

      if (!userGroupIds.includes(requiredGroupId)) {
        context.log(`User not in required group ${requiredGroupId} for container ${containerName}`);
        return {
          status: 403,
          headers: { "Content-Type": "text/html" },
          body: "<html><body><h1>403 - Forbidden</h1><p>You do not have permission to view files in this container.</p></body></html>",
        };
      }
    }

    let htmlContent;
    try {
      htmlContent = await getBlobContent(containerName, blobPath);
    } catch (err) {
      context.log(`Failed to fetch blob: ${err.message}`);
      return {
        status: 500,
        headers: { "Content-Type": "text/html" },
        body: "<html><body><h1>500 - Server Error</h1><p>Failed to retrieve the file.</p></body></html>",
      };
    }

    if (htmlContent === null) {
      return {
        status: 404,
        headers: { "Content-Type": "text/html" },
        body: "<html><body><h1>404 - Not Found</h1><p>The requested HTML file was not found.</p></body></html>",
      };
    }

    return {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
      body: htmlContent,
    };
  },
});

app.http("root", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "/",
  handler: async () => ({
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
    body: redesignedRootHtml,
  }),
});
