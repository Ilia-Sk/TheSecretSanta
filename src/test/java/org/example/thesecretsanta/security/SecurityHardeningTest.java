package org.example.thesecretsanta.security;

import org.example.thesecretsanta.config.ProductionSecurityValidator;
import org.example.thesecretsanta.config.SecurityProperties;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Checks for the fixes from the security review. */
class SecurityHardeningTest {

    // ---------------------------------------------------------------- rate limits

    @Test
    void signInAttemptsAreLimitedPerAddress() throws Exception {
        RateLimitFilter filter = new RateLimitFilter(true);
        for (int i = 0; i < 10; i++) {
            assertThat(call(filter, "POST", "/api/auth/clerk", "203.0.113.5").getStatus()).isEqualTo(200);
        }
        MockHttpServletResponse blocked = call(filter, "POST", "/api/auth/clerk", "203.0.113.5");
        assertThat(blocked.getStatus()).isEqualTo(429);
        assertThat(blocked.getHeader("Retry-After")).isEqualTo("60");
        // another address is not affected
        assertThat(call(filter, "POST", "/api/auth/clerk", "203.0.113.6").getStatus()).isEqualTo(200);
    }

    @Test
    void chatPollingStaysWellUnderTheGeneralLimit() throws Exception {
        RateLimitFilter filter = new RateLimitFilter(true);
        // a minute of an open chat: messages every 3 s + dialogs every 8 s ≈ 28 requests
        for (int i = 0; i < 60; i++) {
            assertThat(call(filter, "GET", "/api/chats/1/messages", "203.0.113.7").getStatus()).isEqualTo(200);
        }
    }

    @Test
    void forwardedAddressIsTrustedOnlyFromOurProxy() {
        MockHttpServletRequest viaProxy = new MockHttpServletRequest("GET", "/api/rooms");
        viaProxy.setRemoteAddr("172.18.0.4");
        viaProxy.addHeader("X-Forwarded-For", "198.51.100.9, 172.18.0.3");
        assertThat(RateLimitFilter.clientIp(viaProxy)).isEqualTo("198.51.100.9");

        MockHttpServletRequest direct = new MockHttpServletRequest("GET", "/api/rooms");
        direct.setRemoteAddr("198.51.100.20");
        direct.addHeader("X-Forwarded-For", "1.2.3.4");
        assertThat(RateLimitFilter.clientIp(direct)).isEqualTo("198.51.100.20");
    }

    private static MockHttpServletResponse call(RateLimitFilter filter, String method, String uri, String ip) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest(method, uri);
        request.setRequestURI(uri);
        request.setRemoteAddr(ip);
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        return response;
    }

    // ---------------------------------------------------------------- production checks

    @Test
    void productionRefusesWildcardCors() {
        MockEnvironment environment = new MockEnvironment().withProperty("app.cors.allowed-origins", "*");
        environment.setActiveProfiles("prod");
        ProductionSecurityValidator validator = new ProductionSecurityValidator(
                environment, new SecurityProperties("a".repeat(64), 86_400_000));
        assertThatThrownBy(() -> validator.run(null)).hasMessageContaining("CORS_ALLOWED_ORIGINS");
    }

    @Test
    void productionRefusesShortJwtSecretAndPasswordSignIn() {
        MockEnvironment shortSecret = new MockEnvironment().withProperty("app.cors.allowed-origins", "https://example.by");
        shortSecret.setActiveProfiles("prod");
        assertThatThrownBy(() -> new ProductionSecurityValidator(shortSecret, new SecurityProperties("short", 1)).run(null))
                .hasMessageContaining("at least 32");

        MockEnvironment passwords = new MockEnvironment()
                .withProperty("app.cors.allowed-origins", "https://example.by")
                .withProperty("app.security.password-auth-enabled", "true");
        passwords.setActiveProfiles("prod");
        assertThatThrownBy(() -> new ProductionSecurityValidator(passwords, new SecurityProperties("a".repeat(64), 1)).run(null))
                .hasMessageContaining("Password sign-in");
    }

    @Test
    void productionRefusesDevelopmentDatabasePassword() {
        MockEnvironment environment = new MockEnvironment()
                .withProperty("app.cors.allowed-origins", "https://example.by")
                .withProperty("spring.datasource.password", "santa_password");
        environment.setActiveProfiles("prod");
        assertThatThrownBy(() -> new ProductionSecurityValidator(environment, new SecurityProperties("a".repeat(64), 1)).run(null))
                .hasMessageContaining("database password");
    }

    @Test
    void productionStartsWithProperSettings() {
        MockEnvironment environment = new MockEnvironment().withProperty("app.cors.allowed-origins", "https://thesecretsanta.by");
        environment.setActiveProfiles("prod");
        assertThatCode(() -> new ProductionSecurityValidator(environment, new SecurityProperties("a".repeat(64), 1)).run(null))
                .doesNotThrowAnyException();
    }

    // ---------------------------------------------------------------- legacy password sign-in

    @Nested
    @SpringBootTest
    @AutoConfigureMockMvc
    @ActiveProfiles("test")
    @TestPropertySource(properties = "app.security.password-auth-enabled=false")
    class PasswordSignInIsOff {
        @Autowired
        MockMvc mockMvc;

        @Test
        void unverifiedRegistrationAndLoginAreClosed() throws Exception {
            mockMvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                            .content("{\"email\":\"victim@example.com\",\"displayName\":\"Attacker\",\"password\":\"secret123\"}"))
                    .andExpect(status().isNotFound());
            mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                            .content("{\"login\":\"Attacker\",\"password\":\"secret123\"}"))
                    .andExpect(status().isNotFound());
            mockMvc.perform(post("/api/auth/forgot-password").contentType(MediaType.APPLICATION_JSON)
                            .content("{\"email\":\"victim@example.com\"}"))
                    .andExpect(status().isNotFound());
        }

        @Test
        void apiResponsesCarrySecurityHeaders() throws Exception {
            mockMvc.perform(post("/api/rooms").contentType(MediaType.APPLICATION_JSON).content("{}"))
                    .andExpect(status().isUnauthorized())
                    .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                    .andExpect(header().string("X-Frame-Options", "DENY"));
        }
    }
}
