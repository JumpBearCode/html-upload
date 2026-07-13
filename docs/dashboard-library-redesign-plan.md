# Dashboard Library Redesign Plan

## Goal

Redesign the current Function App landing page into a modern internal dashboard library. The experience should feel like a lightweight Google Drive for HTML dashboards stored in Azure Blob containers:

- Users land on a clean dashboard browser instead of a basic instruction page.
- The left side panel provides stable navigation for Containers and Favorites.
- Containers behave like folders. Users open a container to browse dashboards inside it.
- Dashboards can be pinned as favorites.
- Users can search dashboards globally or within the current container.
- Search is implemented in the frontend for the first version, with autocomplete-style suggestions.

Mockup: [dashboard-library-ui-mockup.png](./dashboard-library-ui-mockup.png)

## Proposed Information Architecture

The app has three primary views:

1. **Containers**
   - Default landing view.
   - Shows every accessible container as a folder tile.
   - Example folders: `team1`, `team2`, `team3`.
   - Each folder tile shows display name, container name, dashboard count, and last updated timestamp if available.

2. **Container Detail**
   - Opens when a user clicks a container folder.
   - Shows breadcrumbs: `Containers / Team 1`.
   - Shows all dashboards inside that container.
   - Provides a scoped search mode by default: search within the current container.
   - Each dashboard row/card has a favorite pin action.

3. **Favorites**
   - Opens from the side panel.
   - Shows dashboards the user pinned.
   - Empty state: "No pinned dashboards yet."
   - Pinned dashboards keep enough metadata to navigate directly back to the source HTML path.

## Layout

### Side Panel

Width: approximately `240px` on desktop.

Top:

- Company icon placeholder.
- Product label such as `Dashboard Library`.

Navigation:

- `Containers`
  - Default active item.
  - Shows folder-style browser.
- `Favorites`
  - Shows pinned dashboards.
  - Optional count badge.

Bottom:

- User initials avatar, e.g. `AL`.
- User name/email if available from EasyAuth.
- Click opens a small account menu.
- Account menu contains `Sign Out`.
- Sign Out frontend behavior:
  - First implementation can redirect to `/.auth/logout`.
  - No custom backend endpoint is required.

### Main Header

The header stays at the top of the main content area:

- View title:
  - `Dashboard Library` for landing.
  - `Team 1` for container detail.
  - `Favorites` for favorites view.
- Global search input.
- Search scope control:
  - `All dashboards`
  - `Current container` when inside a container.

### Content Area

Containers view:

- Folder tiles in a responsive grid.
- Tiles use folder icons, not large decorative cards.
- Each tile is clickable and keyboard-accessible.

Container detail:

- Toolbar with breadcrumb, sort selector, and search scope.
- Dashboard list can be a compact grid or table-like list.
- Recommended first implementation: list rows, because file names can be long.
- Each row:
  - dashboard name
  - container
  - path
  - last modified
  - favorite star/pin button
  - open action

Favorites view:

- Same dashboard row component.
- Favorite action removes item from favorites.

## Navigation Logic

Use hash-based routing for the first implementation because the app is currently a single Function-rendered HTML page and does not need server-side routing changes for UI states.

Routes:

- `#/containers`
  - Shows all accessible containers.
- `#/containers/:containerName`
  - Shows dashboards in a selected container.
- `#/favorites`
  - Shows pinned dashboards.

State transitions:

- Initial load:
  - Load user info.
  - Load container list.
  - Load dashboard index.
  - Restore favorites from local storage or API.
  - Navigate to `#/containers`.
- Click `Containers`:
  - Navigate to `#/containers`.
  - Search scope resets to global.
- Click folder tile:
  - Navigate to `#/containers/team1`.
  - Search scope defaults to current container.
- Click `Favorites`:
  - Navigate to `#/favorites`.
  - Search filters only favorite dashboards.
- Click dashboard:
  - Open existing Function route, e.g. `/team1/path/to/report.html`.
- Click favorite star:
  - Toggle favorite state immediately in UI.
  - Persist locally in Phase 1.
  - Persist to PostgreSQL API in Phase 2.
- Click user avatar:
  - Toggle account menu.
- Click `Sign Out`:
  - Redirect to `/.auth/logout`.

## Favorite Functional Design

### Phase 1: Frontend-Only Favorite State

Use `localStorage` with a stable key:

```text
dashboardLibrary:favorites:v1
```

Store an array of dashboard references:

```json
[
  {
    "id": "team1/business-report.html",
    "container": "team1",
    "path": "business-report.html",
    "name": "Business Report.html",
    "url": "/team1/business-report.html",
    "favoritedAt": "2026-07-13T10:00:00.000Z"
  }
]
```

This gives users working favorite behavior immediately, but favorites are tied to the browser/device.

### Phase 2: Persistent Favorites

Add API endpoints:

- `GET /api/favorites`
  - Returns favorites for current EasyAuth user.
- `PUT /api/favorites`
  - Adds or updates one favorite.
- `DELETE /api/favorites/{favoriteId}`
  - Removes one favorite.

Use PostgreSQL to persist favorites per user.

Proposed table:

```sql
create table user_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  container_name text not null,
  blob_path text not null,
  dashboard_name text not null,
  dashboard_url text not null,
  created_at timestamptz not null default now(),
  unique (user_id, container_name, blob_path)
);
```

User identity source:

- Prefer EasyAuth user principal claims.
- Use a stable user id claim if available.
- Fall back to email only if stable id is unavailable.

## Search Functional Design

### Search Scope

The search input is always visible in the main header.

