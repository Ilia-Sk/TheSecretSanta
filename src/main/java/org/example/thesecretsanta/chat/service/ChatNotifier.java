package org.example.thesecretsanta.chat.service;

import org.example.thesecretsanta.chat.domain.ChatMessage;

/**
 * Tells the other side that a message arrived (Telegram when linked, otherwise email).
 * Implementations must never throw: a failed notification must not lose the message.
 */
public interface ChatNotifier {
    void messageSent(ChatMessage message, ChatParty author);
}
