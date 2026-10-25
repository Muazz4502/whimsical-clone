/* Branches Mind Mapper: connection settings for Google Drive.
   Fill these in once (SETUP.md, part 2). None of them is a password: Google designs Client IDs and
   browser API keys to be visible in web pages. They are protected by the web addresses you allow
   in Google Cloud Console, so this file can be committed and deployed as-is.
   Leave googleClientId empty to run the app in "this browser only" mode. */
window.MINDMAP_CONFIG = {
  // OAuth 2.0 Client ID of type "Web application", e.g. 1234567890-abc123.apps.googleusercontent.com
  googleClientId: '',

  // Optional, but needed to open boards that other people share with you (Google Picker):
  googleApiKey: '',   // API key restricted to the "Google Picker API" and to your web addresses
  googleAppId: '',    // Google Cloud project NUMBER (digits only, from the project dashboard)

  // drive.file = the app can only see files it created or that the user picked. No Google review needed.
  scope: 'https://www.googleapis.com/auth/drive.file',
  folderName: 'Branches Mind Mapper',   // folder created in each user's My Drive
  pollSeconds: 20                       // how often to check Drive for changes made elsewhere
};
