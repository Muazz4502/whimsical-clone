/* Whimsical Clone: connection settings for Google Drive.
   Fill these in once (SETUP.md). Client IDs and browser API keys are designed to be visible in
   web pages; protect them with authorized origins / referrers in Google Cloud Console.
   Leave googleClientId empty to run in "this browser only" mode. */
window.MINDMAP_CONFIG = {
  // OAuth 2.0 Client ID of type "Web application", e.g. 1234567890-abc123.apps.googleusercontent.com
  googleClientId: '',

  // Optional, but needed to open boards that other people share with you (Google Picker):
  googleApiKey: '',   // API key restricted to the "Google Picker API" and to your web addresses
  googleAppId: '',    // Google Cloud project NUMBER (digits only, from the project dashboard)

  // drive.file = the app can only see files it created or that the user picked. No Google review needed.
  scope: 'https://www.googleapis.com/auth/drive.file',
  folderName: 'Whimsical Clone',         // folder created in each user's My Drive
  pollSeconds: 20                       // how often to check Drive for changes made elsewhere
};
