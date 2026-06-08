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
 * Get the user's group memberships by calling Microsoft Graph API
 * using the access token from EasyAuth.
 */
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
    throw new Error(
      `Graph API call failed: ${response.status} - ${text}`
    );
  }

  const data = await response.json();
  return data.value.map((group) => group.id);
}

/**
 * Get the access token for Graph API from EasyAuth.
 * EasyAuth stores tokens and exposes them via /.auth/me
 */
async function getGraphAccessToken(request) {
  // EasyAuth provides the access token in the X-MS-TOKEN-AAD-ACCESS-TOKEN header
  const accessToken = request.headers.get("x-ms-token-aad-access-token");
  if (accessToken) {
    return accessToken;
  }

  // Fallback: try to get it from /.auth/me endpoint
  const authMeUrl = `${new URL(request.url).origin}/.auth/me`;
  const cookie = request.headers.get("cookie");
  const resp = await fetch(authMeUrl, {
    headers: { Cookie: cookie || "" },
  });

  if (!resp.ok) {
    throw new Error("Failed to retrieve auth info from /.auth/me");
  }

  const authInfo = await resp.json();
  if (authInfo && authInfo.length > 0) {
    const aadToken = authInfo[0].access_token;
    if (aadToken) return aadToken;
  }

  throw new Error("No access token available from EasyAuth");
}

/**
 * Download blob content from Azure Storage using managed identity.
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

// Main HTTP trigger: serves HTML from blob storage
// Route pattern: /{containerName}/{*blobPath}
app.http("serveHtml", {
  methods: ["GET"],
  authLevel: "anonymous", // EasyAuth handles authentication
  route: "{containerName}/{*blobPath}",
  handler: async (request, context) => {
    const containerName = request.params.containerName;
    const blobPath = request.params.blobPath;

    context.log(
      `Request for container=${containerName}, blob=${blobPath}`
    );

    // Validate container name
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

    // Get the required reader group ID for this container
    const requiredGroupEnvVar = CONTAINER_GROUP_MAP[containerName];
    const requiredGroupId = process.env[requiredGroupEnvVar];

    if (!requiredGroupId) {
      context.log(`Reader group not configured for container: ${containerName}`);
      return {
        status: 500,
        headers: { "Content-Type": "text/html" },
        body: "<html><body><h1>500 - Configuration Error</h1><p>Reader group not configured for this container.</p></body></html>",
      };
    }

    // Get the user's access token from EasyAuth
    let accessToken;
    try {
      accessToken = await getGraphAccessToken(request);
    } catch (err) {
      context.log(`Failed to get access token: ${err.message}`);
      return {
        status: 401,
        headers: { "Content-Type": "text/html" },
        body: "<html><body><h1>401 - Unauthorized</h1><p>Authentication required. Please log in.</p></body></html>",
      };
    }

    // Check user's group membership via Graph API
    let userGroupIds;
    try {
      userGroupIds = await getUserGroupIds(accessToken);
    } catch (err) {
      context.log(`Failed to get user groups: ${err.message}`);
      return {
        status: 403,
        headers: { "Content-Type": "text/html" },
        body: "<html><body><h1>403 - Forbidden</h1><p>Unable to verify group membership.</p></body></html>",
      };
    }

    // Check if user belongs to the required reader group
    if (!userGroupIds.includes(requiredGroupId)) {
      context.log(
        `User not in required group ${requiredGroupId} for container ${containerName}`
      );
      return {
        status: 403,
        headers: { "Content-Type": "text/html" },
        body: "<html><body><h1>403 - Forbidden</h1><p>You do not have permission to view files in this container.</p></body></html>",
      };
    }

    // Fetch the blob content using managed identity
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

    // Return the HTML content directly
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
  handler: async (request, context) => {
    return {
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
    };
  },
});
