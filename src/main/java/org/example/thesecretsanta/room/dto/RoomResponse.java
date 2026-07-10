package org.example.thesecretsanta.room.dto;

import org.example.thesecretsanta.room.domain.RoomStatus;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record RoomResponse(
        Long id,
        String name,
        String description,
        LocalDate celebrationDate,
        BigDecimal giftBudget,
        String inviteCode,
        RoomStatus status,
        Long ownerId,
        boolean owner,
        List<ParticipantResponse> participants,
        List<RestrictionResponse> restrictions
) {
}
