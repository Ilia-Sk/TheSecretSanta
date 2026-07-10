package org.example.thesecretsanta.room.dto;

import jakarta.validation.constraints.Size;

public record JoinRoomRequest(
        @Size(max = 1000) String wishlist,
        @Size(max = 1500) String wishlistLinks
) {
}
