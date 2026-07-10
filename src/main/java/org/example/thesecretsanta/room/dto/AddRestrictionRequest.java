package org.example.thesecretsanta.room.dto;

import jakarta.validation.constraints.NotNull;

public record AddRestrictionRequest(
        @NotNull Long giverParticipantId,
        @NotNull Long receiverParticipantId
) {
}
