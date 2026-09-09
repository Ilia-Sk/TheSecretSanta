package org.example.thesecretsanta.user.service;

import org.example.thesecretsanta.auth.dto.RegisterRequest;
import org.example.thesecretsanta.auth.service.AuthService;
import org.example.thesecretsanta.user.dao.UserRepository;
import org.example.thesecretsanta.user.domain.User;
import org.example.thesecretsanta.user.dto.ProfileResponse;
import org.example.thesecretsanta.user.dto.UpdateProfileRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class UserServiceIntegrationTest {
    @Autowired
    private AuthService authService;

    @Autowired
    private UserService userService;

    @Autowired
    private UserRepository userRepository;

    @Test
    void updateProfileRejectsDisplayNameUsedByAnotherUser() {
        register("owner-name@example.com", "Existing Name");
        User currentUser = register("current-name@example.com", "Current Name");

        assertThatThrownBy(() -> userService.updateProfile(new UpdateProfileRequest("existing name", null), currentUser))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Name is already taken");
    }

    @Test
    void uploadAvatarStoresAllowedImageAndUpdatesProfile() {
        User user = register("avatar@example.com", "Avatar User");
        MockMultipartFile avatar = new MockMultipartFile(
                "file",
                "avatar.png",
                "image/png",
                new byte[]{1, 2, 3}
        );

        ProfileResponse profile = userService.uploadAvatar(avatar, user);

        assertThat(profile.avatarUrl()).startsWith("/uploads/avatars/" + user.getId() + "-");
        assertThat(profile.avatarUrl()).endsWith(".png");
    }

    @Test
    void uploadAvatarRejectsEmptyFile() {
        User user = register("empty-avatar@example.com", "Empty Avatar");
        MockMultipartFile avatar = new MockMultipartFile("file", "avatar.png", "image/png", new byte[0]);

        assertThatThrownBy(() -> userService.uploadAvatar(avatar, user))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Avatar file is empty");
    }

    @Test
    void uploadAvatarRejectsUnsupportedContentType() {
        User user = register("bad-avatar@example.com", "Bad Avatar");
        MockMultipartFile avatar = new MockMultipartFile(
                "file",
                "avatar.svg",
                "image/svg+xml",
                "<svg />".getBytes()
        );

        assertThatThrownBy(() -> userService.uploadAvatar(avatar, user))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Avatar must be JPG, PNG or WEBP");
    }

    private User register(String email, String displayName) {
        Long userId = authService.register(new RegisterRequest(email, "secret123", displayName)).userId();
        return userRepository.findById(userId).orElseThrow();
    }
}
