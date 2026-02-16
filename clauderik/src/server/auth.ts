import { betterAuth } from "better-auth";                                                                                                                               
import pg from "pg";                                                                                                                                                  
import "dotenv/config";

// temporary debug — remove after fixing
const _db = process.env.DATABASE_URL || "";
const _pw = _db.match(/:\/\/.+?:(.+?)@/)?.[1] || "";
console.log("DB_URL check:", _db.replace(/\/\/(.+?):(.+?)@/, (_, u, p) => `//${u}:${"*".repeat(p.length)}@`));
console.log("Password length:", _pw.length, "| first char:", _pw[0], "| last char:", _pw[_pw.length - 1]);

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