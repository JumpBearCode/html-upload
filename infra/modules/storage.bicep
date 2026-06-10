param location string
param storageAccountName string
param tags object = {}

// AD Group IDs for role assignments
param team1ContributorGroupId string
param team2ContributorGroupId string
param team3ContributorGroupId string
param team1ReaderGroupId string
param team2ReaderGroupId string
param team3ReaderGroupId string

var containerNames = ['team1', 'team2', 'team3']

// Storage Blob Data Contributor role
var storageBlobDataContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
// Storage Blob Data Reader role
var storageBlobDataReaderRoleId = '2a2b9908-6ea1-4ae2-8e65-a410df84e7d1'

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
}

resource containers 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = [
  for name in containerNames: {
    parent: blobService
    name: name
    properties: {
      publicAccess: 'None'
    }
  }
]

// Role assignments are scoped to each team's CONTAINER (not the storage
// account) for least privilege: a team can only touch its own container.
// containers[0]=team1, containers[1]=team2, containers[2]=team3.

// --- Contributor role assignments (upload access) ---
resource team1ContributorRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(containers[0].id, team1ContributorGroupId, storageBlobDataContributorRoleId)
  scope: containers[0]
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRoleId)
    principalId: team1ContributorGroupId
    principalType: 'Group'
    description: 'Team 1 Contributor - upload HTML to team1 container'
  }
}

resource team2ContributorRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(containers[1].id, team2ContributorGroupId, storageBlobDataContributorRoleId)
  scope: containers[1]
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRoleId)
    principalId: team2ContributorGroupId
    principalType: 'Group'
    description: 'Team 2 Contributor - upload HTML to team2 container'
  }
}

resource team3ContributorRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(containers[2].id, team3ContributorGroupId, storageBlobDataContributorRoleId)
  scope: containers[2]
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRoleId)
    principalId: team3ContributorGroupId
    principalType: 'Group'
    description: 'Team 3 Contributor - upload HTML to team3 container'
  }
}

// --- Reader role assignments (for Portal browsing, not for Function App serving) ---
resource team1ReaderRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(containers[0].id, team1ReaderGroupId, storageBlobDataReaderRoleId)
  scope: containers[0]
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataReaderRoleId)
    principalId: team1ReaderGroupId
    principalType: 'Group'
    description: 'Team 1 Reader - view HTML from team1 container via Function App'
  }
}

resource team2ReaderRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(containers[1].id, team2ReaderGroupId, storageBlobDataReaderRoleId)
  scope: containers[1]
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataReaderRoleId)
    principalId: team2ReaderGroupId
    principalType: 'Group'
    description: 'Team 2 Reader - view HTML from team2 container via Function App'
  }
}

resource team3ReaderRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(containers[2].id, team3ReaderGroupId, storageBlobDataReaderRoleId)
  scope: containers[2]
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataReaderRoleId)
    principalId: team3ReaderGroupId
    principalType: 'Group'
    description: 'Team 3 Reader - view HTML from team3 container via Function App'
  }
}

output storageAccountName string = storageAccount.name
output storageAccountId string = storageAccount.id
