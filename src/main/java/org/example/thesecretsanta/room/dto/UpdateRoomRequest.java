package org.example.thesecretsanta.room.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.FutureOrPresent;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;

public record UpdateRoomRequest(
        @NotBlank @Size(max = 140) String name,
        @Size(max = 800) String description,
        @FutureOrPresent LocalDate celebrationDate,
        @PositiveOrZero BigDecimal giftBudget
) {
}
