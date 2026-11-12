package org.example.thesecretsanta.telegram;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Receives bot updates by long polling (getUpdates), so the bot works without a
 * public URL — on a laptop as well as on a server. One background thread.
 */
@Component
public class TelegramPoller {
    private static final Logger log = LoggerFactory.getLogger(TelegramPoller.class);
    private static final int LONG_POLL_SECONDS = 25;

    private final TelegramClient telegram;
    private final TelegramBotService bot;
    private final TelegramProperties properties;
    private volatile boolean running;
    private Thread thread;

    public TelegramPoller(TelegramClient telegram, TelegramBotService bot, TelegramProperties properties) {
        this.telegram = telegram;
        this.bot = bot;
        this.properties = properties;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void start() {
        if (!telegram.enabled() || !properties.polling()) {
            log.info("Telegram bot is off (TELEGRAM_BOT_TOKEN is not set). Chat notifications go by email.");
            return;
        }
        running = true;
        thread = new Thread(this::loop, "telegram-poller");
        thread.setDaemon(true);
        thread.start();
    }

    @PreDestroy
    public void stop() {
        running = false;
        if (thread != null) {
            thread.interrupt();
        }
    }

    private void loop() {
        try {
            telegram.deleteWebhook();
            telegram.setCommands(List.of(
                    new String[]{"chats", "Выбрать, кому писать"},
                    new String[]{"help", "Как это работает"},
                    new String[]{"unlink", "Отключить Telegram"}
            ));
            log.info("Telegram bot @{} is listening", telegram.username());
        } catch (TelegramException ex) {
            log.warn("Telegram bot setup failed: {}", ex.getMessage());
        }
        long offset = 0;
        while (running) {
            try {
                for (JsonNode update : telegram.getUpdates(offset, LONG_POLL_SECONDS)) {
                    offset = Math.max(offset, update.path("update_id").asLong() + 1);
                    try {
                        bot.handle(update);
                    } catch (RuntimeException ex) {
                        log.warn("Telegram update {} failed: {}", update.path("update_id").asLong(), ex.getMessage());
                    }
                }
            } catch (TelegramException ex) {
                if (!running) {
                    break;
                }
                if (ex.errorCode() == 409) {
                    log.warn("Another copy of the app is polling this bot; retrying in 30 s");
                    sleep(30_000);
                } else {
                    log.warn("Telegram polling error: {}; retrying in 5 s", ex.getMessage());
                    sleep(5_000);
                }
            }
        }
    }

    private void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            running = false;
        }
    }
}
