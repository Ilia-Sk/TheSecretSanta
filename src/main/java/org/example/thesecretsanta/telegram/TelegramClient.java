package org.example.thesecretsanta.telegram;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/**
 * Minimal Telegram Bot API client (plain HTTPS + JSON, no extra library).
 * Never logs the URL: it contains the bot token.
 */
@Component
public class TelegramClient {
    /** An inline keyboard button: label + callback data (≤ 64 bytes). */
    public record Button(String text, String data) {
    }

    private final TelegramProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();
    private volatile String username;

    public TelegramClient(TelegramProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    public boolean enabled() {
        return properties.configured();
    }

    /** The bot's @username (from settings, otherwise asked once via getMe). */
    public String username() {
        if (username == null) {
            String configured = properties.botUsername();
            if (configured != null && !configured.isBlank()) {
                username = configured.replaceFirst("^@", "").strip();
            } else if (enabled()) {
                username = call("getMe", objectMapper.createObjectNode(), 15).path("username").asText(null);
            }
        }
        return username;
    }

    /** Long polling: waits up to {@code timeoutSeconds} for new updates. */
    public List<JsonNode> getUpdates(long offset, int timeoutSeconds) {
        ObjectNode body = objectMapper.createObjectNode();
        body.put("offset", offset);
        body.put("timeout", timeoutSeconds);
        body.putArray("allowed_updates").add("message").add("callback_query");
        JsonNode result = call("getUpdates", body, timeoutSeconds + 15);
        List<JsonNode> updates = new ArrayList<>();
        result.forEach(updates::add);
        return updates;
    }

    /** Sends plain text (no Markdown, so user text needs no escaping). Returns the new message id. */
    public Long sendMessage(long chatId, String text, List<List<Button>> keyboard) {
        ObjectNode body = objectMapper.createObjectNode();
        body.put("chat_id", chatId);
        body.put("text", text);
        body.put("disable_web_page_preview", true);
        if (keyboard != null && !keyboard.isEmpty()) {
            ArrayNode rows = body.putObject("reply_markup").putArray("inline_keyboard");
            for (List<Button> row : keyboard) {
                ArrayNode buttons = rows.addArray();
                for (Button button : row) {
                    buttons.addObject().put("text", button.text()).put("callback_data", button.data());
                }
            }
        }
        JsonNode result = call("sendMessage", body, 20);
        return result.hasNonNull("message_id") ? result.get("message_id").asLong() : null;
    }

    public Long sendMessage(long chatId, String text) {
        return sendMessage(chatId, text, null);
    }

    public void answerCallbackQuery(String callbackId, String text) {
        ObjectNode body = objectMapper.createObjectNode();
        body.put("callback_query_id", callbackId);
        if (text != null) {
            body.put("text", text);
        }
        call("answerCallbackQuery", body, 15);
    }

    /** A small "delivered" mark on the user's own message. */
    public void react(long chatId, long messageId, String emoji) {
        ObjectNode body = objectMapper.createObjectNode();
        body.put("chat_id", chatId);
        body.put("message_id", messageId);
        body.putArray("reaction").addObject().put("type", "emoji").put("emoji", emoji);
        call("setMessageReaction", body, 15);
    }

    public void deleteWebhook() {
        call("deleteWebhook", objectMapper.createObjectNode(), 15);
    }

    public void setCommands(List<String[]> commands) {
        ObjectNode body = objectMapper.createObjectNode();
        ArrayNode list = body.putArray("commands");
        for (String[] command : commands) {
            list.addObject().put("command", command[0]).put("description", command[1]);
        }
        call("setMyCommands", body, 15);
    }

    JsonNode call(String method, JsonNode body, int timeoutSeconds) {
        if (!enabled()) {
            throw new TelegramException("Telegram bot is not configured", 0);
        }
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(properties.apiUrl() + "/bot" + properties.botToken() + "/" + method))
                    .timeout(Duration.ofSeconds(timeoutSeconds))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body), StandardCharsets.UTF_8))
                    .build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            JsonNode json = objectMapper.readTree(response.body());
            if (!json.path("ok").asBoolean(false)) {
                throw new TelegramException(method + ": " + json.path("description").asText("HTTP " + response.statusCode()),
                        json.path("error_code").asInt(response.statusCode()));
            }
            return json.path("result");
        } catch (IOException ex) {
            throw new TelegramException(method + ": Telegram is unreachable (" + ex.getClass().getSimpleName() + ")", 0);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new TelegramException(method + ": interrupted", 0);
        }
    }
}
