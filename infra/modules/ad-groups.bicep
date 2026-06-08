extension microsoftGraph

@description('Environment name used as prefix for AD group names')
param environmentName string

// Team 1 - Contributor (upload) group
resource team1ContributorGroup 'Microsoft.Graph/groups@v1.0' = {
  displayName: '${environmentName}-team1-contributor'
  mailEnabled: false
  mailNickname: '${environmentName}-team1-contributor'
  securityEnabled: true
  uniqueName: '${environmentName}-team1-contributor'
  description: 'Members can upload HTML files to the team1 container'
}

// Team 2 - Contributor (upload) group
resource team2ContributorGroup 'Microsoft.Graph/groups@v1.0' = {
  displayName: '${environmentName}-team2-contributor'
  mailEnabled: false
  mailNickname: '${environmentName}-team2-contributor'
  securityEnabled: true
  uniqueName: '${environmentName}-team2-contributor'
  description: 'Members can upload HTML files to the team2 container'
}

// Team 3 - Contributor (upload) group
resource team3ContributorGroup 'Microsoft.Graph/groups@v1.0' = {
  displayName: '${environmentName}-team3-contributor'
  mailEnabled: false
  mailNickname: '${environmentName}-team3-contributor'
  securityEnabled: true
  uniqueName: '${environmentName}-team3-contributor'
  description: 'Members can upload HTML files to the team3 container'
}

// Team 1 - Reader (view HTML) group
resource team1ReaderGroup 'Microsoft.Graph/groups@v1.0' = {
  displayName: '${environmentName}-team1-reader'
  mailEnabled: false
  mailNickname: '${environmentName}-team1-reader'
  securityEnabled: true
  uniqueName: '${environmentName}-team1-reader'
  description: 'Members can view HTML files from the team1 container'
}

// Team 2 - Reader (view HTML) group
resource team2ReaderGroup 'Microsoft.Graph/groups@v1.0' = {
  displayName: '${environmentName}-team2-reader'
  mailEnabled: false
  mailNickname: '${environmentName}-team2-reader'
  securityEnabled: true
  uniqueName: '${environmentName}-team2-reader'
  description: 'Members can view HTML files from the team2 container'
}

// Team 3 - Reader (view HTML) group
resource team3ReaderGroup 'Microsoft.Graph/groups@v1.0' = {
  displayName: '${environmentName}-team3-reader'
  mailEnabled: false
  mailNickname: '${environmentName}-team3-reader'
  securityEnabled: true
  uniqueName: '${environmentName}-team3-reader'
  description: 'Members can view HTML files from the team3 container'
}

// Outputs - Contributor groups
output team1ContributorGroupId string = team1ContributorGroup.id
output team1ContributorGroupName string = team1ContributorGroup.displayName
output team2ContributorGroupId string = team2ContributorGroup.id
output team2ContributorGroupName string = team2ContributorGroup.displayName
output team3ContributorGroupId string = team3ContributorGroup.id
output team3ContributorGroupName string = team3ContributorGroup.displayName

// Outputs - Reader groups
output team1ReaderGroupId string = team1ReaderGroup.id
output team1ReaderGroupName string = team1ReaderGroup.displayName
output team2ReaderGroupId string = team2ReaderGroup.id
output team2ReaderGroupName string = team2ReaderGroup.displayName
output team3ReaderGroupId string = team3ReaderGroup.id
output team3ReaderGroupName string = team3ReaderGroup.displayName
