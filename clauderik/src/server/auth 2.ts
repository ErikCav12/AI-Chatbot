import { betterAuth } from "better-auth";                                                                                                                               
import pg from "pg";                                                                                                                                                  
import "dotenv/config";                                                                                                                                                 
                                                                                                                                                                          
  export const auth = betterAuth({                                                                                                                                        
    database: new pg.Pool({
      connectionString: process.env.DATABASE_URL,
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