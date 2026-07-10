package org.example.thesecretsanta.user.dto;

public record ProfileResponse(
        Long id,
        String email,
        String displayName,
        String avatarUrl
) {
}
