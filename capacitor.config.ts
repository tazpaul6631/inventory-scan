import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.srcvip.app',
  appName: 'Inventory Scan',
  webDir: 'dist',
  server: {
    // HTTP page so the WebView can call an HTTP API (https://localhost + http://API = mixed content).
    androidScheme: 'http',
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#0f172a',
    },
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      iosIsEncryption: false,
      androidIsEncryption: false,
      electronIsEncryption: false,
      electronWindowsLocation: 'C:\\ProgramData\\Inventory Scan\\Databases',
      electronMacLocation: 'Databases',
      electronLinuxLocation: 'Databases',
    },
  },
}

export default config
