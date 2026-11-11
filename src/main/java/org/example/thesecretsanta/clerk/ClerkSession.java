package org.example.thesecretsanta.clerk;

/** A verified Clerk session token: whose it is and which session issued it. */
public record ClerkSession(String userId, String sessionId) {
}
