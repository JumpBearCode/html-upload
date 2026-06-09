const { app } = require("@azure/functions");
const { BlobServiceClient } = require("@azure/storage-blob");
const { DefaultAzureCredential } = require("@azure/identity");

// Map container names to their corresponding reader group environment variables
const CONTAINER_GROUP_MAP = {
  team1: "READER_GROUP_TEAM1",
  team2: "READER_GROUP_TEAM2",
  team3: "READER_GROUP_TEAM3",
};

const VALID_CONTAINERS = Object.keys(CONTAINER_GROUP_MAP);

/**
 * Decode the EasyAuth-injected X-MS-CLIENT-PRINCIPAL header.
 * It is a base64-encoded JSON object: { auth_typ, claims: [{ typ, val }], ... }.
 * Returns the parsed claims array (or [] if the header is absent/unparseable).
 */
function getPrincipalClaims(request) {
  const header = request.headers.get("x-ms-client-principal");
  if (!header) return [];
  try {
    const json = Buffer.from(header, "base64").toString("utf-8");
    const principal = JSON.parse(json);
    return Array.isArray(principal.claims) ? principal.claims : [];
  } catch {
    return [];
  }
}

/**
 * LEVEL 1 — read group membership straight from the token claims.
 *
 * Requires the app registration to be configured with
 * groupMembershipClaims = 'SecurityGroup', which makes Azure AD stamp the
 * caller's security-group object IDs into the id_token as repeated "groups"
 * claims. EasyAuth surfaces them via X-MS-CLIENT-PRINCIPAL, so no network
 * call is needed for the common case.
 *
 * Returns:
 *   { groups: string[], overage: boolean }
 *   - groups:  the group IDs found in the token (empty if none / overaged)
 *   - overage: true when AAD omitted the group list because the user is in
 *              too many groups and instead emitted a _claim_names/_claim_sources
 *              (or hasgroups) pointer -> we must fall back to Graph.
 */
function getGroupsFromClaims(claims) {
  const groups = claims
    .filter((c) => c.typ === "groups")
    .map((c) => c.val);

  // Overage markers AAD adds when the group list is too large to inline.
  const overage = claims.some(
    (c) =>
      c.typ === "_claim_names" ||
      c.typ === "hasgroups" ||
      c.typ === "http://schemas.microsoft.com/claims/groups.link"
  );

  return { groups, overage };
}

/**
 * LEVEL 2 — overage fallback. Call Microsoft Graph /me/memberOf using the
 * access token EasyAuth keeps in its token store. This only runs when the
 * token did not inline the groups (overage) or carried no groups claim at all.
 *
 * The access token here is refreshable because the login requests the
 * `offline_access` scope, so this path keeps working past the ~60-90 min
 * access-token lifetime instead of failing with a 401.
 */
async function getUserGroupIdsFromGraph(request, context) {
  const accessToken = request.headers.get("x-ms-token-aad-access-token");
  if (!accessToken) {
    throw new Error("No AAD access token available from EasyAuth token store");
  }

  const ids = [];
  let url =
    "https://graph.microsoft.com/v1.0/me/memberOf?$select=id&$top=999";

  // Follow @odata.nextLink so we resolve membership even for large directories.
  while (url) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Graph API call failed: ${response.status} - ${text}`);
    }
    const data = await response.json();
    for (const obj of data.value || []) {
      if (obj.id) ids.push(obj.id);
    }
    url = data["@odata.nextLink"] || null;
  }

  context.log(`Graph fallback resolved ${ids.length} group(s)`);
  return ids;
}

/**
 * Download blob content from Azure Storage using the Function App's
 * managed identity (granted Storage Blob Data Reader).
 */
async function getBlobContent(containerName, blobName) {
  const accountName = process.env.STORAGE_ACCOUNT_NAME;
  const blobServiceClient = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    new DefaultAzureCredential()
  );

  const containerClient = blobServiceClient.getContainerClient(containerName);
  const blobClient = containerClient.getBlobClient(blobName);

  const exists = await blobClient.exists();
  if (!exists) {
    return null;
  }

  const downloadResponse = await blobClient.download(0);
  const chunks = [];
  for await (const chunk of downloadResponse.readableStreamBody) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf-8");
}

const htmlError = (status, message) => ({
  status,
  headers: { "Content-Type": "text/html" },
  body: `<html><body><h1>${status}</h1><p>${message}</p></body></html>`,
});

// Main HTTP trigger: serves HTML from blob storage
// Route pattern: /{containerName}/{*blobPath}
app.http("serveHtml", {
  methods: ["GET"],
  authLevel: "anonymous", // EasyAuth handles authentication
  route: "{containerName}/{*blobPath}",
  handler: async (request, context) => {
    const containerName = request.params.containerName;
    const blobPath = request.params.blobPath;

    context.log(`Request for container=${containerName}, blob=${blobPath}`);

    if (!VALID_CONTAINERS.includes(containerName)) {
      return htmlError(404, "Invalid container.");
    }
    if (!blobPath) {
      return htmlError(400, "Please specify an HTML file path.");
    }

    const requiredGroupId = process.env[CONTAINER_GROUP_MAP[containerName]];
    if (!requiredGroupId) {
      context.log(`Reader group not configured for container: ${containerName}`);
      return htmlError(500, "Reader group not configured for this container.");
    }

    // ---- Authorization: Level 1 (claims) -> Level 2 (Graph on overage) ----
    let authorized = false;
    const { groups, overage } = getGroupsFromClaims(getPrincipalClaims(request));

    if (groups.length > 0 && !overage) {
      // Level 1: token carried the full group list -> authoritative answer.
      authorized = groups.includes(requiredGroupId);
      context.log(
        `Level 1 (claims): ${groups.length} group(s), authorized=${authorized}`
      );
    } else {
      // Level 2: groups were overaged or absent -> ask Graph.
      context.log(
        `Level 2 (graph fallback): overage=${overage}, inlineGroups=${groups.length}`
      );
      let userGroupIds;
      try {
        userGroupIds = await getUserGroupIdsFromGraph(request, context);
      } catch (err) {
        context.log(`Graph fallback failed: ${err.message}`);
        return htmlError(
          401,
          "Authentication required. Please log in again."
        );
      }
      authorized = userGroupIds.includes(requiredGroupId);
    }

    if (!authorized) {
      context.log(
        `User not in required group ${requiredGroupId} for container ${containerName}`
      );
      return htmlError(
        403,
        "You do not have permission to view files in this container."
      );
    }

    // ---- Fetch and return the blob ----
    let htmlContent;
    try {
      htmlContent = await getBlobContent(containerName, blobPath);
    } catch (err) {
      context.log(`Failed to fetch blob: ${err.message}`);
      return htmlError(500, "Failed to retrieve the file.");
    }

    if (htmlContent === null) {
      return htmlError(404, "The requested HTML file was not found.");
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

// Root route - landing page
app.http("root", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "/",
  handler: async () => ({
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
    body: `<!DOCTYPE html>
<html>
<head><title>HTML Viewer</title></head>
<body>
  <h1>HTML Viewer</h1>
  <p>Access HTML files using the URL pattern:</p>
  <code>/{containerName}/{htmlFileName}</code>
  <h2>Available Containers</h2>
  <ul>
    <li><strong>team1</strong> - /team1/{filename}.html</li>
    <li><strong>team2</strong> - /team2/{filename}.html</li>
    <li><strong>team3</strong> - /team3/{filename}.html</li>
  </ul>
  <p>You must be a member of the corresponding Reader AD group to view files.</p>
</body>
</html>`,
  }),
});
