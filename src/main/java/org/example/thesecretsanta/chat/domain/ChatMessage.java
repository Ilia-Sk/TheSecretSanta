package org.example.thesecretsanta.chat.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.example.thesecretsanta.room.domain.GiftAssignment;

import java.time.Instant;

/**
 * One message of the anonymous Santa ↔ recipient chat. The conversation is the
 * gift assignment itself; the author is stored only as a role, so nothing in a
 * message points at the Santa's account.
 */
@Entity
@Table(name = "chat_messages", indexes = @Index(name = "idx_chat_messages_assignment", columnList = "assignment_id, id"))
public class ChatMessage {
    public static final int MAX_LENGTH = 2000;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "assignment_id")
    private GiftAssignment assignment;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private ChatRole authorRole;

    @Column(nullable = false, length = MAX_LENGTH)
    private String text;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private MessageSource source;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    private Instant readAt;

    protected ChatMessage() {
    }

    public ChatMessage(GiftAssignment assignment, ChatRole authorRole, String text, MessageSource source) {
        this.assignment = assignment;
        this.authorRole = authorRole;
        this.text = text;
        this.source = source;
    }

    public Long getId() {
        return id;
    }

    public GiftAssignment getAssignment() {
        return assignment;
    }

    public ChatRole getAuthorRole() {
        return authorRole;
    }

    public String getText() {
        return text;
    }

    public MessageSource getSource() {
        return source;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getReadAt() {
        return readAt;
    }
}
