package org.example.thesecretsanta.telegram;

import com.fasterxml.jackson.databind.JsonNode;
import org.example.thesecretsanta.chat.domain.ChatMessage;
import org.example.thesecretsanta.chat.domain.ChatRole;
import org.example.thesecretsanta.chat.domain.MessageSource;
import org.example.thesecretsanta.chat.service.ChatParty;
import org.example.thesecretsanta.chat.service.ChatService;
import org.example.thesecretsanta.config.AppProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * The bot's brain: one Telegram update in, replies out.
 *
 * Where a plain message goes:
 * <ol>
 *   <li>a reply to a forwarded message → that message's conversation;</li>
 *   <li>otherwise the conversation chosen with /chats (remembered);</li>
 *   <li>otherwise the only conversation the user has;</li>
 *   <li>otherwise the bot keeps the text and asks whom to send it to.</li>
 * </ol>
 */
@Service
public class TelegramBotService {
    private static final Logger log = LoggerFactory.getLogger(TelegramBotService.class);
    private static final String CALLBACK_PREFIX = "c:";

    private final TelegramClient telegram;
    private final TelegramAccountRepository accounts;
    private final TelegramRelayRepository relays;
    private final TelegramLinkService linkService;
    private final ChatService chatService;
    private final AppProperties appProperties;

    public TelegramBotService(
            TelegramClient telegram,
            TelegramAccountRepository accounts,
            TelegramRelayRepository relays,
            TelegramLinkService linkService,
            ChatService chatService,
            AppProperties appProperties
    ) {
        this.telegram = telegram;
        this.accounts = accounts;
        this.relays = relays;
        this.linkService = linkService;
        this.chatService = chatService;
        this.appProperties = appProperties;
    }

    @Transactional
    public void handle(JsonNode update) {
        if (update.has("callback_query")) {
            handleCallback(update.get("callback_query"));
        } else if (update.has("message")) {
            handleMessage(update.get("message"));
        }
    }

    private void handleMessage(JsonNode message) {
        JsonNode chat = message.path("chat");
        if (!"private".equals(chat.path("type").asText())) {
            return;
        }
        long chatId = chat.path("id").asLong();
        String text = message.hasNonNull("text") ? message.get("text").asText() : null;

        if (text != null && text.startsWith("/start")) {
            String token = text.length() > 6 ? text.substring(6).strip() : "";
            handleStart(chatId, token);
            return;
        }

        Optional<TelegramAccount> found = accounts.findByChatId(chatId);
        if (found.isEmpty()) {
            telegram.sendMessage(chatId, TelegramTexts.notLinked(siteUrl()));
            return;
        }
        TelegramAccount account = found.get();

        if (text == null) {
            telegram.sendMessage(chatId, "Пока я умею пересылать только текст ✍️");
            return;
        }
        String command = text.strip().split("\\s+")[0].replaceFirst("@.*$", "");
        switch (command) {
            case "/chats" -> sendDialogList(account, "Кому пишем?");
            case "/help" -> telegram.sendMessage(chatId, TelegramTexts.help(siteUrl()));
            case "/unlink" -> {
                account.unlink();
                telegram.sendMessage(chatId, "Telegram отключён. Уведомления снова будут приходить на почту.");
            }
            default -> {
                if (text.startsWith("/")) {
                    telegram.sendMessage(chatId, "Не знаю такой команды. /help — что я умею.");
                    return;
                }
                route(account, message, text);
            }
        }
    }

    private void handleStart(long chatId, String token) {
        if (!token.isEmpty()) {
            Optional<TelegramAccount> linked = linkService.linkByToken(token, chatId);
            if (linked.isPresent()) {
                String name = linked.get().getUser().getDisplayName();
                telegram.sendMessage(chatId, "Готово, " + name + "! Telegram подключён 🎄\n\n" + TelegramTexts.help(siteUrl()));
                sendDialogList(linked.get(), "Ваши чаты:");
                return;
            }
            telegram.sendMessage(chatId, "Ссылка устарела. Откройте профиль на сайте и нажмите «Подключить Telegram» ещё раз:\n" + siteUrl());
            return;
        }
        Optional<TelegramAccount> account = accounts.findByChatId(chatId);
        if (account.isPresent()) {
            telegram.sendMessage(chatId, TelegramTexts.help(siteUrl()));
            sendDialogList(account.get(), "Ваши чаты:");
        } else {
            telegram.sendMessage(chatId, TelegramTexts.notLinked(siteUrl()));
        }
    }

