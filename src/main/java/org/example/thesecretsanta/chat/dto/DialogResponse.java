package org.example.thesecretsanta.chat.dto;

import org.example.thesecretsanta.chat.domain.ChatRole;

import java.time.Instant;

/**
 * One conversation as the current user sees it.
 *
 * @param role        the current user's side: SANTA (writes to their recipient) or RECIPIENT (talks to their Santa)
 * @param title       recipient's name for a Santa, "Тайный Санта" for a recipient — never the Santa's name
 * @param avatarUrl   recipient's avatar for a Santa; always null for a recipient
 */
public record DialogResponse(
        Long id,
        Long roomId,
        String roomName,
        ChatRole role,
        String title,
        String avatarUrl,
        String lastMessage,
        Instant lastMessageAt,
        boolean lastMessageMine,
        long unread
) {
}
