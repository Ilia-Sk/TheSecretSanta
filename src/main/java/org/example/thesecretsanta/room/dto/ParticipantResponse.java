package org.example.thesecretsanta.room.dto;

public record ParticipantResponse(
        Long participantId,
        Long userId,
        String displayName,
        String avatarUrl,
        boolean owner,
        String wishlist,
        String wishlistLinks
) {
}
