package org.example.thesecretsanta.clerk;

/**
 * The part of a Clerk user record the app needs.
 *
 * @param id             Clerk user id ("user_...").
 * @param email          Primary email address, lower-cased; null if the account has none.
 * @param emailVerified  Whether Clerk verified that email (code from the letter or Google).
 * @param username       Clerk username, if usernames are enabled in the Clerk dashboard.
 * @param metadataLogin  Login chosen on our sign-up form (stored in unsafe_metadata.login).
 * @param imageUrl       Profile photo URL, null when the user has no photo.
 */
public record ClerkUser(
        String id,
        String email,
        boolean emailVerified,
        String username,
        String firstName,
        String lastName,
        String metadataLogin,
        String imageUrl
) {
}
