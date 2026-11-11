package org.example.thesecretsanta.clerk;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.jsonwebtoken.Jwts;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigInteger;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ClerkTokenVerifierTest {
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String SITE = "http://localhost:5173";

    private KeyPair keyPair;
    private ClerkTokenVerifier verifier;
    private int jwksFetches;

    @BeforeEach
    void setUp() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        keyPair = generator.generateKeyPair();
        ClerkProperties properties = new ClerkProperties("sk_test_key", null, List.of(SITE));
        ClerkClient client = new ClerkClient(properties, MAPPER) {
            @Override
            public JsonNode fetchJwks() {
                jwksFetches++;
                RSAPublicKey publicKey = (RSAPublicKey) keyPair.getPublic();
                ObjectNode jwk = MAPPER.createObjectNode()
                        .put("kid", "ins_key_1")
                        .put("kty", "RSA")
                        .put("alg", "RS256")
                        .put("n", base64Url(publicKey.getModulus()))
                        .put("e", base64Url(publicKey.getPublicExponent()));
                ObjectNode jwks = MAPPER.createObjectNode();
                jwks.putArray("keys").add(jwk);
                return jwks;
            }
        };
        verifier = new ClerkTokenVerifier(client, properties);
    }

    @Test
    void acceptsValidTokenAndCachesKeys() {
        ClerkSession session = verifier.verify(token("ins_key_1", SITE, Instant.now().plusSeconds(60)));
        ClerkSession again = verifier.verify(token("ins_key_1", SITE, Instant.now().plusSeconds(60)));

        assertThat(session.userId()).isEqualTo("user_123");
        assertThat(session.sessionId()).isEqualTo("sess_1");
        assertThat(again.userId()).isEqualTo("user_123");
        assertThat(jwksFetches).isEqualTo(1);
    }

    @Test
    void rejectsExpiredToken() {
        assertThatThrownBy(() -> verifier.verify(token("ins_key_1", SITE, Instant.now().minusSeconds(120))))
                .isInstanceOf(ClerkAuthException.class)
                .hasMessageContaining("invalid or expired");
    }

    @Test
    void rejectsTokenForAnotherSite() {
        assertThatThrownBy(() -> verifier.verify(token("ins_key_1", "https://evil.example", Instant.now().plusSeconds(60))))
                .isInstanceOf(ClerkAuthException.class)
                .hasMessageContaining("another site");
    }

    @Test
    void rejectsTokenSignedWithUnknownKey() {
        assertThatThrownBy(() -> verifier.verify(token("ins_other", SITE, Instant.now().plusSeconds(60))))
                .isInstanceOf(ClerkAuthException.class)
                .hasMessageContaining("unknown key");
    }

    @Test
    void rejectsGarbage() {
        assertThatThrownBy(() -> verifier.verify("not-a-jwt"))
                .isInstanceOf(ClerkAuthException.class);
        assertThatThrownBy(() -> verifier.verify(null))
                .isInstanceOf(ClerkAuthException.class)
                .hasMessageContaining("missing");
    }

    @Test
    void reportsMissingConfiguration() {
        ClerkProperties empty = new ClerkProperties("", null, List.of());
        ClerkTokenVerifier unconfigured = new ClerkTokenVerifier(new ClerkClient(empty, MAPPER), empty);

        assertThatThrownBy(() -> unconfigured.verify("anything"))
                .isInstanceOf(ClerkAuthException.class)
                .matches(ex -> ((ClerkAuthException) ex).isNotConfigured());
    }

    private String token(String keyId, String authorizedParty, Instant expiresAt) {
        return Jwts.builder()
                .header().keyId(keyId).and()
                .subject("user_123")
                .claim("sid", "sess_1")
                .claim("azp", authorizedParty)
                .issuedAt(Date.from(Instant.now().minusSeconds(5)))
                .expiration(Date.from(expiresAt))
                .signWith(keyPair.getPrivate(), Jwts.SIG.RS256)
                .compact();
    }

    private static String base64Url(BigInteger value) {
        byte[] bytes = value.toByteArray();
        if (bytes.length > 1 && bytes[0] == 0) {
            byte[] trimmed = new byte[bytes.length - 1];
            System.arraycopy(bytes, 1, trimmed, 0, trimmed.length);
            bytes = trimmed;
        }
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