Supported modes:

- **Global search**
  - Searches all dashboards from all accessible containers.
- **Container search**
  - Searches only dashboards in the current container.
- **Favorites search**
  - Searches only pinned dashboards when on the Favorites view.

### Frontend Filtering

No complex backend search is required for the first version.

The frontend loads a dashboard index and filters it in memory.

Filtering fields:

- dashboard file name
- container display name
- blob path

Matching behavior:

- Case-insensitive.
- Partial substring match.
- Token-aware match.
- Example: typing `BUS` matches:
  - `business report.html`
  - `business outcome report.html`
  - `team1/reports/business/monthly.html`

Ranking behavior:

1. Name starts with query.
2. Any token starts with query.
3. Name contains query.
4. Path contains query.

### Autocomplete

When the user types at least 2 characters:

- Show a dropdown below the search input.
- Display top 5 matches.
- Each suggestion includes:
  - dashboard name
  - container
  - path
  - favorite state
- Pressing Enter opens the top result.
- Clicking a suggestion opens that dashboard.
- Arrow keys move through suggestions.
- Escape closes suggestions.

No separate search results page is needed for the first version. The current list filters live as the user types.

## Data/API Plan

The current app directly serves blob HTML through:

```text
/{containerName}/{*blobPath}
```

Add lightweight JSON endpoints:

### `GET /api/me`

Returns current signed-in user info from EasyAuth:

```json
{
  "displayName": "Alex Li",
  "email": "alex@example.com",
  "initials": "AL"
}
```

### `GET /api/containers`

Returns accessible containers. The first implementation can return configured containers and mark counts as unknown if listing is not implemented yet.

```json
[
  {
    "name": "team1",
    "displayName": "Team 1",
    "dashboardCount": 12
  }
]
```

### `GET /api/dashboards`

Returns dashboard index for all accessible containers:

```json
[
  {
    "id": "team1/business-report.html",
    "container": "team1",
    "path": "business-report.html",
    "name": "Business Report.html",
    "url": "/team1/business-report.html",
    "lastModified": "2026-07-13T10:00:00.000Z"
  }
]
```

Implementation note:

- Reuse existing group membership checks so users only see containers they can access.
- Use Azure Blob list APIs to enumerate `.html` blobs.
- Cache dashboard index in memory for a short TTL, for example 60 seconds, to reduce blob listing calls.

### Favorite APIs

Can be added after PostgreSQL is provisioned:

- `GET /api/favorites`
- `PUT /api/favorites`
- `DELETE /api/favorites/{id}`

## Infrastructure Plan

Provision Azure Database for PostgreSQL Flexible Server.

Recommended resources:

- PostgreSQL Flexible Server.
- One database, e.g. `dashboard_library`.
- Generated admin username/password stored in deployment output or Key Vault.
- Function App app settings:
  - `POSTGRES_HOST`
  - `POSTGRES_DATABASE`
  - `POSTGRES_USER`
  - `POSTGRES_PASSWORD`
  - `POSTGRES_SSLMODE=require`

Preferred security direction:

- Short term:
  - Password auth via app settings.
  - SSL required.
- Better follow-up:
  - Store secrets in Key Vault.
  - Use managed identity or Azure AD auth for PostgreSQL if supported by the deployment target and operational model.
  - Restrict network access with VNet integration/private endpoint if the environment requires it.

New Bicep module:

```text
infra/modules/postgres.bicep
```

Main Bicep changes:

- Add optional parameters:
  - `postgresServerName`
  - `postgresDatabaseName`
  - `postgresAdminLogin`
  - `postgresAdminPassword`
- Deploy the PostgreSQL module.
- Pass PostgreSQL outputs into the Function App module.
- Add app settings in `function-app.bicep`.

Important implementation detail:

- Bicep secure parameters should be used for passwords.
- Do not commit real passwords.

## Implementation Phases

### Phase 1: UI and Frontend-Only Behavior

Deliver:

- Modern root page.
- Side panel.
- Container folder view.
- Container detail view.
- Favorites view.
- Frontend search and autocomplete.
- Local storage favorites.
- Sign Out menu redirecting to `/.auth/logout`.

No PostgreSQL dependency in this phase.

### Phase 2: Blob Listing APIs

Deliver:

- `GET /api/me`
- `GET /api/containers`
- `GET /api/dashboards`
- Group-aware container filtering.
- Dashboard index from Azure Blob Storage.

### Phase 3: PostgreSQL Favorites

Deliver:

- PostgreSQL infra.
- Favorite table migration/init path.
- Favorite API endpoints.
- Frontend switches from local storage to API-backed persistence, with local fallback if API fails.

## UX Details To Preserve During Implementation

- Do not build a marketing landing page. The first screen should be the working dashboard browser.
- Keep folder cards compact.
- Prefer rows for dashboard files so long names do not break the layout.
- Use a star or pin icon for favorites.
- Side panel should remain visible on desktop.
- On mobile, side panel can collapse behind a menu button.
- Text should not overlap or rely on viewport-scaled font sizes.
- All interactive items should have hover, focus, empty, loading, and error states.

## Open Questions

1. Should container display names remain `Team 1`, `Team 2`, `Team 3`, or should they come from config?
2. Should dashboard listing include nested folder grouping, or should all `.html` blobs show as a flat list per container first?
3. Should favorite icons be called `Pin` or `Favorite` in visible UI? The requirement says Favorite, but pin behavior is also mentioned.
4. Should PostgreSQL be public with firewall restrictions for the first deployment, or should we require private networking from day one?
