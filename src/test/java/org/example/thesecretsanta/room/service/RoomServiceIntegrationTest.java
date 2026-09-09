package org.example.thesecretsanta.room.service;

import org.example.thesecretsanta.auth.dto.RegisterRequest;
import org.example.thesecretsanta.auth.service.AuthService;
import org.example.thesecretsanta.room.dao.RoomRepository;
import org.example.thesecretsanta.room.domain.Room;
import org.example.thesecretsanta.room.domain.RoomStatus;
import org.example.thesecretsanta.room.dto.AddRestrictionRequest;
import org.example.thesecretsanta.room.dto.CreateRoomRequest;
import org.example.thesecretsanta.room.dto.JoinRoomRequest;
import org.example.thesecretsanta.room.dto.MyAssignmentResponse;
import org.example.thesecretsanta.room.dto.ParticipantResponse;
import org.example.thesecretsanta.room.dto.RoomResponse;
import org.example.thesecretsanta.room.dto.UpdateRoomRequest;
import org.example.thesecretsanta.room.dto.UpdateWishlistRequest;
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

    @Autowired
    private RoomRepository roomRepository;

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
    void createRoomRejectsPastCelebrationDate() {
        User owner = register("owner-past-create@example.com", "Past Create Owner");

        assertThatThrownBy(() -> roomService.createRoom(new CreateRoomRequest(
                "Past Room",
                null,
                LocalDate.now().minusDays(1),
                null,
                null,
                null
        ), owner))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Celebration date cannot be in the past");
    }

    @Test
    void updateRoomRejectsPastCelebrationDate() {
        User owner = register("owner-past-update@example.com", "Past Update Owner");
        RoomResponse room = roomService.createRoom(new CreateRoomRequest("Current Room", null, null, null, null, null), owner);

        assertThatThrownBy(() -> roomService.updateRoom(room.id(), new UpdateRoomRequest(
                "Current Room",
                null,
                LocalDate.now().minusDays(1),
                null
        ), owner))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Celebration date cannot be in the past");
    }

    @Test
    void ownerCanDeleteRoomButParticipantCannot() {
        User owner = register("owner-delete@example.com", "Delete Owner");
        User guest = register("guest-delete@example.com", "Delete Guest");
        RoomResponse room = roomService.createRoom(new CreateRoomRequest("Delete Room", null, null, null, null, null), owner);
        roomService.joinRoom(room.inviteCode(), new JoinRoomRequest(null, null), guest);

        assertThatThrownBy(() -> roomService.deleteRoom(room.id(), guest))
                .isInstanceOf(AccessDeniedException.class);

        roomService.deleteRoom(room.id(), owner);

        assertThat(roomRepository.findById(room.id())).isEmpty();
    }

    @Test
    void ownerCanDeleteDrawnRoomWithAssignmentsAndRestrictions() {
        User owner = register("owner-delete-drawn@example.com", "Delete Drawn Owner");
        User first = register("first-delete-drawn@example.com", "Delete Drawn First");
        User second = register("second-delete-drawn@example.com", "Delete Drawn Second");
        RoomResponse room = roomService.createRoom(new CreateRoomRequest("Delete Drawn Room", null, null, null, null, null), owner);
        roomService.joinRoom(room.inviteCode(), new JoinRoomRequest(null, null), first);
        RoomResponse withParticipants = roomService.joinRoom(room.inviteCode(), new JoinRoomRequest(null, null), second);
        Map<String, ParticipantResponse> participantsByName = withParticipants.participants().stream()
                .collect(Collectors.toMap(ParticipantResponse::displayName, Function.identity()));
        roomService.addRestriction(room.id(), new AddRestrictionRequest(
                participantsByName.get("Delete Drawn First").participantId(),
                participantsByName.get("Delete Drawn Second").participantId()
        ), owner);
        roomService.draw(room.id(), owner);

        roomService.deleteRoom(room.id(), owner);

        assertThat(roomRepository.findById(room.id())).isEmpty();
    }

    @Test
    void scheduledCleanupDeletesOnlyRoomsWithPastCelebrationDate() {
        User owner = register("owner-cleanup@example.com", "Cleanup Owner");
        Room expired = roomRepository.save(new Room(
                "Expired Room",
                null,
                LocalDate.now().minusDays(1),
                null,
                owner
        ));
        Room today = roomRepository.save(new Room(
                "Today Room",
                null,
                LocalDate.now(),
                null,
                owner
        ));
        Room future = roomRepository.save(new Room(
                "Future Room",
                null,
                LocalDate.now().plusDays(1),
                null,
                owner
        ));

        roomService.deleteExpiredRooms();

        assertThat(roomRepository.findById(expired.getId())).isEmpty();
        assertThat(roomRepository.findById(today.getId())).isPresent();
        assertThat(roomRepository.findById(future.getId())).isPresent();
    }

    @Test
    void repeatedJoinDoesNotDuplicateParticipantOrOverwriteWishlist() {
        User owner = register("owner-repeat@example.com", "Repeat Owner");
        User guest = register("guest-repeat@example.com", "Repeat Guest");
        RoomResponse room = roomService.createRoom(new CreateRoomRequest("Repeat Room", null, null, null, null, null), owner);

        roomService.joinRoom(room.inviteCode(), new JoinRoomRequest("Initial wishlist", null), guest);
        RoomResponse repeatedJoin = roomService.joinRoom(room.inviteCode(), new JoinRoomRequest("Changed wishlist", null), guest);

        assertThat(repeatedJoin.participants()).hasSize(2);
        RoomResponse guestView = roomService.getRoom(room.id(), guest);
        ParticipantResponse guestParticipant = guestView.participants().stream()
                .filter(participant -> participant.userId().equals(guest.getId()))
                .findFirst()
                .orElseThrow();
        assertThat(guestParticipant.wishlist()).isEqualTo("Initial wishlist");
    }

    @Test
    void participantsCanSeeOnlyTheirOwnWishlistBeforeDraw() {
        User owner = register("owner-privacy@example.com", "Privacy Owner");
        User guest = register("guest-privacy@example.com", "Privacy Guest");
        RoomResponse room = roomService.createRoom(new CreateRoomRequest(
                "Privacy Room",
                null,
                null,
                null,
                "Owner private wishlist",
                null
        ), owner);
        roomService.joinRoom(room.inviteCode(), new JoinRoomRequest("Guest private wishlist", null), guest);

        RoomResponse guestView = roomService.getRoom(room.id(), guest);

        Map<Long, ParticipantResponse> participantsByUserId = guestView.participants().stream()
                .collect(Collectors.toMap(ParticipantResponse::userId, Function.identity()));
        assertThat(participantsByUserId.get(owner.getId()).wishlist()).isNull();
        assertThat(participantsByUserId.get(guest.getId()).wishlist()).isEqualTo("Guest private wishlist");
    }

    @Test
    void participantCanUpdateOwnWishlistBeforeDraw() {
        User owner = register("owner-wishlist-update@example.com", "Wishlist Owner");
        User guest = register("guest-wishlist-update@example.com", "Wishlist Guest");
        RoomResponse room = roomService.createRoom(new CreateRoomRequest("Wishlist Room", null, null, null, null, null), owner);
        roomService.joinRoom(room.inviteCode(), new JoinRoomRequest("Old wishlist", "https://example.com/old"), guest);

        RoomResponse updated = roomService.updateMyWishlist(room.id(), new UpdateWishlistRequest(
                "New wishlist",
                "https://example.com/new"
        ), guest);

        ParticipantResponse guestParticipant = updated.participants().stream()
                .filter(participant -> participant.userId().equals(guest.getId()))
                .findFirst()
                .orElseThrow();
        assertThat(guestParticipant.wishlist()).isEqualTo("New wishlist");
        assertThat(guestParticipant.wishlistLinks()).isEqualTo("https://example.com/new");
    }

    @Test
    void participantCannotUpdateWishlistAfterDraw() {
        User owner = register("owner-wishlist-drawn@example.com", "Wishlist Drawn Owner");
        User first = register("first-wishlist-drawn@example.com", "Wishlist Drawn First");
        User second = register("second-wishlist-drawn@example.com", "Wishlist Drawn Second");
        RoomResponse room = roomService.createRoom(new CreateRoomRequest("Wishlist Drawn Room", null, null, null, null, null), owner);
        roomService.joinRoom(room.inviteCode(), new JoinRoomRequest("First wishlist", null), first);
        roomService.joinRoom(room.inviteCode(), new JoinRoomRequest("Second wishlist", null), second);
        roomService.draw(room.id(), owner);

        assertThatThrownBy(() -> roomService.updateMyWishlist(room.id(), new UpdateWishlistRequest("Changed", null), first))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Room is already drawn or closed");
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
    void drawFailsWithoutChangingRoomWhenRestrictionsMakeAssignmentImpossible() {
        User owner = register("owner-impossible@example.com", "Impossible Owner");
        User first = register("first-impossible@example.com", "Impossible First");
        User second = register("second-impossible@example.com", "Impossible Second");
        RoomResponse room = roomService.createRoom(new CreateRoomRequest("Impossible Room", null, null, null, null, null), owner);
        roomService.joinRoom(room.inviteCode(), new JoinRoomRequest(null, null), first);
        RoomResponse withParticipants = roomService.joinRoom(room.inviteCode(), new JoinRoomRequest(null, null), second);
        Map<String, ParticipantResponse> participantsByName = withParticipants.participants().stream()
                .collect(Collectors.toMap(ParticipantResponse::displayName, Function.identity()));

        roomService.addRestriction(room.id(), new AddRestrictionRequest(
                participantsByName.get("Impossible Owner").participantId(),
                participantsByName.get("Impossible First").participantId()
        ), owner);
        roomService.addRestriction(room.id(), new AddRestrictionRequest(
                participantsByName.get("Impossible Owner").participantId(),
                participantsByName.get("Impossible Second").participantId()
        ), owner);

        assertThatThrownBy(() -> roomService.draw(room.id(), owner))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Cannot build a valid draw with the current restrictions");
        assertThat(roomService.getRoom(room.id(), owner).status()).isEqualTo(RoomStatus.OPEN);
    }

    @Test
    void drawRequiresAtLeastThreeParticipants() {
        User owner = register("owner-small@example.com", "Small Owner");
        User guest = register("guest-small@example.com", "Small Guest");
        RoomResponse room = roomService.createRoom(new CreateRoomRequest("Small Room", null, null, null, null, null), owner);
        roomService.joinRoom(room.inviteCode(), new JoinRoomRequest(null, null), guest);

        assertThatThrownBy(() -> roomService.draw(room.id(), owner))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("At least 3 participants are required for a Secret Santa draw");
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
