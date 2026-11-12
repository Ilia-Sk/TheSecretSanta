package org.example.thesecretsanta.telegram;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Telegram bot settings. Without a token the bot is simply off: the chat still
 * works on the site and notifications go by email.
 *
 * @param botToken    token from @BotFather (TELEGRAM_BOT_TOKEN)
 * @param botUsername bot's @username without "@" (TELEGRAM_BOT_USERNAME); looked up via getMe when empty
 * @param apiUrl      Bot API base URL
 * @param polling     whether this instance polls Telegram for updates (only one instance per bot may poll)
 */
@ConfigurationProperties(prefix = "app.telegram")
public record TelegramProperties(
        String botToken,
        String botUsername,
        String apiUrl,
        Boolean polling
) {
    public TelegramProperties {
        apiUrl = apiUrl == null || apiUrl.isBlank() ? "https://api.telegram.org" : apiUrl.replaceAll("/+$", "");
        polling = polling == null || polling;
    }

    public boolean configured() {
        return botToken != null && !botToken.isBlank();
    }
}
