# html-upload — Secure HTML Viewer on Azure Functions

Serves HTML files from Azure Blob Storage through an Azure Function, gated by
**Microsoft Entra ID** authentication (App Service "Easy Auth") and **security-group
based authorization**. Each team has its own blob container and its own reader group;
a user only sees a team's pages if they belong to that team's reader group.

- **Function App:** `htmlviewer-dev3-6ded` (Node 20, Linux Consumption)
- **Storage:** `stav5fk6oobsbuo` with containers `team1`, `team2`, `team3`
- **URL pattern:** `https://htmlviewer-dev3-6ded.azurewebsites.net/{team}/{file}.html`
- **Infra:** Bicep under `infra/`, deployed with `azd` (`azd provision` + `azd deploy`)

Authentication is **fully secretless** — Easy Auth proves the app's identity to Entra
with a **federated identity credential (FIC)** backed by a managed identity, not a
client secret.

---

## 1. Architecture (components & request flow)

```mermaid
flowchart LR
    User([Browser / User])

    subgraph Azure["Azure — Resource Group rg-dev3"]
        subgraph Func["Function App  htmlviewer-dev3-6ded"]
            EA["Easy Auth<br/>(App Service Authentication)"]
            Code["serveHtml.js<br/>(authorization + serving)"]
        end

        subgraph Storage["Storage Account  stav5fk6oobsbuo"]
            C1[("team1")]
            C2[("team2")]
            C3[("team3")]
        end

        AI["Application Insights"]
    end

    Entra["Microsoft Entra ID<br/>(app reg + security groups)"]
    Graph["Microsoft Graph<br/>(group overage fallback)"]

    User -- "HTTPS GET /team1/index.html" --> EA
    EA -- "authenticated request<br/>(+ identity headers)" --> Code
    EA -- "OAuth 2.0 / OIDC login" --> Entra
    Code -- "Level 2 (overage only)" --> Graph
    Code -- "download blob<br/>(Managed Identity)" --> Storage
    Code -- "logs / traces" --> AI
```

**Request path in one line:** Browser → Easy Auth (authenticates the user) →
`serveHtml.js` (authorizes by group, then reads the blob with the function's managed
identity) → HTML back to the browser.

---

## 2. Identity & authentication architecture

There are **three independent trust relationships**, none of which uses a stored secret:

```mermaid
flowchart TB
    User([User])

    subgraph FuncApp["Function App"]
        EA["Easy Auth"]
        Code["serveHtml.js"]
        SAMI["System-assigned<br/>Managed Identity"]
        UAMI["User-assigned MI<br/>id-easyauth-...<br/>(FIC only)"]
    end

    AppReg["Entra App Registration<br/>client 6b85fbc4...<br/>(FIC: easyauth-fic)"]
    Entra["Microsoft Entra ID"]
    Storage[("Storage Account<br/>stav5fk6oobsbuo")]

    %% 1. User <-> Function : OAuth via Easy Auth
    User -- "(1) OAuth2 / OIDC<br/>user signs in" --> EA
    EA -- "uses app identity" --> AppReg

    %% 2. App <-> Entra : federated credential (no secret)
    UAMI -- "(2) federated identity credential<br/>MI token = client assertion" --> AppReg
    AppReg -- "trusts" --> Entra

    %% 3. Function <-> Storage : managed identity
    Code -- "uses" --> SAMI
    SAMI -- "(3) AAD token<br/>Storage Blob Data Reader" --> Storage
```

| # | Relationship | How it authenticates | Secret? |
|---|--------------|----------------------|---------|
| (1) | **User ↔ Function** | Easy Auth runs the OAuth2 / OIDC authorization-code flow with Entra | — |
| (2) | **App ↔ Entra** (login token exchange) | **Federated Identity Credential**: Easy Auth gets a token from the user-assigned MI (`aud=api://AzureADTokenExchange`) and presents it as a *client assertion*; Entra trusts it via the FIC | **No secret** |
| (3) | **Function ↔ Storage** | Function code uses `DefaultAzureCredential` (system-assigned MI) to get an AAD token; the MI holds **Storage Blob Data Reader** | **No keys** |

