import { betterAuth } from "better-auth";
import pg from "pg";
import dns from "dns";
import "dotenv/config";

// Force IPv4 DNS resolution — Supabase doesn't accept IPv6 connections,
// and Railway's DNS resolves to IPv6 first, causing ECONNREFUSED.
dns.setDefaultResultOrder("ipv4first");

  export const auth = betterAuth({
    database: new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    }),
    emailAndPassword: {
      enabled: true,
    },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID as string,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      },
    },
  });
