import { betterAuth } from "better-auth";                                                                                                                               
import pg from "pg";                                                                                                                                                  
import "dotenv/config";

// temporary debug — remove after fixing
const _db = process.env.DATABASE_URL || "";
console.log("DB_URL check:", _db.replace(/\/\/(.+?):(.+?)@/, (_, u, p) => `//${u}:${"*".repeat(p.length)}@`));

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