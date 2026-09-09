export default {
  expo: {
    name: "Fyll",
    slug: "fyll",
    scheme: "fyll",
    version: "2.0.0",
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    icon: "./assets/icon.png",
    splash: {
      image: "./assets/image-1767894092.png",
      resizeMode: "contain",
      backgroundColor: "#000000"
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.fyll.app"
    },
    android: {
      edgeToEdgeEnabled: true,
      package: "com.fyll.app",
      adaptiveIcon: {
        foregroundImage: "./assets/icon.png",
        backgroundColor: "#ffffff"
      }
    },
    web: {
      favicon: "./assets/image-1767894092.png",
      bundler: "metro",
      output: "static"
    },
    plugins: [
      "expo-router",
      "@react-native-community/datetimepicker",
      "expo-asset",
      "expo-build-properties",
      "expo-font",
      "expo-mail-composer",
      "expo-secure-store",
      "expo-sqlite",
      "expo-video",
      "expo-web-browser"
    ],
    experiments: {
      typedRoutes: true
    },
    // Add this section to inject environment variables
    extra: {
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      firebaseApiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
      firebaseAuthDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
      firebaseProjectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
      firebaseStorageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
      firebaseMessagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      firebaseAppId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
      firebaseDatabaseId: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_ID,
      onesignalAppId: process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID,
      onesignalSafariWebId: process.env.EXPO_PUBLIC_ONESIGNAL_SAFARI_WEB_ID,
      partnerOnesignalAppId: process.env.EXPO_PUBLIC_PARTNER_ONESIGNAL_APP_ID,
      partnerOnesignalSafariWebId: process.env.EXPO_PUBLIC_PARTNER_ONESIGNAL_SAFARI_WEB_ID,
    }
  }
};
