package org.example.thesecretsanta.mail;

import org.example.thesecretsanta.auth.dto.ForgotPasswordRequest;
import org.example.thesecretsanta.auth.dto.RegisterRequest;
import org.example.thesecretsanta.auth.service.AuthService;
import org.example.thesecretsanta.room.dto.CreateRoomRequest;
import org.example.thesecretsanta.room.dto.JoinRoomRequest;
import org.example.thesecretsanta.room.dto.RoomResponse;
import org.example.thesecretsanta.room.service.RoomService;
import org.example.thesecretsanta.user.dao.UserRepository;
import org.example.thesecretsanta.user.domain.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class MailNotificationIntegrationTest {
    @Autowired
    private AuthService authService;

    @Autowired
    private RoomService roomService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RecordingMailClient mailClient;

    @BeforeEach
    void clearMailbox() {
        mailClient.clear();
    }

    @Test
    void forgotPasswordSendsResetEmailOnlyForExistingUser() {
        authService.register(new RegisterRequest("reset-mail@example.com", "secret123", "Reset Mail"));

        authService.forgotPassword(new ForgotPasswordRequest("reset-mail@example.com"));
        authService.forgotPassword(new ForgotPasswordRequest("missing-mail@example.com"));

        assertThat(mailClient.messages())
                .singleElement()
                .satisfies(message -> {
                    assertThat(message.to()).isEqualTo("reset-mail@example.com");
                    assertThat(message.subject()).contains("восстановление пароля");
                    assertThat(message.text()).contains("/reset-password?token=");
                });
    }

    @Test
    void drawSendsOneNotificationToEachParticipant() {
        User owner = register("owner-mail@example.com", "Mail Owner");
        User first = register("first-mail@example.com", "Mail First");
        User second = register("second-mail@example.com", "Mail Second");
        RoomResponse room = roomService.createRoom(new CreateRoomRequest(
                "Mail Room",
                null,
                null,
                null,
                "Owner wishlist",
                null
        ), owner);
        roomService.joinRoom(room.inviteCode(), new JoinRoomRequest("First wishlist", null), first);
        roomService.joinRoom(room.inviteCode(), new JoinRoomRequest("Second wishlist", null), second);

        roomService.draw(room.id(), owner);

        assertThat(mailClient.messages())
                .extracting(SentMail::to)
                .containsExactlyInAnyOrder("owner-mail@example.com", "first-mail@example.com", "second-mail@example.com");
        assertThat(mailClient.messages())
                .allSatisfy(message -> {
                    assertThat(message.subject()).contains("жеребьевка проведена");
                    assertThat(message.text()).contains("Mail Room");
                });
    }

    private User register(String email, String displayName) {
        Long userId = authService.register(new RegisterRequest(email, "secret123", displayName)).userId();
        return userRepository.findById(userId).orElseThrow();
    }

    @TestConfiguration
    static class MailTestConfiguration {
        @Bean
        @Primary
        RecordingMailClient recordingMailClient() {
            return new RecordingMailClient();
        }
    }

    static class RecordingMailClient implements MailClient {
        private final List<SentMail> messages = new ArrayList<>();

        @Override
        public void send(String to, String subject, String text) {
            messages.add(new SentMail(to, subject, text));
        }

        List<SentMail> messages() {
            return messages;
        }

        void clear() {
            messages.clear();
        }
    }

    record SentMail(String to, String subject, String text) {
    }
}
