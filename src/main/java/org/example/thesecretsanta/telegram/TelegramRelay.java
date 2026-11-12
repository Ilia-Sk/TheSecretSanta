package org.example.thesecretsanta.telegram;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import org.example.thesecretsanta.chat.domain.ChatRole;

import java.time.Instant;

/**
 * "Bot message X in chat Y belongs to conversation Z" — so that when the user
 * replies to a forwarded message, the reply goes to the right person.
 */
@Entity
@Table(name = "telegram_relays", indexes = @Index(name = "idx_telegram_relays_message", columnList = "chat_id, message_id"))
public class TelegramRelay {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "chat_id", nullable = false)
    private Long chatId;

    @Column(name = "message_id", nullable = false)
    private Long messageId;

    @Column(nullable = false)
    private Long assignmentId;

    /** The Telegram user's side in that conversation. */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private ChatRole role;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    protected TelegramRelay() {
    }

    public TelegramRelay(Long chatId, Long messageId, Long assignmentId, ChatRole role) {
        this.chatId = chatId;
        this.messageId = messageId;
        this.assignmentId = assignmentId;
        this.role = role;
    }

    public Long getAssignmentId() {
        return assignmentId;
    }

    public ChatRole getRole() {
        return role;
    }
}
