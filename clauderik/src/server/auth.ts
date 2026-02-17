import { betterAuth } from "better-auth";
import "dotenv/config";

  export const auth = betterAuth({
    database: {
      connectionString: process.env.DATABASE_URL,
      type: "postgres",
    },
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
