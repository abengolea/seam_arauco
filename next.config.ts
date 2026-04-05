import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const firestoreDatabaseId =
  process.env.NEXT_PUBLIC_FIREBASE_FIRESTORE_DATABASE_ID?.trim() ?? "";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
  serverExternalPackages: ["firebase-admin", "genkit", "@genkit-ai/core", "@genkit-ai/ai"],
  allowedDevOrigins: ["192.168.100.195"],
  env: {
    NEXT_PUBLIC_FIREBASE_FIRESTORE_DATABASE_ID: firestoreDatabaseId,
  },
};

export default nextConfig;