> The user-assigned MI exists **only** to back the FIC (it has no data-plane roles).
> The system-assigned MI exists **only** to read blobs. Keeping them separate limits blast radius.

---

## 3. How a user logs in and gets the HTML page

This is the full OAuth/OIDC handshake (Easy Auth ⇄ Entra, secretless via FIC),
the group-based authorization, and the managed-identity blob read.

```mermaid
sequenceDiagram
    autonumber
    actor U as Browser
    participant EA as Easy Auth
    participant ENT as Microsoft Entra ID
    participant FN as serveHtml.js
    participant GR as Microsoft Graph
    participant BLOB as Blob Storage

    U->>EA: GET /team1/index.html  (no session)
    EA-->>U: 302 redirect to Entra authorize<br/>(response_type=code id_token,<br/>scope=openid profile email offline_access<br/>+ Graph GroupMember.Read.All)
    U->>ENT: Sign in (credentials / MFA)
    ENT-->>U: 302 form_post code + id_token<br/>to /.auth/login/aad/callback
    U->>EA: POST callback (code + id_token)

    rect rgb(235,245,255)
    note over EA,ENT: Secretless token exchange (FIC)
    EA->>EA: Get token from user-assigned MI<br/>(aud = api://AzureADTokenExchange)
    EA->>ENT: Redeem auth code<br/>client_assertion = MI token (FIC)
    ENT-->>EA: access token (Graph) + refresh token<br/>id_token carries "groups" claim
    end

    EA->>EA: Store tokens in token store,<br/>set session cookie
    EA-->>U: 302 back to /team1/index.html (cookie)

    U->>EA: GET /team1/index.html (cookie)
    EA->>FN: Forward request +<br/>X-MS-CLIENT-PRINCIPAL (claims)<br/>X-MS-TOKEN-AAD-ACCESS-TOKEN

    rect rgb(235,255,235)
    note over FN,GR: Authorization
    FN->>FN: Level 1 — read "groups" claim<br/>contains dev3-team1-reader?
    alt group overage (too many groups)
        FN->>GR: Level 2 — GET /me/memberOf<br/>(Bearer access token)
        GR-->>FN: group id list
    end
    end

    alt authorized
        FN->>BLOB: download team1/index.html<br/>(DefaultAzureCredential = system MI)
        BLOB-->>FN: HTML bytes
        FN-->>U: 200 text/html
    else not in reader group
        FN-->>U: 403 Forbidden
    end
```

### 3a. User ↔ Function — OAuth 2.0 via Easy Auth

- The function code is `authLevel: "anonymous"`; **Easy Auth** sits in front and enforces
  `requireAuthentication: true` with `unauthenticatedClientAction: RedirectToLoginPage`.
- Login uses the **hybrid `code id_token`** flow with `offline_access`, so Easy Auth
  obtains a **refresh token** and can renew the Graph access token (needed for the
  Level 2 fallback) long after the ~60–90 min access-token lifetime.
- After login, Easy Auth injects identity into every request:
  - `X-MS-CLIENT-PRINCIPAL` — base64 JSON of the user's claims (including `groups`).
  - `X-MS-TOKEN-AAD-ACCESS-TOKEN` — the Graph access token (used only on overage).

### 3b. Function ↔ Storage — Managed Identity

- `getBlobContent()` uses `new DefaultAzureCredential()`, which on the Function App
  resolves to the **system-assigned managed identity**.
- That identity is granted **Storage Blob Data Reader** on the storage account, so the
  function reads blobs with an **AAD token — no account keys, no SAS** in the serving path.
- `allowBlobPublicAccess: false`; containers are private. The only way to read a page is
  through the function, after passing the group check.

---

## 4. RBAC model

Who can do what, and how the platform identities are authorized.

Two separately-owned things meet here: **who is in a group** is *team-managed*
(team owners add/remove their own members), while **which group is granted which
role on which container** is *platform-managed* (defined in bicep). Group roles are
scoped to each team's **container**, not the whole storage account.

