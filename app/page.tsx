// src/app/page.tsx — minimaler Test
"use client";

import { authClient } from "@/lib/auth-client";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function Home() {
  const user = useQuery(api.auth.getCurrentUser);

// user === undefined → Query lädt noch
// user === null → Nicht eingeloggt
// user === { id, name, email, ... } → Eingeloggt

  return (
    <div>
      <h1>LemonSpace</h1>
      {user ? (
        <div>
          <p>Eingeloggt als: {user.name}</p>
          <button onClick={() => authClient.signOut()}>Logout</button>
        </div>
      ) : (
        <button
          onClick={() =>
            authClient.signUp.email({
              email: "test@lemonspace.io",
              password: "test1234",
              name: "Test User",
            })
          }
        >
          Test Signup
        </button>
      )}
    </div>
  );
}
