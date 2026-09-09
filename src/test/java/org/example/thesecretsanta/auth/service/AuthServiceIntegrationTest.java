package org.example.thesecretsanta.auth.service;

import org.example.thesecretsanta.auth.dao.PasswordResetTokenRepository;
import org.example.thesecretsanta.auth.dto.AuthResponse;
import org.example.thesecretsanta.auth.dto.ForgotPasswordRequest;
import org.example.thesecretsanta.auth.dto.LoginRequest;
import org.example.thesecretsanta.auth.dto.RegisterRequest;
import org.example.thesecretsanta.auth.dto.ResetPasswordRequest;
import org.example.thesecretsanta.auth.domain.PasswordResetToken;
import org.example.thesecretsanta.user.dao.UserRepository;
import org.example.thesecretsanta.user.dto.ProfileResponse;
import org.example.thesecretsanta.user.dto.UpdateProfileRequest;
import org.example.thesecretsanta.user.service.UserService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class AuthServiceIntegrationTest {
    @Autowired
    private AuthService authService;

    @Autowired
    private UserService userService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordResetTokenRepository resetTokenRepository;

    @Test
    void registerCreatesUserAndAllowsLoginByDisplayName() {
        AuthResponse registered = authService.register(new RegisterRequest(
                "ilia@example.com",
                "secret123",
                "Илья"
        ));

        AuthResponse loggedIn = authService.login(new LoginRequest("Илья", "secret123"));

        assertThat(loggedIn.userId()).isEqualTo(registered.userId());
        assertThat(loggedIn.displayName()).isEqualTo("Илья");
        assertThat(loggedIn.email()).isEqualTo("ilia@example.com");
        assertThat(loggedIn.token()).isNotBlank();
    }

    @Test
    void registerRejectsDuplicateEmailAndDuplicateDisplayName() {
        authService.register(new RegisterRequest("first@example.com", "secret123", "Валера"));

        assertThatThrownBy(() -> authService.register(new RegisterRequest("first@example.com", "secret123", "Другое имя")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Email is already registered");

        assertThatThrownBy(() -> authService.register(new RegisterRequest("second@example.com", "secret123", "валера")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Name is already taken");
    }

    @Test
    void profileRenameUpdatesLoginNameAndReturnsFreshToken() {
        AuthResponse registered = authService.register(new RegisterRequest(
                "profile@example.com",
                "secret123",
                "Старое Имя"
        ));

        ProfileResponse updated = userService.updateProfile(
                new UpdateProfileRequest("Новое Имя", null),
                userRepository.findById(registered.userId()).orElseThrow()
        );

        AuthResponse loggedIn = authService.login(new LoginRequest("Новое Имя", "secret123"));

        assertThat(updated.displayName()).isEqualTo("Новое Имя");
        assertThat(updated.login()).isEqualTo("новое имя");
        assertThat(updated.token()).isNotBlank();
        assertThat(loggedIn.userId()).isEqualTo(registered.userId());
    }

    @Test
    void passwordResetChangesPasswordAndConsumesResetToken() {
        authService.register(new RegisterRequest("reset@example.com", "oldSecret123", "Reset User"));
        authService.forgotPassword(new ForgotPasswordRequest("reset@example.com"));
        PasswordResetToken resetToken = resetTokenRepository.findAll().stream()
                .filter(token -> token.getUser().getEmail().equals("reset@example.com"))
                .findFirst()
                .orElseThrow();

        authService.resetPassword(new ResetPasswordRequest(resetToken.getToken(), "newSecret123"));

        assertThat(authService.login(new LoginRequest("Reset User", "newSecret123")).email())
                .isEqualTo("reset@example.com");
        assertThatThrownBy(() -> authService.login(new LoginRequest("Reset User", "oldSecret123")))
                .isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> authService.resetPassword(new ResetPasswordRequest(resetToken.getToken(), "anotherSecret123")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Password reset link is invalid or expired");
    }

    @Test
    void forgotPasswordInvalidatesPreviousUnusedResetToken() {
        authService.register(new RegisterRequest("rotate-reset@example.com", "secret123", "Rotate Reset"));

        authService.forgotPassword(new ForgotPasswordRequest("rotate-reset@example.com"));
        String firstToken = resetTokenRepository.findAll().stream()
                .filter(token -> token.getUser().getEmail().equals("rotate-reset@example.com"))
                .findFirst()
                .orElseThrow()
                .getToken();

        authService.forgotPassword(new ForgotPasswordRequest("rotate-reset@example.com"));

        assertThat(resetTokenRepository.findByToken(firstToken)).isEmpty();
        assertThat(resetTokenRepository.findAll().stream()
                .filter(token -> token.getUser().getEmail().equals("rotate-reset@example.com")))
                .hasSize(1);
    }
}
