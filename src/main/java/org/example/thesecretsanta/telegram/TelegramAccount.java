package org.example.thesecretsanta.telegram;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import org.example.thesecretsanta.chat.domain.ChatMessage;
import org.example.thesecretsanta.chat.domain.ChatRole;
import org.example.thesecretsanta.user.domain.User;

import java.time.Instant;

/**
 * A site user's link to a Telegram chat with the bot, plus the bot's memory of
 * which conversation the user is currently writing to.
 */
@Entity
@Table(name = "telegram_accounts")
public class TelegramAccount {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", unique = true)
    private User user;

    /** Private chat with the bot; null until the user presses Start. */
    @Column(unique = true)
    private Long chatId;

    @Column(unique = true, length = 64)
    private String linkToken;

    private Instant linkTokenCreatedAt;

    private Instant linkedAt;

    /** Conversation plain messages go to (gift assignment id + the user's side in it). */
    private Long activeAssignmentId;

    @Enumerated(EnumType.STRING)
    @Column(length = 16)
    private ChatRole activeRole;

    /** A message typed before choosing whom to send it to; sent once a dialog is picked. */
    @Column(length = ChatMessage.MAX_LENGTH)
    private String pendingText;

    protected TelegramAccount() {
    }

    public TelegramAccount(User user) {
        this.user = user;
    }

    public Long getId() {
        return id;
    }

    public User getUser() {
        return user;
    }

    public Long getChatId() {
        return chatId;
    }

    public boolean isLinked() {
        return chatId != null;
    }

    public String getLinkToken() {
        return linkToken;
    }

    public Instant getLinkTokenCreatedAt() {
        return linkTokenCreatedAt;
    }

    public Long getActiveAssignmentId() {
        return activeAssignmentId;
    }

    public ChatRole getActiveRole() {
        return activeRole;
    }

    public String getPendingText() {
        return pendingText;
    }

    public void issueLinkToken(String token) {
        this.linkToken = token;
        this.linkTokenCreatedAt = Instant.now();
    }

    public void link(Long chatId) {
        this.chatId = chatId;
        this.linkedAt = Instant.now();
        this.linkToken = null;
        this.linkTokenCreatedAt = null;
    }

    public void unlink() {
        this.chatId = null;
        this.linkedAt = null;
        clearActive();
        this.pendingText = null;
    }

    public void activate(Long assignmentId, ChatRole role) {
        this.activeAssignmentId = assignmentId;
        this.activeRole = role;
    }

    public void clearActive() {
        this.activeAssignmentId = null;
        this.activeRole = null;
    }

    public void setPendingText(String pendingText) {
        this.pendingText = pendingText;
    }
}
