extension microsoftGraphV1

param location string
param functionAppName string
param appServicePlanName string
param storageAccountName string
param applicationInsightsName string
param tags object = {}
param tenantId string

// Reader group IDs - the Function App checks membership against these
param team1ReaderGroupId string
param team2ReaderGroupId string
param team3ReaderGroupId string

@description('Client secret for the EasyAuth app registration. EasyAuth needs it to redeem the auth code in the hybrid (code id_token) flow. Supplied out-of-band as a secure parameter (e.g. via azd env MICROSOFT_PROVIDER_AUTHENTICATION_SECRET) - never hardcode it.')
@secure()
param authClientSecret string

// Reference existing storage account
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

// Reference existing Application Insights
resource applicationInsights 'Microsoft.Insights/components@2020-02-02' existing = {
  name: applicationInsightsName
}

// App Registration for EasyAuth
resource appRegistration 'Microsoft.Graph/applications@v1.0' = {
  displayName: '${functionAppName}-auth'
  uniqueName: '${functionAppName}-auth'
  signInAudience: 'AzureADMyOrg'
  // Stamp the caller's security-group object IDs into the id_token as "groups"
  // claims so the Function App can authorize from claims (Level 1) without a
  // Graph call. On group overage AAD emits a _claim_names pointer instead and
  // the app falls back to Graph (Level 2).
  groupMembershipClaims: 'SecurityGroup'
  web: {
    redirectUris: [
      'https://${functionAppName}.azurewebsites.net/.auth/login/aad/callback'
    ]
    implicitGrantSettings: {
      enableIdTokenIssuance: true
    }
  }
  requiredResourceAccess: [
    {
      // Microsoft Graph
      resourceAppId: '00000003-0000-0000-c000-000000000000'
      resourceAccess: [
        {
          // User.Read
          id: 'e1fe6dd8-ba31-4d61-89e7-88639da4683d'
          type: 'Scope'
        }
        {
          // GroupMember.Read.All (delegated)
          id: 'bc024368-1153-4739-b217-4326f2e966d0'
          type: 'Scope'
        }
      ]
    }
  ]
}

// Service Principal for the App Registration
resource servicePrincipal 'Microsoft.Graph/servicePrincipals@v1.0' = {
  appId: appRegistration.appId
}

// App Service Plan (Consumption / Linux)
resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: appServicePlanName
  location: location
  tags: tags
  kind: 'linux'
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  properties: {
    reserved: true
  }
}

// Function App
resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: functionAppName
  location: location
  tags: union(tags, {
    'azd-service-name': 'api'
  })
  kind: 'functionapp,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'Node|20'
      appSettings: [
        {
          name: 'AzureWebJobsStorage'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storageAccount.listKeys().keys[0].value}'
        }
        {
          name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storageAccount.listKeys().keys[0].value}'
        }
        {
          name: 'WEBSITE_CONTENTSHARE'
          value: toLower(functionAppName)
        }
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~20'
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: applicationInsights.properties.ConnectionString
        }
        {
          name: 'STORAGE_ACCOUNT_NAME'
          value: storageAccount.name
        }
        {
          name: 'AZURE_TENANT_ID'
          value: tenantId
        }
        // Secret EasyAuth uses to redeem the auth code (referenced by
        // clientSecretSettingName in authsettingsV2 below).
        {
          name: 'MICROSOFT_PROVIDER_AUTHENTICATION_SECRET'
          value: authClientSecret
        }
        // Group mapping: container name -> reader group ID
        {
          name: 'READER_GROUP_TEAM1'
          value: team1ReaderGroupId
        }
        {
          name: 'READER_GROUP_TEAM2'
          value: team2ReaderGroupId
        }
        {
          name: 'READER_GROUP_TEAM3'
          value: team3ReaderGroupId
        }
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'true'
        }
        {
          name: 'ENABLE_ORYX_BUILD'
          value: 'true'
        }
      ]
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
    }
  }
}

// EasyAuth (AAD Authentication v2)
resource authSettings 'Microsoft.Web/sites/config@2023-12-01' = {
  parent: functionApp
  name: 'authsettingsV2'
  properties: {
    platform: {
      enabled: true
    }
    globalValidation: {
      requireAuthentication: true
      unauthenticatedClientAction: 'RedirectToLoginPage'
      redirectToProvider: 'azureactivedirectory'
    }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        registration: {
          openIdIssuer: 'https://login.microsoftonline.com/${tenantId}/v2.0'
          clientId: appRegistration.appId
          clientSecretSettingName: 'MICROSOFT_PROVIDER_AUTHENTICATION_SECRET'
        }
        validation: {
          defaultAuthorizationPolicy: {
            allowedApplications: []
          }
        }
        login: {
          // offline_access -> AAD issues a refresh token so EasyAuth can renew
          // the Graph access token past its ~60-90 min lifetime (the Level 2
          // fallback depends on it; without it the app 401s after expiry).
          loginParameters: [
            'scope=openid profile email offline_access https://graph.microsoft.com/GroupMember.Read.All'
            'response_type=code id_token'
          ]
        }
      }
    }
    login: {
      tokenStore: {
        enabled: true
      }
    }
  }
}

output functionAppName string = functionApp.name
output functionAppUrl string = 'https://${functionApp.properties.defaultHostName}'
output functionAppIdentityPrincipalId string = functionApp.identity.principalId
output appRegistrationClientId string = appRegistration.appId
