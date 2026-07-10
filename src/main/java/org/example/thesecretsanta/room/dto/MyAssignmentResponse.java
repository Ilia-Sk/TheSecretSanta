package org.example.thesecretsanta.room.dto;

public record MyAssignmentResponse(
        Long receiverUserId,
        String receiverName,
        String receiverAvatarUrl,
        String receiverWishlist,
        String receiverWishlistLinks
) {
}
