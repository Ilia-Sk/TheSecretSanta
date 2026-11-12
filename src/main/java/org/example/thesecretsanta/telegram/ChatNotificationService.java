package org.example.thesecretsanta.telegram;

import org.example.thesecretsanta.chat.domain.ChatMessage;
import org.example.thesecretsanta.chat.domain.ChatRole;
import org.example.thesecretsanta.chat.service.ChatNotifier;
import org.example.thesecretsanta.chat.service.ChatParty;
import org.example.thesecretsanta.config.AppProperties;
import org.example.thesecretsanta.mail.MailClient;
import org.example.thesecretsanta.user.domain.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Delivers a new chat message to the other side:
 * <ul>
 *   <li>Telegram linked → the bot forwards the text itself (anonymously for the Santa);</li>
 *   <li>otherwise → an email, at most one per conversation every {@link #EMAIL_PAUSE}.</li>
 * </ul>
 */
@Service
public class ChatNotificationService implements ChatNotifier {
    static final Duration EMAIL_PAUSE = Duration.ofMinutes(10);
    private static final Logger log = LoggerFactory.getLogger(ChatNotificationService.class);

    private final TelegramAccountRepository accounts;
    private final TelegramRelayRepository relays;
    private final TelegramClient telegram;
    private final MailClient mail;
    private final AppProperties appProperties;
    private final Map<String, Instant> lastEmail = new ConcurrentHashMap<>();

    public ChatNotificationService(
            TelegramAccountRepository accounts,
            TelegramRelayRepository relays,
            TelegramClient telegram,
            MailClient mail,
            AppProperties appProperties
    ) {
        this.accounts = accounts;
        this.relays = relays;
        this.telegram = telegram;
        this.mail = mail;
        this.appProperties = appProperties;
    }

    @Override
    public void messageSent(ChatMessage message, ChatParty author) {
        User target = author.counterpart();
        ChatRole targetRole = author.role().other();
        try {
            if (sendToTelegram(message, author, target, targetRole)) {
                return;
            }
            sendEmail(message, author, target, targetRole);
        } catch (RuntimeException ex) {
            log.warn("Chat notification for message {} failed: {}", message.getId(), ex.getMessage());
        }
    }

    private boolean sendToTelegram(ChatMessage message, ChatParty author, User target, ChatRole targetRole) {
        if (!telegram.enabled()) {
            return false;
        }
        Optional<TelegramAccount> account = accounts.findByUserId(target.getId()).filter(TelegramAccount::isLinked);
        if (account.isEmpty()) {
            return false;
        }
        long chatId = account.get().getChatId();
        String text = TelegramTexts.incomingHeader(author.assignment(), targetRole) + "\n\n" + message.getText();
        try {
            Long messageId = telegram.sendMessage(chatId, text);
            if (messageId != null) {
                relays.save(new TelegramRelay(chatId, messageId, author.assignment().getId(), targetRole));
            }
            return true;
        } catch (TelegramException ex) {
            // 403: the user blocked the bot — fall back to email.
            log.info("Telegram delivery to chat failed ({}), falling back to email", ex.getMessage());
            return false;
        }
    }

    private void sendEmail(ChatMessage message, ChatParty author, User target, ChatRole targetRole) {
        String key = author.assignment().getId() + ":" + targetRole;
        Instant now = Instant.now();
        Instant previous = lastEmail.get(key);
        if (previous != null && previous.plus(EMAIL_PAUSE).isAfter(now)) {
            return;
        }
        lastEmail.put(key, now);
        String room = author.assignment().getRoom().getName();
        String who = targetRole == ChatRole.RECIPIENT
                ? "Ваш Тайный Санта"
                : "Ваш получатель " + author.assignment().getReceiver().getUser().getDisplayName();
        String preview = message.getText().length() > 500 ? message.getText().substring(0, 500) + "…" : message.getText();
        String text = """
                %s написал(а) вам в комнате «%s»:

                %s

                Ответить: %s

                Хотите получать сообщения и отвечать прямо в Telegram? Подключите бота в профиле на сайте.
                """.formatted(who, room, preview, appProperties.publicUrl());
        mail.send(target.getEmail(), "Тайный Санта: новое сообщение", text);
    }
}
