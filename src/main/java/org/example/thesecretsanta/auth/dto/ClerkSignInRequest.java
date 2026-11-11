package org.example.thesecretsanta.auth.dto;

import jakarta.validation.constraints.Size;

/**
 * Body of POST /api/auth/clerk. The Clerk session token itself goes in the Authorization header.
 *
 * @param login login for a brand-new account (needed when Clerk does not know it yet, e.g. after Google sign-up)
 */
public record ClerkSignInRequest(
        @Size(max = 60) String login
) {
}
