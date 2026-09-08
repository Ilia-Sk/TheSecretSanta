package org.example.thesecretsanta.room.service;

import org.example.thesecretsanta.auth.dto.RegisterRequest;
import org.example.thesecretsanta.auth.service.AuthService;
import org.example.thesecretsanta.room.domain.RoomStatus;
import org.example.thesecretsanta.room.dto.AddRestrictionRequest;
import org.example.thesecretsanta.room.dto.CreateRoomRequest;
import org.example.thesecretsanta.room.dto.JoinRoomRequest;
import org.example.thesecretsanta.room.dto.MyAssignmentResponse;
import org.example.thesecretsanta.room.dto.ParticipantResponse;
import org.example.thesecretsanta.room.dto.RoomResponse;
import org.example.thesecretsanta.user.dao.UserRepository;
import org.example.thesecretsanta.user.domain.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class RoomServiceIntegrationTest {
    @Autowired
    private AuthService authService;

    @Autowired
    private RoomService roomService;

    @Autowired
    private UserRepository userRepository;

    @Test
    void ownerCreatesRoomAndParticipantsJoinByInviteCode() {
        User owner = register("owner-room@example.com", "Хозяин");
        User guest = register("guest-room@example.com", "Гость");

        RoomResponse created = roomService.createRoom(new CreateRoomRequest(
                "День Рождения Валеры",
                "Праздничный обмен подарками",
                LocalDate.of(2026, 12, 31),
                BigDecimal.valueOf(50),
                "Кофе",
                "https://example.com/coffee"
        ), owner);
        RoomResponse joined = roomService.joinRoom(created.inviteCode(), new JoinRoomRequest(
                "Книга",
                "https://example.com/book"
        ), guest);

        assertThat(joined.id()).isEqualTo(created.id());
        assertThat(joined.name()).isEqualTo("День Рождения Валеры");
        assertThat(joined.participants()).hasSize(2);
        assertThat(joined.owner()).isFalse();
    }

    @Test
    void drawRespectsRestrictionsAndShowsOnlyCurrentUsersReceiver() {
        User owner = register("owner-draw@example.com", "Организатор");
        User anna = register("anna-draw@example.com", "Анна");
        User boris = register("boris-draw@example.com", "Борис");
        User dasha = register("dasha-draw@example.com", "Даша");

        RoomResponse room = roomService.createRoom(new CreateRoomRequest(
                "Christmas Party",
                null,
                null,
                null,
                "Organizer wishlist",
                null
        ), owner);
        roomService.joinRoom(room.inviteCode(), new JoinRoomRequest("Anna wishlist", "https://example.com/anna"), anna);
        roomService.joinRoom(room.inviteCode(), new JoinRoomRequest("Boris wishlist", null), boris);
        RoomResponse withParticipants = roomService.joinRoom(room.inviteCode(), new JoinRoomRequest("Dasha wishlist", null), dasha);

        Map<String, ParticipantResponse> participantsByName = withParticipants.participants().stream()
                .collect(Collectors.toMap(ParticipantResponse::displayName, Function.identity()));
        roomService.addRestriction(room.id(), new AddRestrictionRequest(
                participantsByName.get("Анна").participantId(),
                participantsByName.get("Борис").participantId()
        ), owner);

        RoomResponse drawn = roomService.draw(room.id(), owner);
        MyAssignmentResponse annaAssignment = roomService.getMyAssignment(room.id(), anna);
        MyAssignmentResponse ownerAssignment = roomService.getMyAssignment(room.id(), owner);

        assertThat(drawn.status()).isEqualTo(RoomStatus.DRAWN);
        assertThat(annaAssignment.receiverName()).isNotEqualTo("Анна");
        assertThat(annaAssignment.receiverName()).isNotEqualTo("Борис");
        assertThat(ownerAssignment.receiverName()).isNotEqualTo("Организатор");
        assertThat(annaAssignment.receiverWishlist()).isNotBlank();
    }

    @Test
    void nonOwnerCannotAddRestrictionsOrStartDraw() {
        User owner = register("owner-security@example.com", "Создатель");
        User guest = register("guest-security@example.com", "Участник");

        RoomResponse room = roomService.createRoom(new CreateRoomRequest("Secret Room", null, null, null, null, null), owner);
        RoomResponse joined = roomService.joinRoom(room.inviteCode(), new JoinRoomRequest(null, null), guest);
        Long ownerParticipantId = joined.participants().stream()
                .filter(ParticipantResponse::owner)
                .findFirst()
                .orElseThrow()
                .participantId();
        Long guestParticipantId = joined.participants().stream()
                .filter(participant -> !participant.owner())
                .findFirst()
                .orElseThrow()
                .participantId();

        assertThatThrownBy(() -> roomService.addRestriction(room.id(), new AddRestrictionRequest(guestParticipantId, ownerParticipantId), guest))
                .isInstanceOf(AccessDeniedException.class);

        assertThatThrownBy(() -> roomService.draw(room.id(), guest))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void roomCannotBeModifiedAfterDraw() {
        User owner = register("owner-closed@example.com", "Главный");
        User first = register("first-closed@example.com", "Первый");
        User second = register("second-closed@example.com", "Второй");

        RoomResponse room = roomService.createRoom(new CreateRoomRequest("Closed Room", null, null, null, null, null), owner);
        roomService.joinRoom(room.inviteCode(), new JoinRoomRequest(null, null), first);
        roomService.joinRoom(room.inviteCode(), new JoinRoomRequest(null, null), second);
        roomService.draw(room.id(), owner);

        assertThatThrownBy(() -> roomService.joinRoom(room.inviteCode(), new JoinRoomRequest(null, null), register("late@example.com", "Опоздавший")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Room is already drawn or closed");

        assertThatThrownBy(() -> roomService.draw(room.id(), owner))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Room is already drawn or closed");
    }

    private User register(String email, String displayName) {
        Long userId = authService.register(new RegisterRequest(email, "secret123", displayName)).userId();
        return userRepository.findById(userId).orElseThrow();
    }
}
