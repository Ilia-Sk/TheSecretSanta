package org.example.thesecretsanta.room.dto;

import org.example.thesecretsanta.room.domain.RoomStatus;

public record InvitePreviewResponse(
        Long roomId,
        String name,
        String description,
        RoomStatus status
) {
}
