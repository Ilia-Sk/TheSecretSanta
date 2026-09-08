package org.example.thesecretsanta.user.dto;

public record ProfileResponse(
        Long id,
        String email,
        String login,
        String displayName,
        String avatarUrl,
        String token
) {
}
