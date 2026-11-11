package org.example.thesecretsanta.clerk;

import com.fasterxml.jackson.databind.JsonNode;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Header;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.ProtectedHeader;
import org.springframework.stereotype.Component;

import java.math.BigInteger;
import java.security.GeneralSecurityException;
import java.security.Key;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.spec.RSAPublicKeySpec;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

/**
 * Verifies Clerk session tokens (RS256 JWT) against the instance JWKS.
 * Keys are cached; an unknown "kid" (key rotation) triggers a re-fetch, at most every 30 seconds.
 */
@Component
public class ClerkTokenVerifier {
    private static final Duration REFRESH_COOLDOWN = Duration.ofSeconds(30);
    private static final long CLOCK_SKEW_SECONDS = 10;

    private final ClerkClient clerkClient;
    private final ClerkProperties properties;
    private final Clock clock;

    private volatile Map<String, PublicKey> keys = Map.of();
    private volatile Instant loadedAt = Instant.EPOCH;

    // One constructor only, so Spring always knows how to create the bean.
    public ClerkTokenVerifier(ClerkClient clerkClient, ClerkProperties properties) {
        this.clerkClient = clerkClient;
        this.properties = properties;
        this.clock = Clock.systemUTC();
    }

    public ClerkSession verify(String token) {
        if (!properties.configured()) {
            throw ClerkAuthException.notConfigured();
        }
        if (token == null || token.isBlank()) {
            throw new ClerkAuthException("Clerk session token is missing");
        }

        Claims claims;
        try {
            claims = Jwts.parser()
                    .keyLocator(this::locateKey)
                    .clockSkewSeconds(CLOCK_SKEW_SECONDS)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
        } catch (ClerkAuthException ex) {
            throw ex;
        } catch (JwtException | IllegalArgumentException ex) {
            throw new ClerkAuthException("Clerk session token is invalid or expired", ex);
        }

        String userId = claims.getSubject();
        if (userId == null || userId.isBlank()) {
            throw new ClerkAuthException("Clerk session token has no subject");
        }
        String authorizedParty = claims.get("azp", String.class);
        if (!properties.authorizedParties().isEmpty()
                && (authorizedParty == null || !properties.authorizedParties().contains(authorizedParty))) {
            throw new ClerkAuthException("Clerk session token was issued for another site: " + authorizedParty);
        }
        return new ClerkSession(userId, claims.get("sid", String.class));
    }

    private Key locateKey(Header header) {
        String keyId = header instanceof ProtectedHeader protectedHeader ? protectedHeader.getKeyId() : null;
        if (keyId == null) {
            throw new ClerkAuthException("Clerk session token has no key id");
        }
        PublicKey key = keys.get(keyId);
        if (key == null && clock.instant().isAfter(loadedAt.plus(REFRESH_COOLDOWN))) {
            reloadKeys();
            key = keys.get(keyId);
        }
        if (key == null) {
            throw new ClerkAuthException("Clerk session token is signed with an unknown key");
        }
        return key;
    }

    private synchronized void reloadKeys() {
        JsonNode jwks = clerkClient.fetchJwks();
        Map<String, PublicKey> loaded = new HashMap<>();
        for (JsonNode jwk : jwks.path("keys")) {
            if (!"RSA".equals(jwk.path("kty").asText())) {
                continue;
            }
            try {
                BigInteger modulus = new BigInteger(1, Base64.getUrlDecoder().decode(jwk.path("n").asText()));
                BigInteger exponent = new BigInteger(1, Base64.getUrlDecoder().decode(jwk.path("e").asText()));
                PublicKey publicKey = KeyFactory.getInstance("RSA").generatePublic(new RSAPublicKeySpec(modulus, exponent));
                loaded.put(jwk.path("kid").asText(), publicKey);
            } catch (GeneralSecurityException | IllegalArgumentException ex) {
                throw new ClerkAuthException("Clerk JWKS contains an unreadable key", ex);
            }
        }
        keys = Map.copyOf(loaded);
        loadedAt = clock.instant();
    }
}
