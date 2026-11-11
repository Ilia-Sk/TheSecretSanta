package org.example.thesecretsanta.clerk;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Locale;

/**
 * Minimal client for the Clerk Backend API (https://clerk.com/docs/reference/backend-api).
 * Only two calls are needed: the JWKS that signs session tokens and a user record.
 */
@Component
public class ClerkClient {
    private final ClerkProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    public ClerkClient(ClerkProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    /** JSON Web Key Set of the Clerk instance: {"keys": [{"kid", "kty", "n", "e", ...}]}. */
    public JsonNode fetchJwks() {
        return get("/jwks");
    }

    public ClerkUser fetchUser(String userId) {
        return parseUser(get("/users/" + URLEncoder.encode(userId, StandardCharsets.UTF_8)));
    }

    /** Maps a Backend API user object (https://clerk.com/docs/reference/backend-api/tag/users). */
    static ClerkUser parseUser(JsonNode user) {
        String primaryEmailId = text(user, "primary_email_address_id");
        String email = null;
        boolean verified = false;
        for (JsonNode address : user.path("email_addresses")) {
            boolean primary = primaryEmailId == null || primaryEmailId.equals(text(address, "id"));
            if (!primary) {
                continue;
            }
            email = text(address, "email_address");
            verified = "verified".equals(address.path("verification").path("status").asText());
            break;
        }

        String imageUrl = user.path("has_image").asBoolean(false) ? text(user, "image_url") : null;
        return new ClerkUser(
                text(user, "id"),
                email == null ? null : email.trim().toLowerCase(Locale.ROOT),
                verified,
                text(user, "username"),
                text(user, "first_name"),
                text(user, "last_name"),
                text(user.path("unsafe_metadata"), "login"),
                imageUrl
        );
    }

    private JsonNode get(String path) {
        if (!properties.configured()) {
            throw ClerkAuthException.notConfigured();
        }
        HttpRequest request = HttpRequest.newBuilder(URI.create(properties.apiUrl() + path))
                .header("Authorization", "Bearer " + properties.secretKey())
                .header("Accept", "application/json")
                .timeout(Duration.ofSeconds(10))
                .GET()
                .build();
        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 401 || response.statusCode() == 403) {
                throw new ClerkAuthException("Clerk rejected CLERK_SECRET_KEY (HTTP " + response.statusCode() + ")");
            }
            if (response.statusCode() >= 400) {
                throw new ClerkAuthException("Clerk API error: HTTP " + response.statusCode() + " for " + path);
            }
            return objectMapper.readTree(response.body());
        } catch (IOException ex) {
            throw new ClerkAuthException("Clerk API is unreachable", ex);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new ClerkAuthException("Clerk API call was interrupted", ex);
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (value.isMissingNode() || value.isNull()) {
            return null;
        }
        String text = value.asText();
        return text.isBlank() ? null : text;
    }
}
