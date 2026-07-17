package org.example.thesecretsanta.auth.dto;

public record AuthResponse(
        String token,
        Long userId,
        String email,
        String login,
        String displayName,
        String avatarUrl
) {
}
