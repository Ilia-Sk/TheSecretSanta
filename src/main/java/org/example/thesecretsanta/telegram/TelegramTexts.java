package org.example.thesecretsanta.telegram;

import org.example.thesecretsanta.chat.domain.ChatRole;
import org.example.thesecretsanta.chat.service.ChatParty;
import org.example.thesecretsanta.room.domain.GiftAssignment;

/** Bot wording in one place. Never puts the Santa's name in front of the recipient. */
final class TelegramTexts {
    private TelegramTexts() {
    }

    /** Button / list label of a conversation, from the user's side. */
    static String label(ChatParty party) {
        String room = party.assignment().getRoom().getName();
        return party.role() == ChatRole.SANTA
                ? "🎁 " + party.assignment().getReceiver().getUser().getDisplayName() + " · " + room
                : "🎅 Мой Тайный Санта · " + room;
    }

    /** First line above a forwarded message. */
    static String incomingHeader(GiftAssignment assignment, ChatRole readerRole) {
        String room = assignment.getRoom().getName();
        return readerRole == ChatRole.RECIPIENT
                ? "🎅 Тайный Санта · «" + room + "»"
                : "🎁 " + assignment.getReceiver().getUser().getDisplayName() + " (ваш получатель) · «" + room + "»";
    }

    static String help(String siteUrl) {
        return """
                Я — анонимный чат Тайного Санты 🎄

                • Сообщения от вашего Санты и вашего получателя приходят сюда.
                • Чтобы ответить, просто ответьте на пересланное сообщение (свайп влево или «Ответить»).
                • Или выберите собеседника командой /chats и пишите как обычно.
                • Санта остаётся анонимным: получатель видит только «Тайный Санта».

                /chats — выбрать, кому писать
                /unlink — отключить Telegram
                Сайт: %s""".formatted(siteUrl);
    }

    static String notLinked(String siteUrl) {
        return """
                Привет! Я пересылаю анонимные сообщения между Тайным Сантой и получателем.

                Чтобы начать, откройте профиль на сайте и нажмите «Подключить Telegram»:
                %s""".formatted(siteUrl);
    }
}
