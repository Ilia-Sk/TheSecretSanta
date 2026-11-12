package org.example.thesecretsanta.chat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.example.thesecretsanta.auth.dto.RegisterRequest;
import org.example.thesecretsanta.auth.service.AuthService;
import org.example.thesecretsanta.chat.dao.ChatMessageRepository;
import org.example.thesecretsanta.chat.domain.ChatRole;
import org.example.thesecretsanta.chat.domain.MessageSource;
import org.example.thesecretsanta.chat.dto.ChatMessageResponse;
import org.example.thesecretsanta.chat.dto.DialogResponse;
import org.example.thesecretsanta.chat.service.ChatService;
import org.example.thesecretsanta.mail.MailClient;
import org.example.thesecretsanta.room.dto.CreateRoomRequest;
import org.example.thesecretsanta.room.dto.JoinRoomRequest;
import org.example.thesecretsanta.room.dto.RoomResponse;
import org.example.thesecretsanta.room.service.RoomService;
import org.example.thesecretsanta.telegram.TelegramAccountRepository;
import org.example.thesecretsanta.telegram.TelegramBotService;
import org.example.thesecretsanta.telegram.TelegramClient;
import org.example.thesecretsanta.telegram.TelegramLinkService;
import org.example.thesecretsanta.user.dao.UserRepository;
import org.example.thesecretsanta.user.domain.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class ChatIntegrationTest {
    private static final ObjectMapper JSON = new ObjectMapper();

    @Autowired AuthService authService;
    @Autowired RoomService roomService;
    @Autowired ChatService chatService;
    @Autowired ChatMessageRepository messageRepository;
    @Autowired UserRepository userRepository;
    @Autowired TelegramLinkService linkService;
    @Autowired TelegramBotService botService;
    @Autowired TelegramAccountRepository telegramAccounts;
    @Autowired RecordingMail mail;
    @MockBean TelegramClient telegram;

    private final AtomicLong telegramMessageIds = new AtomicLong(500);
    private User anna;
    private User boris;
    private User vera;
    private RoomResponse room;

    @BeforeEach
    void drawRoom() {
        mail.messages.clear();
        when(telegram.enabled()).thenReturn(false);
        anna = register("anna-chat@example.com", "Anna Chat");
        boris = register("boris-chat@example.com", "Boris Chat");
        vera = register("vera-chat@example.com", "Vera Chat");
        room = roomService.createRoom(new CreateRoomRequest("Chat Room", null, null, null, null, null), anna);
        roomService.joinRoom(room.inviteCode(), new JoinRoomRequest(null, null), boris);
        roomService.joinRoom(room.inviteCode(), new JoinRoomRequest(null, null), vera);
        roomService.draw(room.id(), anna);
        mail.messages.clear();
    }

    @Test
    void everyoneHasTwoDialogsAndTheSantaStaysAnonymous() {
        for (User user : List.of(anna, boris, vera)) {
            List<DialogResponse> dialogs = chatService.roomDialogs(room.id(), user);
            assertThat(dialogs).extracting(DialogResponse::role).containsExactly(ChatRole.SANTA, ChatRole.RECIPIENT);
            DialogResponse withSanta = dialogs.get(1);
            assertThat(withSanta.title()).isEqualTo("Тайный Санта");
            assertThat(withSanta.avatarUrl()).isNull();
            // the recipient-side title must never be a real participant's name
            assertThat(withSanta.title()).isNotIn("Anna Chat", "Boris Chat", "Vera Chat");
        }
    }

    @Test
    void santaWritesRecipientReadsAndGetsAnAnonymousEmail() {
        DialogResponse annaAsSanta = chatService.roomDialogs(room.id(), anna).get(0);
        User recipient = userByName(annaAsSanta.title());

        chatService.send(annaAsSanta.id(), anna, "  Какой размер свитера?  ", MessageSource.WEB);

        List<ChatMessageResponse> seenByRecipient = chatService.messages(annaAsSanta.id(), recipient, null);
        assertThat(seenByRecipient).singleElement().satisfies(m -> {
            assertThat(m.mine()).isFalse();
            assertThat(m.text()).isEqualTo("Какой размер свитера?");
        });
        assertThat(chatService.messages(annaAsSanta.id(), anna, null)).singleElement()
                .satisfies(m -> assertThat(m.mine()).isTrue());

        assertThat(mail.messages).singleElement().satisfies(m -> {
            assertThat(m.get("to")).isEqualTo(recipient.getEmail());
            assertThat(m.get("text")).contains("Ваш Тайный Санта").contains("Какой размер свитера?").doesNotContain("Anna Chat");
        });

        // a burst of messages → still one email
        chatService.send(annaAsSanta.id(), anna, "И любимый цвет?", MessageSource.WEB);
        assertThat(mail.messages).hasSize(1);
    }

    @Test
    void unreadIsCountedUntilOpened() {
        DialogResponse annaAsSanta = chatService.roomDialogs(room.id(), anna).get(0);
        User recipient = userByName(annaAsSanta.title());
        chatService.send(annaAsSanta.id(), anna, "Привет!", MessageSource.WEB);

        DialogResponse recipientView = chatService.roomDialogs(room.id(), recipient).get(1);
        assertThat(recipientView.unread()).isEqualTo(1);
        assertThat(recipientView.lastMessage()).isEqualTo("Привет!");
        assertThat(recipientView.lastMessageMine()).isFalse();

        chatService.messages(annaAsSanta.id(), recipient, null);
        assertThat(chatService.roomDialogs(room.id(), recipient).get(1).unread()).isZero();
    }

    @Test
    void outsidersCannotReadOrWrite() {
        DialogResponse annaAsSanta = chatService.roomDialogs(room.id(), anna).get(0);
        User recipient = userByName(annaAsSanta.title());
        User outsider = List.of(boris, vera).stream().filter(u -> !u.getId().equals(recipient.getId())).findFirst().orElseThrow();
        // the third person is neither the Santa nor the recipient of this pair
        assertThatThrownBy(() -> chatService.messages(annaAsSanta.id(), outsider, null)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> chatService.send(annaAsSanta.id(), outsider, "hi", MessageSource.WEB)).isInstanceOf(AccessDeniedException.class);
        User stranger = register("stranger-chat@example.com", "Stranger");
        assertThatThrownBy(() -> chatService.roomDialogs(room.id(), stranger)).isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void emptyMessagesAreRejected() {
        DialogResponse dialog = chatService.roomDialogs(room.id(), anna).get(0);
        assertThatThrownBy(() -> chatService.send(dialog.id(), anna, "   ", MessageSource.WEB)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void deletingTheRoomDeletesItsChat() {
        DialogResponse dialog = chatService.roomDialogs(room.id(), anna).get(0);
        chatService.send(dialog.id(), anna, "Скоро праздник", MessageSource.WEB);
        roomService.deleteRoom(room.id(), anna);
        assertThat(messageRepository.findByAssignmentIdOrderByIdAsc(dialog.id())).isEmpty();
    }

    @Test
    void telegramRelaysBothWaysAndRepliesGoToTheRightPerson() throws Exception {
        enableTelegram();
        DialogResponse annaAsSanta = chatService.roomDialogs(room.id(), anna).get(0);
        User recipient = userByName(annaAsSanta.title());

        // recipient links Telegram: site gives a deep link, the bot gets "/start <token>"
        String url = linkService.createLink(recipient);
        assertThat(url).startsWith("https://t.me/SantaTestBot?start=");
        String token = url.substring(url.indexOf("start=") + 6);
        botService.handle(update("{\"message\":{\"message_id\":1,\"chat\":{\"id\":7001,\"type\":\"private\"},\"text\":\"/start " + token + "\"}}"));
        assertThat(telegramAccounts.findByUserId(recipient.getId())).get().satisfies(a -> assertThat(a.getChatId()).isEqualTo(7001L));
        assertThat(linkService.status(recipient).linked()).isTrue();

        // Santa writes on the site → bot forwards to the recipient, anonymously
        chatService.send(annaAsSanta.id(), anna, "Тебе нравится чай?", MessageSource.WEB);
        ArgumentCaptor<String> text = ArgumentCaptor.forClass(String.class);
        verify(telegram, atLeastOnce()).sendMessage(eq(7001L), text.capture());
        String forwarded = text.getAllValues().get(text.getAllValues().size() - 1);
        assertThat(forwarded).contains("🎅 Тайный Санта").contains("Тебе нравится чай?").doesNotContain("Anna Chat");
        assertThat(mail.messages).isEmpty();
        long forwardedId = telegramMessageIds.get();

        // recipient replies to that forwarded message in Telegram → lands in the same conversation
        botService.handle(update("{\"message\":{\"message_id\":2,\"chat\":{\"id\":7001,\"type\":\"private\"},\"text\":\"Очень!\","
                + "\"reply_to_message\":{\"message_id\":" + forwardedId + "}}}"));
        List<ChatMessageResponse> seenBySanta = chatService.messages(annaAsSanta.id(), anna, null);
        assertThat(seenBySanta).extracting(ChatMessageResponse::text).containsExactly("Тебе нравится чай?", "Очень!");
        assertThat(seenBySanta.get(1).mine()).isFalse();
    }

    @Test
    void telegramAsksWhomToSendWhenThereAreSeveralDialogs() throws Exception {
        enableTelegram();
        String url = linkService.createLink(anna);
        String token = url.substring(url.indexOf("start=") + 6);
        botService.handle(update("{\"message\":{\"message_id\":1,\"chat\":{\"id\":8001,\"type\":\"private\"},\"text\":\"/start " + token + "\"}}"));

        // Anna is both a Santa and a recipient → the bot keeps the text and asks
        botService.handle(update("{\"message\":{\"message_id\":3,\"chat\":{\"id\":8001,\"type\":\"private\"},\"text\":\"Спасибо заранее!\"}}"));
        assertThat(telegramAccounts.findByUserId(anna.getId())).get().satisfies(a -> assertThat(a.getPendingText()).isEqualTo("Спасибо заранее!"));
        verify(telegram, atLeastOnce()).sendMessage(eq(8001L), eq("Кому отправить это сообщение?"), anyList());

        // picking "my Santa" sends the kept text there
        DialogResponse annaAsRecipient = chatService.roomDialogs(room.id(), anna).get(1);
        botService.handle(update("{\"callback_query\":{\"id\":\"cb1\",\"data\":\"c:" + annaAsRecipient.id() + ":R\","
                + "\"message\":{\"message_id\":9,\"chat\":{\"id\":8001,\"type\":\"private\"}}}}"));
        assertThat(chatService.messages(annaAsRecipient.id(), anna, null)).extracting(ChatMessageResponse::text).containsExactly("Спасибо заранее!");
        assertThat(telegramAccounts.findByUserId(anna.getId())).get().satisfies(a -> {
            assertThat(a.getPendingText()).isNull();
            assertThat(a.getActiveRole()).isEqualTo(ChatRole.RECIPIENT);
        });
    }

    @Test
    void unknownTelegramUsersAreToldHowToConnect() throws Exception {
        enableTelegram();
        botService.handle(update("{\"message\":{\"message_id\":1,\"chat\":{\"id\":9001,\"type\":\"private\"},\"text\":\"привет\"}}"));
        verify(telegram).sendMessage(eq(9001L), org.mockito.ArgumentMatchers.contains("Подключить Telegram"));
    }

    private void enableTelegram() {
        when(telegram.enabled()).thenReturn(true);
        when(telegram.username()).thenReturn("SantaTestBot");
        when(telegram.sendMessage(anyLong(), anyString())).thenAnswer(i -> telegramMessageIds.incrementAndGet());
        when(telegram.sendMessage(anyLong(), anyString(), anyList())).thenAnswer(i -> telegramMessageIds.incrementAndGet());
    }

    private JsonNode update(String json) throws Exception {
        return JSON.readTree(json);
    }

    private User userByName(String name) {
        return List.of(anna, boris, vera).stream().filter(u -> u.getDisplayName().equals(name)).findFirst().orElseThrow();
    }

    private User register(String email, String displayName) {
        Long userId = authService.register(new RegisterRequest(email, "secret123", displayName)).userId();
        return userRepository.findById(userId).orElseThrow();
    }

    @TestConfiguration
    static class MailConfig {
        @Bean
        @Primary
        RecordingMail recordingMail() {
            return new RecordingMail();
        }
    }

    static class RecordingMail implements MailClient {
        final List<Map<String, String>> messages = new ArrayList<>();

        @Override
        public void send(String to, String subject, String text) {
            messages.add(Map.of("to", to, "subject", subject, "text", text));
        }
    }
}