    private void route(TelegramAccount account, JsonNode message, String text) {
        long chatId = account.getChatId();
        if (text.length() > ChatMessage.MAX_LENGTH) {
            telegram.sendMessage(chatId, "Слишком длинное сообщение — максимум " + ChatMessage.MAX_LENGTH + " символов.");
            return;
        }
        Optional<ChatParty> target = Optional.empty();

        JsonNode replyTo = message.path("reply_to_message");
        if (replyTo.has("message_id")) {
            target = relays.findFirstByChatIdAndMessageId(chatId, replyTo.get("message_id").asLong())
                    .flatMap(r -> chatService.findParty(r.getAssignmentId(), r.getRole(), account.getUser()));
        }
        if (target.isEmpty() && account.getActiveAssignmentId() != null) {
            target = chatService.findParty(account.getActiveAssignmentId(), account.getActiveRole(), account.getUser());
        }
        if (target.isEmpty()) {
            List<ChatParty> parties = chatService.allParties(account.getUser());
            if (parties.isEmpty()) {
                telegram.sendMessage(chatId, "Чаты появятся после жеребьёвки в вашей комнате 🎁");
                return;
            }
            if (parties.size() == 1) {
                target = Optional.of(parties.get(0));
            } else {
                account.setPendingText(text);
                sendDialogList(account, "Кому отправить это сообщение?");
                return;
            }
        }
        deliver(account, target.get(), text, message.path("message_id").asLong());
    }

    private void handleCallback(JsonNode callback) {
        String callbackId = callback.path("id").asText();
        long chatId = callback.path("message").path("chat").path("id").asLong();
        String data = callback.path("data").asText("");
        Optional<TelegramAccount> found = accounts.findByChatId(chatId);
        if (found.isEmpty() || !data.startsWith(CALLBACK_PREFIX)) {
            safeAnswer(callbackId, null);
            return;
        }
        TelegramAccount account = found.get();
        Optional<ChatParty> party = parseCallback(data)
                .flatMap(p -> chatService.findParty(p.assignmentId(), p.role(), account.getUser()));
        if (party.isEmpty()) {
            safeAnswer(callbackId, "Этот чат больше недоступен");
            return;
        }
        account.activate(party.get().assignment().getId(), party.get().role());
        safeAnswer(callbackId, "Выбрано");
        String pending = account.getPendingText();
        if (pending != null) {
            account.setPendingText(null);
            deliver(account, party.get(), pending, null);
            telegram.sendMessage(chatId, "Отправлено → " + TelegramTexts.label(party.get()));
        } else {
            telegram.sendMessage(chatId, "Теперь вы пишете: " + TelegramTexts.label(party.get())
                    + "\nПросто отправьте сообщение — я передам его.");
        }
    }

    private void deliver(TelegramAccount account, ChatParty party, String text, Long sourceMessageId) {
        chatService.post(party, text, MessageSource.TELEGRAM);
        account.activate(party.assignment().getId(), party.role());
        if (sourceMessageId != null) {
            try {
                telegram.react(account.getChatId(), sourceMessageId, "👌");
            } catch (TelegramException ex) {
                // A reaction is a nicety; older clients may not support it.
                log.debug("Reaction failed: {}", ex.getMessage());
            }
        }
    }

    private void sendDialogList(TelegramAccount account, String title) {
        List<ChatParty> parties = chatService.allParties(account.getUser());
        if (parties.isEmpty()) {
            telegram.sendMessage(account.getChatId(), "Пока чатов нет — они появятся после жеребьёвки в вашей комнате 🎁");
            return;
        }
        List<List<TelegramClient.Button>> keyboard = new ArrayList<>();
        for (ChatParty party : parties) {
            boolean active = party.assignment().getId().equals(account.getActiveAssignmentId())
                    && party.role() == account.getActiveRole();
            String data = CALLBACK_PREFIX + party.assignment().getId() + ":" + (party.role() == ChatRole.SANTA ? "S" : "R");
            keyboard.add(List.of(new TelegramClient.Button((active ? "✓ " : "") + TelegramTexts.label(party), data)));
        }
        telegram.sendMessage(account.getChatId(), title, keyboard);
    }

    private record CallbackTarget(Long assignmentId, ChatRole role) {
    }

    private Optional<CallbackTarget> parseCallback(String data) {
        String[] parts = data.substring(CALLBACK_PREFIX.length()).split(":");
        if (parts.length != 2) {
            return Optional.empty();
        }
        try {
            ChatRole role = "S".equals(parts[1]) ? ChatRole.SANTA : "R".equals(parts[1]) ? ChatRole.RECIPIENT : null;
            return role == null ? Optional.empty() : Optional.of(new CallbackTarget(Long.parseLong(parts[0]), role));
        } catch (NumberFormatException ex) {
            return Optional.empty();
        }
    }

    private void safeAnswer(String callbackId, String text) {
        try {
            telegram.answerCallbackQuery(callbackId, text);
        } catch (TelegramException ex) {
            log.debug("answerCallbackQuery failed: {}", ex.getMessage());
        }
    }

    private String siteUrl() {
        return appProperties.publicUrl();
    }
}
