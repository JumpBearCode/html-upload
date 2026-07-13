const rootHtml = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dashboard Library</title>
  <style>
    :root {
      --bg: #f6f8fb;
      --main: #f9fbfd;
      --panel: #ffffff;
      --line: #e4e9f1;
      --line-strong: #d8e0ea;
      --text: #182230;
      --body: #334155;
      --muted: #667085;
      --blue: #1f6fd1;
      --blue-soft: #edf6ff;
      --green-soft: #ecfdf3;
      --green-line: #86d39e;
      --star: #f5b301;
      --shadow: 0 10px 28px rgba(27, 42, 65, 0.10);
    }

    * { box-sizing: border-box; }
    html, body { min-height: 100%; }
    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      background: var(--bg);
      color: var(--text);
      letter-spacing: 0;
    }
    button, input, select { font: inherit; }
    button { color: inherit; }
    a { color: inherit; }

    .app { min-height: 100vh; display: flex; }
    .sidebar {
      width: 268px;
      min-height: 100vh;
      background: var(--panel);
      border-right: 1px solid #e3e8f0;
      display: flex;
      flex-direction: column;
      flex: 0 0 auto;
    }
    .brand {
      height: 96px;
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 0 22px;
      font-size: 16px;
      font-weight: 700;
    }
    .brand-mark {
      width: 48px;
      height: 48px;
      background: #1769d2;
      clip-path: polygon(50% 0, 92% 25%, 92% 75%, 50% 100%, 8% 75%, 8% 25%);
      position: relative;
      flex: 0 0 auto;
    }
    .brand-mark::after {
      content: "";
      position: absolute;
      inset: 10px 9px;
      background: #fff;
      clip-path: polygon(50% 0, 92% 25%, 92% 75%, 50% 100%, 8% 75%, 8% 25%);
      opacity: .94;
    }
    .nav {
      display: grid;
      gap: 9px;
      padding: 6px 16px;
    }
    .nav-button {
      height: 42px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 12px;
      text-decoration: none;
      color: var(--body);
      font-size: 14px;
      border: 0;
    }
    .nav-button.active {
      background: #eaf3ff;
      color: #155db7;
      font-weight: 700;
    }
    .nav-button.favorite-active {
      background: #fff7df;
      color: #8a6100;
    }
    .nav-icon { width: 26px; height: 26px; display: grid; place-items: center; color: #4d8ee8; }
    .nav-button.favorite-active .nav-icon { color: var(--star); }
    .badge {
      margin-left: auto;
      min-width: 22px;
      height: 22px;
      border-radius: 999px;
      display: inline-grid;
      place-items: center;
      background: #edf2f7;
      color: #475467;
      font-size: 11px;
      font-weight: 700;
    }
    .signout-pop {
      margin: auto 20px 14px 50px;
      width: 198px;
      height: 48px;
      border: 1px solid #dbe3ee;
      border-radius: 8px;
      background: #fff;
      display: none;
      align-items: center;
      gap: 12px;
      padding: 0 18px;
      box-shadow: 0 6px 14px rgba(27,42,65,.04);
      cursor: pointer;
    }
    .signout-pop.open { display: flex; }
    .account {
      border-top: 1px solid #e3e8f0;
      padding: 18px 20px 22px;
      margin-top: auto;
    }
    .account-button {
      width: 100%;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 14px;
      background: transparent;
      border: 0;
      border-radius: 8px;
      padding: 8px 0;
      cursor: pointer;
    }
    .avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: #2f7ddb;
      color: #fff;
      display: grid;
      place-items: center;
      font-size: 14px;
      font-weight: 700;
      flex: 0 0 auto;
    }
    .account-name {
      min-width: 0;
      flex: 1;
      text-align: left;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 14px;
    }

    .main {
      flex: 1;
      min-width: 0;
      background: var(--main);
    }
    .header {
      height: 102px;
      border-bottom: 1px solid #e5eaf1;
      display: flex;
      align-items: center;
      gap: 24px;
      padding: 0 34px;
      background: var(--main);
      position: sticky;
      top: 0;
      z-index: 5;
    }
    .menu { display: none; }
    .title {
      flex: 1;
      min-width: 220px;
      margin: 0;
      font-size: 22px;
      line-height: 1.2;
      font-weight: 700;
    }
    .search-wrap {
      width: min(488px, 48vw);
      position: relative;
      flex: 0 0 auto;
    }
    .search {
      height: 42px;
      border: 1.3px solid #9ab7d9;
      border-radius: 10px;
      background: #fff;
      display: flex;
      align-items: center;
      gap: 13px;
      padding: 0 15px;
    }
    .search input {
      border: 0;
      outline: 0;
      min-width: 0;
      flex: 1;
      background: transparent;
      color: var(--body);
      font-size: 13px;
    }
    .clear {
      border: 0;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: transparent;
      color: var(--muted);
      display: grid;
      place-items: center;
      cursor: pointer;
    }
    .suggestions {
      position: absolute;
      top: 44px;
      right: 0;
      left: 0;
      display: none;
      background: #fff;
      border: 1px solid #dbe3ee;
      border-radius: 8px;
      box-shadow: var(--shadow);
      padding: 14px 20px 16px;
      z-index: 20;
    }
    .suggestions.open { display: block; }
    .suggest-label {
      color: var(--muted);
      font-size: 11px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .suggestion {
      width: 100%;
      min-height: 48px;
      display: grid;
      grid-template-columns: 26px 1fr 140px;
      align-items: center;
      gap: 12px;
      border: 0;
      background: transparent;
      border-radius: 7px;
      text-align: left;
      padding: 4px 0;
      cursor: pointer;
    }
    .suggestion + .suggestion { border-top: 1px solid #e5eaf1; }
    .suggestion:hover { background: #f7fbff; }
    .suggest-title {
      font-size: 13px;
      color: var(--text);
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .suggest-meta {
      justify-self: end;
      color: var(--muted);
      font-size: 12px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      max-width: 138px;
    }

    .content {
      max-width: 1012px;
      padding: 28px 34px 32px;
    }
    .section-title {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
    }
    .hero-title {
      margin: 8px 0 4px;
      font-size: 24px;
      font-weight: 700;
    }
    .muted { color: var(--muted); }
    .subtle { margin: 6px 0 0; color: var(--muted); font-size: 12px; }
    .chips { display: flex; gap: 10px; flex-wrap: wrap; margin: 14px 0 32px; }
    .chip {
      height: 30px;
      min-width: 58px;
      padding: 0 18px;
      border: 1px solid var(--line-strong);
      border-radius: 999px;
      background: #fff;
      color: #475467;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
    }
    .chip.active {
      background: var(--blue-soft);
      border-color: #8bbcf6;
      color: #344054;
    }
    .chip.favorite.active {
      background: #fff7df;
      border-color: #f1c45b;
    }
    .top-row {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 18px;
      margin-bottom: 18px;
    }
    .toggle {
      display: inline-flex;
      overflow: hidden;
      border: 1px solid #d8e0ea;
      border-radius: 7px;
      background: #fff;
    }
    .toggle button {
      width: 39px;
      height: 36px;
      border: 0;
      background: transparent;
      color: #667085;
      display: grid;
      place-items: center;
    }
    .toggle .active {
      background: var(--blue-soft);
      color: var(--blue);
      box-shadow: inset 0 0 0 1px #8bbcf6;
    }
    .panel {
      background: #fff;
      border: 1px solid var(--line);
      border-radius: 10px;
      box-shadow: var(--shadow);
      padding: 14px 23px 12px;
    }
    .table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0 7px;
      table-layout: fixed;
    }
    .table th {
      height: 28px;
      text-align: left;
      color: #475467;
      font-size: 12px;
      font-weight: 700;
      padding: 0;
    }
    .table td {
      height: 42px;
      border-top: 1px solid var(--line);
      border-bottom: 1px solid var(--line);
      background: #fff;
      padding: 0;
      color: var(--body);
      font-size: 13px;
      vertical-align: middle;
    }
    .table tr:nth-child(even) td { background: #fbfdff; }
    .table td:first-child {
      border-left: 1px solid var(--line);
      border-radius: 7px 0 0 7px;
      padding-left: 10px;
    }
    .table td:last-child {
      border-right: 1px solid var(--line);
      border-radius: 0 7px 7px 0;
      padding-right: 10px;
    }
    .name-cell {
      display: flex;
      align-items: center;
      gap: 14px;
      min-width: 0;
      text-decoration: none;
    }
    .name-stack {
      min-width: 0;
      display: block;
    }
    .name-main {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      color: var(--text);
      text-decoration: none;
    }
    .name-main:hover { color: var(--blue); }
    .tag {
      display: inline-grid;
      place-items: center;
      height: 22px;
      min-width: 48px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      color: #344054;
      vertical-align: middle;
    }
    .tag + .tag { margin-left: 6px; }
    .tag.read { background: var(--blue-soft); border: 1px solid #93c5fd; }
    .tag.write { background: var(--green-soft); border: 1px solid var(--green-line); min-width: 54px; }
    .folder-icon {
      width: 44px;
      height: 28px;
      flex: 0 0 auto;
      color: #4d8ee8;
    }
    .file-icon {
      width: 30px;
      height: 30px;
      flex: 0 0 auto;
      color: var(--blue);
    }
    .icon-btn {
      width: 34px;
      height: 34px;
      border: 0;
      border-radius: 50%;
      background: transparent;
      display: inline-grid;
      place-items: center;
      cursor: pointer;
      color: #98a2b3;
    }
    .icon-btn:hover { background: #f1f5fb; }
    .icon-btn.star.pinned { color: var(--star); }
    .crumbs {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      margin-bottom: 12px;
    }
    .crumbs a { color: #53627a; text-decoration: none; }
    .folder-toolbar {
      display: flex;
      align-items: center;
      gap: 14px;
      margin: 22px 0 18px;
      flex-wrap: wrap;
    }
    .inline-search {
      width: 394px;
      height: 38px;
      border: 1px solid var(--line-strong);
      border-radius: 9px;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 12px;
      background: #fff;
    }
    .inline-search input {
      min-width: 0;
      flex: 1;
      border: 0;
      outline: 0;
      background: transparent;
      font-size: 12px;
    }
    .primary {
      height: 36px;
      padding: 0 22px;
      border: 0;
      border-radius: 8px;
      background: var(--blue);
      color: #fff;
      font-size: 13px;
      font-weight: 700;
    }
    .primary:disabled {
      background: #d8e0ea;
      color: #7a8596;
      cursor: not-allowed;
    }
    .container-grid,
    .dashboard-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
    }
    .container-card,
    .dashboard-card {
      min-height: 124px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: #fff;
      box-shadow: var(--shadow);
      padding: 18px;
      display: grid;
      align-content: space-between;
      gap: 16px;
      text-decoration: none;
      color: var(--body);
    }
    .container-card:hover,
    .dashboard-card:hover {
      border-color: #b7d3fb;
      background: #fbfdff;
    }
    .card-head {
      display: flex;
      align-items: center;
      gap: 14px;
      min-width: 0;
    }
    .card-title {
      display: block;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      color: var(--text);
      font-size: 14px;
      font-weight: 700;
      text-decoration: none;
    }
    .card-meta {
      display: block;
      color: var(--muted);
      font-size: 12px;
      margin-top: 4px;
    }
    .card-foot {
      display: grid;
      gap: 8px;
    }
    .tag-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .tag-row .tag + .tag {
      margin-left: 0;
    }
    .card-date {
      color: var(--muted);
      font-size: 12px;
    }
    .empty {
      min-height: 180px;
      display: grid;
      place-items: center;
      color: var(--muted);
      border: 1px dashed var(--line);
      border-radius: 10px;
      background: #fff;
    }

    @media (max-width: 920px) {
      .sidebar {
        position: fixed;
        inset: 0 auto 0 0;
        transform: translateX(-100%);
        transition: transform .18s ease;
        z-index: 30;
      }
      .sidebar.open { transform: translateX(0); }
      .menu {
        display: grid;
        place-items: center;
        width: 40px;
        height: 40px;
        border: 0;
        border-radius: 8px;
        background: #fff;
      }
      .header { height: auto; min-height: 96px; padding: 18px; flex-wrap: wrap; }
      .title { min-width: 0; font-size: 20px; }
      .search-wrap { width: 100%; order: 3; }
      .content { padding: 24px 18px; }
      .table th:nth-child(3), .table td:nth-child(3),
      .table th:nth-child(4), .table td:nth-child(4) { display: none; }
      .inline-search { width: 100%; }
      .container-grid,
      .dashboard-grid { grid-template-columns: 1fr; }
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
        <a class="nav-button" id="nav-containers" href="#/containers">
          <span class="nav-icon" aria-hidden="true">__FOLDER_SMALL__</span>
          <span>Containers</span>
        </a>
        <a class="nav-button" id="nav-favorites" href="#/favorites">
          <span class="nav-icon" aria-hidden="true">__STAR_OUTLINE__</span>
          <span>Favorites</span>
          <span class="badge" id="favorite-count">0</span>
        </a>
      </nav>
      <button class="signout-pop" id="signout" type="button">__LOGOUT__<span>Sign Out</span></button>
      <div class="account">
        <button class="account-button" id="account-button" type="button" aria-expanded="false">
          <span class="avatar" id="avatar">JD</span>
          <span class="account-name" id="account-name">John Doe</span>
          <span aria-hidden="true">⌃</span>
        </button>
      </div>
    </aside>
    <main class="main">
      <header class="header">
        <button class="menu" id="menu" type="button" aria-label="Open navigation">☰</button>
        <h1 class="title" id="title">Dashboard Library</h1>
        <div class="search-wrap">
          <div class="search">
            <span aria-hidden="true">__SEARCH__</span>
            <input id="global-search" type="search" autocomplete="off" spellcheck="false" placeholder="Search dashboards">
            <button class="clear" id="clear-search" type="button" aria-label="Clear search">×</button>
          </div>
          <div class="suggestions" id="suggestions"></div>
        </div>
      </header>
      <section class="content" id="content">
        <div class="empty">Loading dashboard library...</div>
      </section>
    </main>
  </div>
  <script>
    const icon = {
      folder: '<svg class="folder-icon" viewBox="0 0 54 36" fill="none" aria-hidden="true"><path d="M5 6h18l5 6h18c3 0 5 2 5 5v13c0 3-2 5-5 5H5c-3 0-5-2-5-5V11c0-3 2-5 5-5Z" fill="currentColor"/></svg>',
      folderSmall: '<svg width="26" height="24" viewBox="0 0 26 24" fill="none" aria-hidden="true"><path d="M0 5.5C0 3.6 1.6 2 3.5 2h6.2l2.4 3h10.4C24.4 5 26 6.6 26 8.5v13C26 23.4 24.4 25 22.5 25h-19C1.6 25 0 23.4 0 21.5z" fill="currentColor"/></svg>',
      file: '<svg class="file-icon" viewBox="0 0 30 30" fill="none" aria-hidden="true"><rect x="3.5" y="2.5" width="23" height="25" rx="5" fill="#f5f9ff" stroke="#78a9e9"/><path d="M11 11l4-4M21 11l-4-4M12 21l8-13" stroke="#1f6fd1" stroke-width="1.4" stroke-linecap="round"/></svg>',
      search: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.9" stroke="#667085" stroke-width="1.6"/><path d="m13 13 5 5" stroke="#667085" stroke-width="1.6" stroke-linecap="round"/></svg>',
      star: '<svg width="28" height="28" viewBox="0 0 28 28" fill="currentColor" aria-hidden="true"><path d="m14 3.5 3.5 7.1 7.8 1.1-5.6 5.5 1.3 7.8-7-3.7-7 3.7 1.3-7.8-5.6-5.5 7.8-1.1L14 3.5Z"/></svg>',
      starOutline: '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true"><path d="m14 4.5 3.1 6.4.2.4.5.1 7 .9-5 4.9-.4.3.1.5 1.2 6.8-6.2-3.2-.5-.3-.5.3-6.2 3.2 1.2-6.8.1-.5-.4-.3-5-4.9 7-.9.5-.1.2-.4L14 4.5Z" stroke="currentColor" stroke-width="1.5"/></svg>',
      list: '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true"><path d="M6 6h11M6 11h11M6 16h11" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M3 6h.01M3 11h.01M3 16h.01" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
      grid: '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true"><rect x="4" y="4" width="5" height="5" stroke="currentColor"/><rect x="13" y="4" width="5" height="5" stroke="currentColor"/><rect x="4" y="13" width="5" height="5" stroke="currentColor"/><rect x="13" y="13" width="5" height="5" stroke="currentColor"/></svg>',
      more: '<svg width="22" height="22" viewBox="0 0 22 22" fill="currentColor" aria-hidden="true"><circle cx="11" cy="5" r="1.4"/><circle cx="11" cy="11" r="1.4"/><circle cx="11" cy="17" r="1.4"/></svg>',
      logout: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 5H6.5A2.5 2.5 0 0 0 4 7.5v9A2.5 2.5 0 0 0 6.5 19H10M15 8l4 4-4 4M19 12H9" stroke="#596579" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    };
    document.body.innerHTML = document.body.innerHTML
      .replace('__FOLDER_SMALL__', icon.folderSmall)
      .replace('__STAR_OUTLINE__', icon.starOutline)
      .replace('__LOGOUT__', icon.logout)
      .replace('__SEARCH__', icon.search);

    const FAVORITE_KEY = 'dashboardLibrary:favorites:v1';
    const state = {
      user: { displayName: 'John Doe', initials: 'JD' },
      containers: [],
      dashboards: [],
      favorites: [],
      route: { view: 'containers', container: '' },
      query: '',
      containerFilter: 'all',
      detailFilter: 'all',
      viewMode: 'list',
      apiFavorites: false,
      loading: true
    };
    const el = {
      sidebar: document.getElementById('sidebar'),
      title: document.getElementById('title'),
      content: document.getElementById('content'),
      search: document.getElementById('global-search'),
      clear: document.getElementById('clear-search'),
      suggestions: document.getElementById('suggestions'),
      navContainers: document.getElementById('nav-containers'),
      navFavorites: document.getElementById('nav-favorites'),
      favoriteCount: document.getElementById('favorite-count'),
      accountButton: document.getElementById('account-button'),
      accountName: document.getElementById('account-name'),
      avatar: document.getElementById('avatar'),
      signout: document.getElementById('signout'),
      menu: document.getElementById('menu')
    };

    async function api(path, options) {
      const response = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, options || {}));
      if (!response.ok) throw new Error(path + ' failed');
      return response.json();
    }
    function readLocalFavorites() {
      try { return JSON.parse(localStorage.getItem(FAVORITE_KEY) || '[]'); } catch { return []; }
    }
    function saveLocalFavorites() {
      localStorage.setItem(FAVORITE_KEY, JSON.stringify(state.favorites));
    }
    async function load() {
      const results = await Promise.allSettled([
        api('/api/me'),
        api('/api/containers'),
        api('/api/dashboards'),
        api('/api/favorites')
      ]);
      if (results[0].status === 'fulfilled') state.user = results[0].value;
      if (results[1].status === 'fulfilled') state.containers = results[1].value;
      if (results[2].status === 'fulfilled') state.dashboards = results[2].value;
      if (!state.containers.length || !state.dashboards.length) installDemoData();
      state.dashboards = state.dashboards.map(function (item) {
        return Object.assign({}, item, { containerDisplayName: displayContainer(item.container) });
      });
      hydrateContainers();
      if (results[3].status === 'fulfilled') {
        state.favorites = results[3].value;
        state.apiFavorites = true;
      } else {
        state.favorites = readLocalFavorites();
      }
      state.loading = false;
      parseRoute();
      render();
    }
    function installDemoData() {
      const rows = [
        ['team1', 'business-report.html', 'business-report.html', '2026-07-13T09:40:00.000Z'],
        ['team1', 'forecast/revenue-forecast.html', 'revenue-forecast.html', '2026-07-12T15:15:00.000Z'],
        ['team1', 'ops/margin-analysis.html', 'margin-analysis.html', '2026-07-10T18:04:00.000Z'],
        ['team1', 'cost/cost-center-dashboard.html', 'cost-center-dashboard.html', '2026-07-08T08:12:00.000Z'],
        ['team2', 'business-outcome-report.html', 'business-outcome-report.html', '2026-07-12T17:18:00.000Z'],
        ['team2', 'executive-overview.html', 'executive-overview.html', '2026-07-11T11:00:00.000Z'],
        ['team3', 'operations-pulse.html', 'operations-pulse.html', '2026-07-08T15:35:00.000Z']
      ];
      state.dashboards = rows.map(function (row) {
        return { id: row[0] + '/' + row[1], container: row[0], containerDisplayName: displayContainer(row[0]), path: row[1], name: row[2], url: '/' + row[0] + '/' + row[1], lastModified: row[3] };
      });
      state.containers = ['team1', 'team2', 'team3'].map(function (name, index) {
        return { name: name, displayName: displayContainer(name), dashboardCount: state.dashboards.filter(function (d) { return d.container === name; }).length, canRead: true, canWrite: index !== 1 };
      });
    }
    function hydrateContainers() {
      state.containers = state.containers.map(function (container, index) {
        const items = state.dashboards.filter(function (item) { return item.container === container.name; });
        const lastUpdated = items.map(function (item) { return item.lastModified; }).filter(Boolean).sort().pop() || container.lastUpdated || null;
        return Object.assign({
          dashboardCount: items.length,
          canRead: container.canRead !== false,
          canWrite: Boolean(container.canWrite || container.write || index % 2 === 0)
        }, container, {
          displayName: displayContainer(container.name),
          lastUpdated: lastUpdated
        });
      });
    }
    function displayContainer(name) {
      const lower = String(name || '').toLowerCase();
      if (lower === 'team1') return 'Finance Ops';
      if (lower === 'team2') return 'Executive Team';
      if (lower === 'team3') return 'Operations Control';
      return String(name || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    }
    function parseRoute() {
      const hash = window.location.hash || '#/containers';
      const parts = hash.replace(/^#\/?/, '').split('/');
      if (parts[0] === 'favorites') state.route = { view: 'favorites', container: '' };
      else if (parts[0] === 'containers' && parts[1]) state.route = { view: 'container', container: decodeURIComponent(parts[1]) };
      else {
        state.route = { view: 'containers', container: '' };
        if (hash !== '#/containers') history.replaceState(null, '', '#/containers');
      }
      el.sidebar.classList.remove('open');
    }
    function isFavorite(item) {
      return state.favorites.some(function (fav) { return fav.container === item.container && fav.path === item.path; });
    }
    function favoritePayload(item) {
      return { id: item.id, container: item.container, containerDisplayName: item.containerDisplayName || displayContainer(item.container), path: item.path, name: item.name, url: item.url, lastModified: item.lastModified, favoritedAt: new Date().toISOString() };
    }
    async function toggleFavorite(item) {
      const pinned = isFavorite(item);
      const previous = state.favorites.slice();
      if (pinned) state.favorites = state.favorites.filter(function (fav) { return !(fav.container === item.container && fav.path === item.path); });
      else state.favorites = [favoritePayload(item)].concat(state.favorites);
      saveLocalFavorites();
      render();
      if (!state.apiFavorites) return;
      try {
        if (pinned) {
          const target = previous.find(function (fav) { return fav.container === item.container && fav.path === item.path; });
          await api('/api/favorites/' + encodeURIComponent(target.id), { method: 'DELETE' });
        } else {
          const saved = await api('/api/favorites', { method: 'PUT', body: JSON.stringify(favoritePayload(item)) });
          state.favorites = [saved].concat(state.favorites.filter(function (fav) { return !(fav.container === saved.container && fav.path === saved.path); }));
          saveLocalFavorites();
          render();
        }
      } catch {
        state.apiFavorites = false;
      }
    }
    function dateText(iso) {
      if (!iso) return 'Unknown';
      return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(new Date(iso)).replace(',', '');
    }
    function rank(items, query) {
      const q = query.trim().toLowerCase();
      if (!q) return items.slice();
      return items.map(function (item) {
        const hay = [item.name, item.path, item.containerDisplayName, item.container].join(' ').toLowerCase();
        const tokens = hay.split(/[^a-z0-9]+/).filter(Boolean);
        let score = 99;
        if ((item.name || '').toLowerCase().startsWith(q)) score = 1;
        else if (tokens.some(function (token) { return token.startsWith(q); })) score = 2;
        else if (hay.includes(q)) score = 3;
        return Object.assign({ score: score }, item);
      }).filter(function (item) { return item.score < 99; }).sort(function (a, b) { return a.score - b.score || a.name.localeCompare(b.name); });
    }
    function render() {
      el.accountName.textContent = state.user.displayName || state.user.email || 'Dashboard User';
      el.avatar.textContent = state.user.initials || 'DU';
      el.favoriteCount.textContent = state.favorites.length;
      el.navContainers.classList.toggle('active', state.route.view !== 'favorites');
      el.navFavorites.classList.toggle('active', state.route.view === 'favorites');
      el.navFavorites.classList.toggle('favorite-active', state.route.view === 'favorites');
      el.search.value = state.query;
      if (state.loading) return;
      if (state.route.view === 'favorites') renderFavorites();
      else if (state.route.view === 'container') renderContainer();
      else renderContainers();
      renderSuggestions();
    }
    function renderContainers() {
      el.title.textContent = 'Dashboard Library';
      let containers = state.containers.slice();
      if (state.containerFilter === 'read') containers = containers.filter(function (c) { return c.canRead; });
      if (state.containerFilter === 'write') containers = containers.filter(function (c) { return c.canWrite; });
      const count = state.containers.length;
      el.content.innerHTML =
        '<h2 class="section-title">Containers</h2>' +
        '<p class="subtle">' + count + ' containers available based on your AD group access</p>' +
        '<div class="chips">' + containerChip('all', 'All') + containerChip('read', 'Read') + containerChip('write', 'Write') + '</div>' +
        '<div class="top-row"><div><h2 class="section-title">' + (state.viewMode === 'grid' ? 'Container grid' : 'Compact container list') + '</h2><p class="subtle">Showing 1-' + Math.min(14, containers.length) + ' of ' + containers.length + '. Search and access filters stay fixed while the list scrolls.</p></div>' + toggle() + '</div>' +
        (state.viewMode === 'grid' ? renderContainerGrid(containers.slice(0, 14)) : '<div class="panel">' + renderContainerTable(containers.slice(0, 14)) + '</div>');
      bindContainerChips();
      bindViewToggle();
    }
    function containerChip(id, label) {
      return '<button class="chip ' + (state.containerFilter === id ? 'active' : '') + '" type="button" data-container-filter="' + id + '">' + label + '</button>';
    }
    function bindContainerChips() {
      document.querySelectorAll('[data-container-filter]').forEach(function (button) {
        button.addEventListener('click', function () { state.containerFilter = button.dataset.containerFilter; render(); });
      });
    }
    function renderContainerTable(containers) {
      if (!containers.length) return '<div class="empty">No containers found.</div>';
      return '<table class="table"><colgroup><col style="width:44%"><col style="width:19%"><col style="width:16%"><col style="width:18%"><col style="width:3%"></colgroup><thead><tr><th>Container</th><th>Access</th><th>Dashboards</th><th>Last updated</th><th></th></tr></thead><tbody>' +
        containers.map(function (c) {
          return '<tr><td><a class="name-cell" href="#/containers/' + encodeURIComponent(c.name) + '">' + icon.folder + '<span class="name-main">' + escapeHtml(c.displayName || c.name) + '</span></a></td><td>' + accessTags(c) + '</td><td>' + (c.dashboardCount || 0) + '</td><td class="muted">' + dateText(c.lastUpdated) + '</td><td>' + icon.more + '</td></tr>';
        }).join('') + '</tbody></table>';
    }
    function renderContainerGrid(containers) {
      if (!containers.length) return '<div class="empty">No containers found.</div>';
      return '<div class="container-grid">' + containers.map(function (c) {
        return '<a class="container-card" href="#/containers/' + encodeURIComponent(c.name) + '"><span class="card-head">' + icon.folder + '<span><span class="card-title">' + escapeHtml(c.displayName || c.name) + '</span><span class="card-meta">' + (c.dashboardCount || 0) + ' dashboards</span></span></span><span class="card-foot"><span class="tag-row">' + accessTags(c) + '</span><span class="card-date">' + dateText(c.lastUpdated) + '</span></span></a>';
      }).join('') + '</div>';
    }
    function accessTags(c) {
      let out = '';
      if (c.canRead !== false) out += '<span class="tag read">Read</span>';
      if (c.canWrite) out += '<span class="tag write">Write</span>';
      return out;
    }
    function renderContainer() {
      const container = state.containers.find(function (c) { return c.name === state.route.container; }) || { name: state.route.container, displayName: displayContainer(state.route.container), canRead: true };
      const all = state.dashboards.filter(function (item) { return item.container === container.name; });
      const queryItems = rank(all, state.query);
      const items = state.detailFilter === 'pinned' ? queryItems.filter(isFavorite) : queryItems;
      el.title.textContent = 'Dashboard Library';
      el.content.innerHTML =
        '<div class="crumbs"><a href="#/containers">Containers</a><span>/</span><strong>' + escapeHtml(container.displayName || container.name) + '</strong></div>' +
        '<div class="top-row"><div><h2 class="hero-title">' + escapeHtml(container.displayName || container.name) + '</h2><p class="subtle">' + all.length + ' dashboards in this container</p><div class="chips">' + accessTags(container) + '</div></div><button class="primary" type="button" ' + (container.canWrite ? '' : 'disabled') + '>Upload</button></div>' +
        '<div class="folder-toolbar"><label class="inline-search">' + icon.search + '<input id="folder-search" value="' + escapeAttr(state.query) + '" placeholder="Search within ' + escapeAttr(container.displayName || container.name) + '"></label>' +
        detailChip('all', 'All') + detailChip('pinned', 'Pinned') + detailChip('recent', 'Recently used') + toggle() + '</div>' +
        (state.viewMode === 'grid' ? renderDashboardGrid(items) : '<div class="panel">' + renderDashboardTable(items, { showContainer: false, showPath: true }) + '</div>');
      bindDetailControls();
      bindViewToggle();
    }
    function detailChip(id, label) {
      return '<button class="chip ' + (state.detailFilter === id ? 'active' : '') + '" type="button" data-detail-filter="' + id + '">' + label + '</button>';
    }
    function bindDetailControls() {
      const input = document.getElementById('folder-search');
      if (input) input.addEventListener('input', function () { state.query = input.value; render(); });
      document.querySelectorAll('[data-detail-filter]').forEach(function (button) {
        button.addEventListener('click', function () { state.detailFilter = button.dataset.detailFilter; render(); });
      });
    }
    function renderFavorites() {
      el.title.textContent = 'Dashboard Library';
      const hydrated = state.favorites.map(function (fav) {
        const found = state.dashboards.find(function (item) { return item.container === fav.container && item.path === fav.path; });
        return Object.assign({}, fav, found || {}, { containerDisplayName: (found && found.containerDisplayName) || fav.containerDisplayName || displayContainer(fav.container) });
      });
      const items = rank(hydrated, state.query);
      el.content.innerHTML =
        '<h2 class="hero-title">Favorites</h2><p class="subtle">Pinned dashboards from every container you can access</p>' +
        '<div class="chips"><button class="chip favorite active" type="button">All pinned</button>' + favoriteContainerChips(items) + toggle() + '</div>' +
        (state.viewMode === 'grid' ? renderDashboardGrid(items, { showContainer: true }) : '<div class="panel">' + renderDashboardTable(items, { showContainer: true, showPinnedAt: true, empty: 'No pinned dashboards yet.' }) + '</div>');
      bindViewToggle();
    }
    function favoriteContainerChips(items) {
      const names = Array.from(new Set(items.map(function (item) { return item.containerDisplayName || displayContainer(item.container); }))).slice(0, 3);
      return names.map(function (name) { return '<button class="chip" type="button">' + escapeHtml(name) + '</button>'; }).join('');
    }
    function renderDashboardTable(items, options) {
      if (!items.length) return '<div class="empty">' + escapeHtml(options.empty || 'No dashboards found.') + '</div>';
      const secondHeader = options.showContainer ? 'Container' : 'Type';
      const thirdHeader = options.showPinnedAt ? 'Pinned' : 'Last updated';
      return '<table class="table"><colgroup><col style="width:52%"><col style="width:16%"><col style="width:20%"><col style="width:9%"><col style="width:3%"></colgroup><thead><tr><th>Dashboard</th><th>' + secondHeader + '</th><th>' + thirdHeader + '</th><th>Favorite</th><th></th></tr></thead><tbody>' +
        items.map(function (item) { return dashboardRow(item, options); }).join('') + '</tbody></table>';
    }
    function dashboardRow(item, options) {
      const pinned = isFavorite(item);
      const second = options.showContainer ? escapeHtml(item.containerDisplayName || displayContainer(item.container)) : 'HTML';
      const third = options.showPinnedAt ? pinnedLabel(item.favoritedAt) : dateText(item.lastModified);
      return '<tr><td><span class="name-cell">' + icon.file + '<span class="name-stack"><a class="name-main" href="' + escapeAttr(item.url) + '">' + escapeHtml(item.name) + '</a></span></span></td><td>' + second + '</td><td class="muted">' + third + '</td><td><button class="icon-btn star ' + (pinned ? 'pinned' : '') + '" data-favorite="' + escapeAttr(item.id) + '" type="button" aria-label="Toggle favorite">' + (pinned ? icon.star : icon.starOutline) + '</button></td><td>' + icon.more + '</td></tr>';
    }
    function renderDashboardGrid(items) {
      if (!items.length) return '<div class="empty">No dashboards found.</div>';
      return '<div class="dashboard-grid">' + items.map(function (item) {
        const pinned = isFavorite(item);
        return '<div class="dashboard-card"><div class="card-head">' + icon.file + '<span><a class="card-title" href="' + escapeAttr(item.url) + '">' + escapeHtml(item.name) + '</a></span></div><div class="card-foot"><span class="card-meta">' + escapeHtml(item.containerDisplayName || displayContainer(item.container)) + '</span><button class="icon-btn star ' + (pinned ? 'pinned' : '') + '" data-favorite="' + escapeAttr(item.id) + '" type="button" aria-label="Toggle favorite">' + (pinned ? icon.star : icon.starOutline) + '</button></div></div>';
      }).join('') + '</div>';
    }
    function pinnedLabel(iso) {
      if (!iso) return 'Pinned';
      const date = new Date(iso);
      const today = new Date();
      if (date.toDateString() === today.toDateString()) return 'Today ' + new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);
      return dateText(iso).replace(/, \d{1,2}:\d{2}.*/, '');
    }
    function toggle() {
      return '<div class="toggle"><button class="' + (state.viewMode === 'list' ? 'active' : '') + '" data-view-mode="list" type="button" title="List view">' + icon.list + '</button><button class="' + (state.viewMode === 'grid' ? 'active' : '') + '" data-view-mode="grid" type="button" title="Grid view">' + icon.grid + '</button></div>';
    }
    function bindViewToggle() {
      document.querySelectorAll('[data-view-mode]').forEach(function (button) {
        button.addEventListener('click', function () { state.viewMode = button.dataset.viewMode; render(); });
      });
    }
    function renderSuggestions() {
      const q = state.query.trim();
      if (q.length < 2) {
        el.suggestions.classList.remove('open');
        el.suggestions.innerHTML = '';
        return;
      }
      const items = rank(state.dashboards, q).slice(0, 5);
      if (!items.length) {
        el.suggestions.classList.remove('open');
        return;
      }
      el.suggestions.innerHTML = '<div class="suggest-label">DASHBOARDS</div>' + items.map(function (item) {
        return '<button class="suggestion" type="button" data-open="' + escapeAttr(item.id) + '">' + icon.file + '<span class="suggest-title">' + escapeHtml(item.name) + '</span><span class="suggest-meta">' + escapeHtml(item.containerDisplayName || displayContainer(item.container)) + '</span></button>';
      }).join('');
      el.suggestions.classList.add('open');
    }
    function escapeHtml(value) {
      return String(value || '').replace(/[&<>"']/g, function (char) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]; });
    }
    function escapeAttr(value) {
      return escapeHtml(value).replace(/"/g, '&quot;');
    }

    document.addEventListener('click', function (event) {
      const fav = event.target.closest('[data-favorite]');
      if (fav) {
        const item = state.dashboards.find(function (d) { return d.id === fav.dataset.favorite; }) || state.favorites.find(function (d) { return d.id === fav.dataset.favorite; });
        if (item) toggleFavorite(item);
        return;
      }
      const open = event.target.closest('[data-open]');
      if (open) {
        const item = state.dashboards.find(function (d) { return d.id === open.dataset.open; });
        if (item) location.hash = '#/containers/' + encodeURIComponent(item.container);
        return;
      }
      if (!event.target.closest('.search-wrap')) el.suggestions.classList.remove('open');
    });
    el.search.addEventListener('input', function () { state.query = el.search.value; render(); });
    el.clear.addEventListener('click', function () { state.query = ''; render(); el.search.focus(); });
    el.accountButton.addEventListener('click', function () { el.signout.classList.toggle('open'); });
    el.signout.addEventListener('click', function () { location.href = '/.auth/logout'; });
    el.menu.addEventListener('click', function () { el.sidebar.classList.add('open'); });
    window.addEventListener('hashchange', function () { parseRoute(); render(); });
    load();
  </script>
</body>
</html>`;

module.exports = { rootHtml };
