import { betterAuth } from "better-auth";
import pg from "pg";
import dns from "dns";
import "dotenv/config";

// Parse the connection string into individual components so we can
// attach a custom DNS lookup that forces IPv4 resolution.
// Bun doesn't support dns.setDefaultResultOrder, so we use the pg
// Client lookup option instead.
const dbUrl = new URL(process.env.DATABASE_URL!);

  export const auth = betterAuth({
    database: new pg.Pool({
      host: dbUrl.hostname,
      port: Number(dbUrl.port) || 5432,
      database: dbUrl.pathname.slice(1),
      user: decodeURIComponent(dbUrl.username),
      password: decodeURIComponent(dbUrl.password),
      ssl: { rejectUnauthorized: false },
      // Force IPv4 — Supabase rejects IPv6 and Bun resolves to IPv6 first
      lookup: (hostname, options, callback) => {
        dns.lookup(hostname, { ...options, family: 4 }, callback);
      },
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
