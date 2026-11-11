package org.example.thesecretsanta.clerk;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

/**
 * Clerk (clerk.com) settings.
 *
 * @param secretKey          Secret key of the Clerk instance (CLERK_SECRET_KEY, "sk_test_..." / "sk_live_...").
 *                           Used to call the Clerk Backend API: the JWKS that signs session tokens and the user record.
 * @param apiUrl             Clerk Backend API base URL.
 * @param authorizedParties  Allowed values of the token "azp" claim (the frontend origin, e.g. http://localhost:5173).
 *                           Empty list — the check is skipped.
 */
@ConfigurationProperties(prefix = "app.clerk")
public record ClerkProperties(
        String secretKey,
        String apiUrl,
        List<String> authorizedParties
) {
    public ClerkProperties {
        if (apiUrl == null || apiUrl.isBlank()) {
            apiUrl = "https://api.clerk.com/v1";
        }
        authorizedParties = authorizedParties == null
                ? List.of()
                : authorizedParties.stream().map(String::trim).filter(value -> !value.isEmpty()).toList();
    }

    public boolean configured() {
        return secretKey != null && !secretKey.isBlank();
    }
}
