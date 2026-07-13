# Dashboard Library Interaction Flow

Visual diagram: [dashboard-library-interaction-flow.svg](./dashboard-library-interaction-flow.svg)

## Core Flow

1. User opens the app.
2. Frontend calls `GET /api/me` and `GET /api/containers`.
3. Backend evaluates AD group membership per container.
4. Each container is returned with permission tags:
   - `Read`: user belongs to the reader group.
   - `Write`: user belongs to the writer/contributor group.
5. Default route opens `#/containers`.
6. User clicks a container folder and navigates to `#/containers/:containerName`.
7. The container detail view lists dashboards in that container.
8. User can open a dashboard or toggle Favorite.
9. User can navigate to `#/favorites` from the side panel.

## Search Flow

Search is always available in the main header.

- In `#/containers`, search can filter containers or globally search dashboards depending on the selected scope.
- In `#/containers/:containerName`, search defaults to the current container.
- In `#/favorites`, search filters pinned dashboards.

Autocomplete starts after 2 characters. Example:

- Input: `BUS`
- Suggestions:
  - `Business Report.html`
  - `Business Outcome Report.html`

Matching is frontend-only for the first version:

1. Name starts with query.
2. Any token starts with query.
3. Name contains query.
4. Path contains query.

## Container Scale Behavior

For 100 containers, do not use traditional pagination as the first interaction.

Recommended behavior:

- Default to folder grid for normal scale.
- Add search, access filters, and sorting.
- When container count is high, switch to compact list or virtualized grid.
- Keep API pagination support available through `limit` and `cursor`, but do not expose page navigation unless scale makes it necessary.

## Permission Tags

Container tile/list item should show tags directly:

- `Read`
- `Write`

If a user has both, show both. If product policy says write implies read, the backend should return `canRead: true` for write users so the UI is not ambiguous.
