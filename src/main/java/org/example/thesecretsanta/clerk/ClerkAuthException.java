package org.example.thesecretsanta.clerk;

/** The Clerk session token is missing, invalid or expired, or Clerk is not configured. */
public class ClerkAuthException extends RuntimeException {
    private final boolean notConfigured;

    public ClerkAuthException(String message) {
        this(message, false, null);
    }

    public ClerkAuthException(String message, Throwable cause) {
        this(message, false, cause);
    }

    private ClerkAuthException(String message, boolean notConfigured, Throwable cause) {
        super(message, cause);
        this.notConfigured = notConfigured;
    }

    public static ClerkAuthException notConfigured() {
        return new ClerkAuthException("Clerk is not configured on the server: set CLERK_SECRET_KEY", true, null);
    }

    public boolean isNotConfigured() {
        return notConfigured;
    }
}
