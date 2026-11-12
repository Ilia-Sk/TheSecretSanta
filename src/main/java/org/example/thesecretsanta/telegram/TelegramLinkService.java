package org.example.thesecretsanta.telegram;

import org.example.thesecretsanta.user.domain.User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;

/**
 * Connects a site account to Telegram: the site issues a one-time token, the
 * user opens t.me/&lt;bot&gt;?start=&lt;token&gt; and presses Start, the bot
 * receives "/start &lt;token&gt;" and remembers the chat.
 */
@Service
public class TelegramLinkService {
    static final Duration TOKEN_TTL = Duration.ofMinutes(30);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final TelegramAccountRepository accounts;
    private final TelegramClient client;

    public TelegramLinkService(TelegramAccountRepository accounts, TelegramClient client) {
        this.accounts = accounts;
        this.client = client;
    }

    public record Status(boolean enabled, boolean linked, String botUsername) {
    }

    @Transactional(readOnly = true)
    public Status status(User user) {
        if (!client.enabled()) {
            return new Status(false, false, null);
        }
        boolean linked = accounts.findByUser(user).map(TelegramAccount::isLinked).orElse(false);
        return new Status(true, linked, safeUsername());
    }

    /** A deep link that opens the bot and links this account when the user presses Start. */
    @Transactional
    public String createLink(User user) {
        if (!client.enabled()) {
            throw new IllegalArgumentException("Telegram bot is not configured");
        }
        String botUsername = safeUsername();
        if (botUsername == null) {
            throw new IllegalArgumentException("Telegram bot is unreachable, try again later");
        }
        TelegramAccount account = accounts.findByUser(user).orElseGet(() -> new TelegramAccount(user));
        byte[] bytes = new byte[24];
        RANDOM.nextBytes(bytes);
        account.issueLinkToken(Base64.getUrlEncoder().withoutPadding().encodeToString(bytes));
        accounts.save(account);
        return "https://t.me/" + botUsername + "?start=" + account.getLinkToken();
    }

    @Transactional
    public void unlink(User user) {
        accounts.findByUser(user).ifPresent(TelegramAccount::unlink);
    }

    /** Called by the bot on "/start &lt;token&gt;". Moves the chat from any other account. */
    @Transactional
    public Optional<TelegramAccount> linkByToken(String token, long chatId) {
        Optional<TelegramAccount> found = accounts.findByLinkToken(token)
                .filter(a -> a.getLinkTokenCreatedAt() != null
                        && a.getLinkTokenCreatedAt().plus(TOKEN_TTL).isAfter(Instant.now()));
        found.ifPresent(account -> {
            accounts.findByChatId(chatId)
                    .filter(other -> !other.getId().equals(account.getId()))
                    .ifPresent(other -> {
                        other.unlink();
                        accounts.saveAndFlush(other);
                    });
            account.link(chatId);
        });
        return found;
    }

    private String safeUsername() {
        try {
            return client.username();
        } catch (TelegramException ex) {
            return null;
        }
    }
}
