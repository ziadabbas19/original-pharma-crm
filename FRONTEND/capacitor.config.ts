import type { CapacitorConfig } from '@capacitor/cli'

// Set CAP_DEV_HTTP=1 when syncing a debug build that talks to a plain-http API
// (e.g. http://10.0.2.2:5080 from the Android emulator). Never for release builds.
const allowHttp = process.env.CAP_DEV_HTTP === '1'

const config: CapacitorConfig = {
  appId: 'com.originalpharma.crm',
  appName: 'Original Pharma',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: allowHttp,
  },
  android: {
    allowMixedContent: allowHttp,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['alert', 'sound'],
    },
  },
}

export default config
