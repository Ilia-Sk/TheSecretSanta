package org.example.thesecretsanta.chat.dto;

import java.time.Instant;

/** A message without any author identity: only whether the current user wrote it. */
public record ChatMessageResponse(
        Long id,
        boolean mine,
        String text,
        Instant createdAt,
        boolean read
) {
}
