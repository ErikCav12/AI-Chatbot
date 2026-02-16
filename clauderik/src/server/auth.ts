import { betterAuth } from "better-auth";
import pg from "pg";
import "dotenv/config";

// Parse DATABASE_URL into individual params for reliable connections
const dbUrl = new URL(process.env.DATABASE_URL || "");

  export const auth = betterAuth({
    database: new pg.Pool({
      host: dbUrl.hostname,
      port: Number(dbUrl.port) || 5432,
      user: dbUrl.username,
      password: decodeURIComponent(dbUrl.password),
      database: dbUrl.pathname.slice(1),
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