```mermaid
flowchart LR
    Members(["Team owners<br/>add / remove members"])

    subgraph Groups["Entra security groups — membership is TEAM-managed"]
        T1C["dev3-team1-contributor"]
        T1R["dev3-team1-reader"]
        T2C["dev3-team2-contributor"]
        T2R["dev3-team2-reader"]
        T3C["dev3-team3-contributor"]
        T3R["dev3-team3-reader"]
    end

    subgraph Scope["Containers — role assignment is PLATFORM-managed (bicep)"]
        C1[("team1")]
        C2[("team2")]
        C3[("team3")]
    end

    SAMI["Function<br/>system-assigned MI"]
    SA[("Storage account<br/>(all containers)")]

    Members -. "manage membership" .-> Groups

    T1C -- "Blob Data Contributor" --> C1
    T1R -- "Blob Data Reader" --> C1
    T2C -- "Blob Data Contributor" --> C2
    T2R -- "Blob Data Reader" --> C2
    T3C -- "Blob Data Contributor" --> C3
    T3R -- "Blob Data Reader" --> C3

    SAMI -- "Blob Data Reader" --> SA
```

> The user-assigned MI (`id-easyauth-...`) has **no data-plane role** — it only backs
> the EasyAuth FIC, so it's not part of this RBAC picture (see §2).

| Principal | Role / mechanism | Scope | Managed by | Purpose |
|-----------|------------------|-------|------------|---------|
| `dev3-team{n}-contributor` | Storage Blob Data **Contributor** | **`team{n}` container** | role: platform (bicep) · membership: team | Team members **upload** HTML to *their own* container |
| `dev3-team{n}-reader` | Storage Blob Data **Reader** | **`team{n}` container** | role: platform (bicep) · membership: team | Direct portal/tool browsing; **also the group the function checks** before serving |
| Function **system-assigned MI** | Storage Blob Data **Reader** | **Storage account** (all containers) | platform (bicep) | The function reads any team's blobs to serve them |
| Function **user-assigned MI** | **Federated credential** (not an Azure role) | App registration | platform (bicep) | Lets Easy Auth authenticate the app **without a secret** |

> **Container-scoped, not account-scoped.** Each team's group can only touch its own
> container — `team1-contributor` cannot write to `team2`/`team3`. Only the function's
> system-assigned MI is account-scoped, because it legitimately serves every team.

> **Two layers of authorization.** Azure RBAC (above) governs *direct* data-plane access
> (upload / browse) per container. The **function's own check** (`serveHtml.js`:
> container → `READER_GROUP_TEAM{n}`) governs *who can view a page through the app* — it
> requires membership in the matching `*-reader` group via the `groups` claim (Level 1)
> or Microsoft Graph on overage (Level 2).

> **Separation of duties.** *Membership* (who is in `team{n}-*`) is owned by each team;
> *role assignment* (which group → which container) is owned by the platform in bicep.

---

## 5. Project layout

```
infra/
  main.bicep                  # subscription-scope entry; RG + module wiring
  main.parameters.json        # azd parameter mapping
  bicepconfig.json            # declares the Microsoft Graph Bicep extension
  modules/
    ad-groups.bicep           # 6 security groups (reader/contributor x 3 teams)
    storage.bicep             # storage account, 3 containers, RBAC assignments
    function-app.bicep        # function app, Easy Auth, app reg, UAMI + FIC
    monitoring.bicep          # Log Analytics + App Insights
    role-assignment.bicep     # system MI -> Storage Blob Data Reader
src/
  host.json
  package.json
  src/functions/serveHtml.js  # authorization + blob serving
azure.yaml                    # azd service definition
```

## 6. Deploy

```bash
azd env new dev3                       # create environment
azd env set AZURE_FUNCTION_APP_NAME htmlviewer-dev3-6ded
azd provision                          # infra (RG, groups, storage, function, Easy Auth, FIC)
azd deploy                             # function code
```

Then add users to the relevant `dev3-team{n}-reader` (view) and/or
`dev3-team{n}-contributor` (upload) groups, and upload an HTML file into the team's
container. Visit `https://htmlviewer-dev3-6ded.azurewebsites.net/{team}/{file}.html`.
