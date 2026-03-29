import { betterAuth } from "better-auth";

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  url: process.env.BETTER_AUTH_URL,
  trustedOrigins: [
    "https://app.lemonspace.io",
    "http://localhost:3000",
  ],
});

