package org.example.thesecretsanta.user.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AvatarUrlTest {
    @Test
    void acceptsOwnUploadsAndHttpsImages() {
        assertThat(UserService.safeAvatarUrl(null)).isNull();
        assertThat(UserService.safeAvatarUrl("/uploads/avatars/5-abc.png")).isEqualTo("/uploads/avatars/5-abc.png");
        assertThat(UserService.safeAvatarUrl("https://img.clerk.com/x.png")).isEqualTo("https://img.clerk.com/x.png");
    }

    @Test
    void rejectsScriptsAndOtherSchemes() {
        for (String bad : new String[]{"javascript:alert(1)", "data:text/html,<script>", "http://tracker.example/x.gif",
                "/uploads/../../etc/passwd", "//evil.example/a.png"}) {
            assertThatThrownBy(() -> UserService.safeAvatarUrl(bad)).as(bad).isInstanceOf(IllegalArgumentException.class);
        }
    }
}
