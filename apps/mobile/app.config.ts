import type { ConfigContext, ExpoConfig } from "expo/config";

type AppVariant = "development" | "preview" | "production";

const variants: Record<AppVariant, { name: string; identifier: string; scheme: string }> = {
  development: {
    name: "Yaqeen Dev",
    identifier: "market.yaqeen.app.dev",
    scheme: "yaqeen-dev",
  },
  preview: {
    name: "Yaqeen Preview",
    identifier: "market.yaqeen.app.preview",
    scheme: "yaqeen-preview",
  },
  production: {
    name: "Yaqeen Market",
    identifier: "market.yaqeen.app",
    scheme: "yaqeen",
  },
};

function appVariant(): AppVariant {
  const requested = process.env.APP_VARIANT ?? "development";
  if (requested in variants) return requested as AppVariant;
  throw new Error(`Unsupported APP_VARIANT: ${requested}`);
}

const defineAppConfig = ({ config }: ConfigContext): ExpoConfig => {
  const variant = appVariant();
  const identity = variants[variant];

  return {
    ...config,
    name: identity.name,
    slug: "yaqeen-market",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: identity.scheme,
    userInterfaceStyle: "light",
    ios: {
      bundleIdentifier: identity.identifier,
      supportsTablet: false,
      icon: "./assets/expo.icon",
      infoPlist: {
        CFBundleAllowMixedLocalizations: true,
        CFBundleLocalizations: ["fr"],
      },
      config: {
        usesNonExemptEncryption: false,
      },
    },
    android: {
      package: identity.identifier,
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      predictiveBackGestureEnabled: false,
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      "expo-router",
      ["expo-dev-client", { addGeneratedScheme: variant === "development" }],
      [
        "expo-splash-screen",
        {
          backgroundColor: "#092B5D",
          image: "./assets/images/splash-icon.png",
          imageWidth: 76,
        },
      ],
      ["expo-secure-store", { configureAndroidBackup: true }],
      "expo-image",
      "expo-status-bar",
      "expo-web-browser",
      ["@stripe/stripe-react-native", { enableGooglePay: false }],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      appVariant: variant,
    },
  };
};

export default defineAppConfig;
