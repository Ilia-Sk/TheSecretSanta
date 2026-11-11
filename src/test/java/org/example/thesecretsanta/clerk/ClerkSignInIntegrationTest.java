package org.example.thesecretsanta.clerk;

import org.example.thesecretsanta.auth.dto.AuthResponse;
import org.example.thesecretsanta.auth.dto.ClerkSignInRequest;
import org.example.thesecretsanta.auth.dto.RegisterRequest;
import org.example.thesecretsanta.auth.service.AuthService;
import org.example.thesecretsanta.user.dao.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class ClerkSignInIntegrationTest {
    @Autowired
    private AuthService authService;

    @Autowired
    private UserRepository userRepository;

    @MockBean
    private ClerkTokenVerifier clerkTokenVerifier;

    @MockBean
    private ClerkClient clerkClient;

    @Test
    void createsAccountWithLoginFromSignUpAndSignsInAgainByClerkId() {
        when(clerkTokenVerifier.verify("token-1")).thenReturn(new ClerkSession("user_new", "sess_1"));
        when(clerkClient.fetchUser("user_new")).thenReturn(clerkUser("user_new", "new@example.com", true, "Снежана"));

        AuthResponse created = authService.signInWithClerk("token-1", null);
        AuthResponse again = authService.signInWithClerk("token-1", new ClerkSignInRequest(null));

        assertThat(created.email()).isEqualTo("new@example.com");
        assertThat(created.displayName()).isEqualTo("Снежана");
        assertThat(created.login()).isEqualTo("снежана");
        assertThat(created.token()).isNotBlank();
        assertThat(again.userId()).isEqualTo(created.userId());
        assertThat(userRepository.findByClerkId("user_new")).isPresent();
    }

    @Test
    void linksExistingAccountByVerifiedEmail() {
        AuthResponse legacy = authService.register(new RegisterRequest("old@example.com", "secret123", "Старый Друг"));
        when(clerkTokenVerifier.verify("token-2")).thenReturn(new ClerkSession("user_old", "sess_2"));
        when(clerkClient.fetchUser("user_old")).thenReturn(clerkUser("user_old", "old@example.com", true, null));

        AuthResponse linked = authService.signInWithClerk("token-2", null);

        assertThat(linked.userId()).isEqualTo(legacy.userId());
        assertThat(userRepository.findById(legacy.userId()).orElseThrow().getClerkId()).isEqualTo("user_old");
    }

    @Test
    void asksForLoginWhenClerkDoesNotKnowIt() {
        when(clerkTokenVerifier.verify("token-3")).thenReturn(new ClerkSession("user_google", "sess_3"));
        when(clerkClient.fetchUser("user_google")).thenReturn(clerkUser("user_google", "google@example.com", true, null));

        assertThatThrownBy(() -> authService.signInWithClerk("token-3", null))
                .isInstanceOf(LoginRequiredException.class);

        AuthResponse created = authService.signInWithClerk("token-3", new ClerkSignInRequest("Гугл Юзер"));
        assertThat(created.displayName()).isEqualTo("Гугл Юзер");
    }

    @Test
    void rejectsTakenLoginAndUnverifiedEmail() {
        authService.register(new RegisterRequest("taken@example.com", "secret123", "Занято"));
        when(clerkTokenVerifier.verify("token-4")).thenReturn(new ClerkSession("user_dup", "sess_4"));
        when(clerkClient.fetchUser("user_dup")).thenReturn(clerkUser("user_dup", "dup@example.com", true, "занято"));

        assertThatThrownBy(() -> authService.signInWithClerk("token-4", null))
                .isInstanceOf(LoginRequiredException.class)
                .hasMessage("Name is already taken");

        when(clerkTokenVerifier.verify("token-5")).thenReturn(new ClerkSession("user_unverified", "sess_5"));
        when(clerkClient.fetchUser("user_unverified")).thenReturn(clerkUser("user_unverified", "wait@example.com", false, "Ждун"));
        assertThatThrownBy(() -> authService.signInWithClerk("token-5", null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Email address is not verified yet");
    }

    @Test
    void invalidTokenNeverReachesClerkApi() {
        when(clerkTokenVerifier.verify("bad")).thenThrow(new ClerkAuthException("Clerk session token is invalid or expired"));

        assertThatThrownBy(() -> authService.signInWithClerk("bad", null))
                .isInstanceOf(ClerkAuthException.class);
        verify(clerkClient, never()).fetchUser(anyString());
    }

    private static ClerkUser clerkUser(String id, String email, boolean verified, String login) {
        return new ClerkUser(id, email, verified, null, null, null, login, null);
    }
}
