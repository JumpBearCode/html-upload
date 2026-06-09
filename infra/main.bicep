targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Name of the environment (e.g., dev, staging, prod)')
param environmentName string

@minLength(1)
@description('Primary location for all resources')
param location string

@description('Azure AD Tenant ID for EasyAuth configuration')
param tenantId string = tenant().tenantId

@description('Client secret for the EasyAuth app registration (hybrid code flow). Supply via azd env MICROSOFT_PROVIDER_AUTHENTICATION_SECRET - do not hardcode.')
@secure()
param authClientSecret string

// Optional: allow overriding resource names
param storageAccountName string = ''
param functionAppName string = ''
param appServicePlanName string = ''
param logAnalyticsName string = ''
param applicationInsightsName string = ''

// Tags
var tags = {
  'azd-env-name': environmentName
}

var abbrs = loadJsonContent('./abbreviations.json')
var resourceToken = toLower(uniqueString(subscription().id, environmentName, location))

// Resource Group
resource rg 'Microsoft.Resources/resourceGroups@2022-09-01' = {
  name: 'rg-${environmentName}'
  location: location
  tags: tags
}

// AD Groups for 3 teams - Contributor (upload) and Reader (view)
module adGroups './modules/ad-groups.bicep' = {
  name: 'ad-groups'
  scope: rg
  params: {
    environmentName: environmentName
  }
}

// Log Analytics Workspace
module monitoring './modules/monitoring.bicep' = {
  name: 'monitoring'
  scope: rg
  params: {
    location: location
    logAnalyticsName: !empty(logAnalyticsName) ? logAnalyticsName : '${abbrs.operationalInsightsWorkspaces}${resourceToken}'
    applicationInsightsName: !empty(applicationInsightsName) ? applicationInsightsName : '${abbrs.insightsComponents}${resourceToken}'
    tags: tags
  }
}

// Storage Account with 3 containers
module storage './modules/storage.bicep' = {
  name: 'storage'
  scope: rg
  params: {
    location: location
    storageAccountName: !empty(storageAccountName) ? storageAccountName : '${abbrs.storageStorageAccounts}${resourceToken}'
    tags: tags
    team1ContributorGroupId: adGroups.outputs.team1ContributorGroupId
    team2ContributorGroupId: adGroups.outputs.team2ContributorGroupId
    team3ContributorGroupId: adGroups.outputs.team3ContributorGroupId
    team1ReaderGroupId: adGroups.outputs.team1ReaderGroupId
    team2ReaderGroupId: adGroups.outputs.team2ReaderGroupId
    team3ReaderGroupId: adGroups.outputs.team3ReaderGroupId
  }
}

// Function App with EasyAuth
module functionApp './modules/function-app.bicep' = {
  name: 'function-app'
  scope: rg
  params: {
    location: location
    functionAppName: !empty(functionAppName) ? functionAppName : '${abbrs.webSitesFunctions}${resourceToken}'
    appServicePlanName: !empty(appServicePlanName) ? appServicePlanName : '${abbrs.webServerFarms}${resourceToken}'
    storageAccountName: storage.outputs.storageAccountName
    applicationInsightsName: monitoring.outputs.applicationInsightsName
    tags: tags
    tenantId: tenantId
    team1ReaderGroupId: adGroups.outputs.team1ReaderGroupId
    team2ReaderGroupId: adGroups.outputs.team2ReaderGroupId
    team3ReaderGroupId: adGroups.outputs.team3ReaderGroupId
    authClientSecret: authClientSecret
  }
}

// Assign Storage Blob Data Reader to Function App's managed identity
module functionStorageRole './modules/role-assignment.bicep' = {
  name: 'function-storage-role'
  scope: rg
  params: {
    storageAccountName: storage.outputs.storageAccountName
    principalId: functionApp.outputs.functionAppIdentityPrincipalId
    principalType: 'ServicePrincipal'
    // Storage Blob Data Reader
    roleDefinitionId: '2a2b9908-6ea1-4ae2-8e65-a410df84e7d1'
  }
}

// Outputs for azd
output AZURE_LOCATION string = location
output AZURE_TENANT_ID string = tenantId
output STORAGE_ACCOUNT_NAME string = storage.outputs.storageAccountName
output FUNCTION_APP_NAME string = functionApp.outputs.functionAppName
output FUNCTION_APP_URL string = functionApp.outputs.functionAppUrl
output FUNCTION_APP_CLIENT_ID string = functionApp.outputs.appRegistrationClientId
output TEAM1_CONTRIBUTOR_GROUP_ID string = adGroups.outputs.team1ContributorGroupId
output TEAM1_CONTRIBUTOR_GROUP_NAME string = adGroups.outputs.team1ContributorGroupName
output TEAM2_CONTRIBUTOR_GROUP_ID string = adGroups.outputs.team2ContributorGroupId
output TEAM2_CONTRIBUTOR_GROUP_NAME string = adGroups.outputs.team2ContributorGroupName
output TEAM3_CONTRIBUTOR_GROUP_ID string = adGroups.outputs.team3ContributorGroupId
output TEAM3_CONTRIBUTOR_GROUP_NAME string = adGroups.outputs.team3ContributorGroupName
output TEAM1_READER_GROUP_ID string = adGroups.outputs.team1ReaderGroupId
output TEAM1_READER_GROUP_NAME string = adGroups.outputs.team1ReaderGroupName
output TEAM2_READER_GROUP_ID string = adGroups.outputs.team2ReaderGroupId
output TEAM2_READER_GROUP_NAME string = adGroups.outputs.team2ReaderGroupName
output TEAM3_READER_GROUP_ID string = adGroups.outputs.team3ReaderGroupId
output TEAM3_READER_GROUP_NAME string = adGroups.outputs.team3ReaderGroupName
output API_URI string = functionApp.outputs.functionAppUrl
