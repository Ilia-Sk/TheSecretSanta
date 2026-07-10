package org.example.thesecretsanta.room.dto;

public record RestrictionResponse(
        Long id,
        Long giverParticipantId,
        String giverName,
        Long receiverParticipantId,
        String receiverName
) {
}
