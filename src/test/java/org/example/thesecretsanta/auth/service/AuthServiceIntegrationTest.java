package org.example.thesecretsanta.auth.service;

import org.example.thesecretsanta.auth.dto.AuthResponse;
import org.example.thesecretsanta.auth.dto.LoginRequest;
import org.example.thesecretsanta.auth.dto.RegisterRequest;
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
}
