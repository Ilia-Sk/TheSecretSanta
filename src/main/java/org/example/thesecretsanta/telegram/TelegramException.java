package org.example.thesecretsanta.telegram;

public class TelegramException extends RuntimeException {
    private final int errorCode;

    public TelegramException(String message, int errorCode) {
        super(message);
        this.errorCode = errorCode;
    }

    /** Telegram's error_code (403 = the user blocked the bot, 409 = another instance is polling). */
    public int errorCode() {
        return errorCode;
    }
}
