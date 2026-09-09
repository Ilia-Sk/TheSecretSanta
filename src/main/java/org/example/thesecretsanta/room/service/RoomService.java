package org.example.thesecretsanta.room.service;

import jakarta.persistence.EntityNotFoundException;
import org.example.thesecretsanta.config.AppProperties;
import org.example.thesecretsanta.mail.MailClient;
import org.example.thesecretsanta.room.dao.DrawRestrictionRepository;
import org.example.thesecretsanta.room.dao.GiftAssignmentRepository;
import org.example.thesecretsanta.room.dao.RoomParticipantRepository;
import org.example.thesecretsanta.room.dao.RoomRepository;
import org.example.thesecretsanta.room.domain.DrawRestriction;
import org.example.thesecretsanta.room.domain.GiftAssignment;
import org.example.thesecretsanta.room.domain.Room;
import org.example.thesecretsanta.room.domain.RoomParticipant;
import org.example.thesecretsanta.room.domain.RoomStatus;
import org.example.thesecretsanta.room.dto.AddRestrictionRequest;
import org.example.thesecretsanta.room.dto.CreateRoomRequest;
import org.example.thesecretsanta.room.dto.JoinRoomRequest;
import org.example.thesecretsanta.room.dto.InvitePreviewResponse;
import org.example.thesecretsanta.room.dto.MyAssignmentResponse;
import org.example.thesecretsanta.room.dto.ParticipantResponse;
import org.example.thesecretsanta.room.dto.RestrictionResponse;
import org.example.thesecretsanta.room.dto.RoomResponse;
import org.example.thesecretsanta.room.dto.UpdateRoomRequest;
import org.example.thesecretsanta.room.dto.UpdateWishlistRequest;
import org.example.thesecretsanta.user.domain.User;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class RoomService {
    private static final SecureRandom DRAW_RANDOM = new SecureRandom();

    private final RoomRepository roomRepository;
    private final RoomParticipantRepository participantRepository;
    private final DrawRestrictionRepository restrictionRepository;
    private final GiftAssignmentRepository assignmentRepository;
    private final MailClient mailClient;
    private final AppProperties appProperties;

    public RoomService(
            RoomRepository roomRepository,
            RoomParticipantRepository participantRepository,
            DrawRestrictionRepository restrictionRepository,
            GiftAssignmentRepository assignmentRepository,
            MailClient mailClient,
            AppProperties appProperties
    ) {
        this.roomRepository = roomRepository;
        this.participantRepository = participantRepository;
        this.restrictionRepository = restrictionRepository;
        this.assignmentRepository = assignmentRepository;
        this.mailClient = mailClient;
        this.appProperties = appProperties;
    }

    @Transactional
    public RoomResponse createRoom(CreateRoomRequest request, User currentUser) {
        validateCelebrationDate(request.celebrationDate());
        Room room = new Room(
                request.name().trim(),
                trimToNull(request.description()),
                request.celebrationDate(),
                request.giftBudget(),
                currentUser
        );
        Room savedRoom = roomRepository.save(room);
        participantRepository.save(new RoomParticipant(savedRoom, currentUser, trimToNull(request.wishlist()), trimToNull(request.wishlistLinks())));
        return getRoom(savedRoom.getId(), currentUser);
    }

    @Transactional(readOnly = true)
    public List<RoomResponse> getMyRooms(User currentUser) {
        return roomRepository.findDistinctByOwnerOrParticipants_User(currentUser, currentUser).stream()
                .map(room -> mapRoom(room, currentUser))
                .toList();
    }

    @Transactional(readOnly = true)
    public RoomResponse getRoom(Long roomId, User currentUser) {
        Room room = findRoom(roomId);
        requireParticipant(room, currentUser);
        return mapRoom(room, currentUser);
    }

    @Transactional(readOnly = true)
    public InvitePreviewResponse previewInvite(String inviteCode) {
        Room room = roomRepository.findByInviteCode(inviteCode)
                .orElseThrow(() -> new EntityNotFoundException("Room invite not found"));
        return new InvitePreviewResponse(room.getId(), room.getName(), room.getDescription(), room.getStatus());
    }

    @Transactional
    public RoomResponse joinRoom(String inviteCode, JoinRoomRequest request, User currentUser) {
        Room room = roomRepository.findByInviteCode(inviteCode)
                .orElseThrow(() -> new EntityNotFoundException("Room invite not found"));
        ensureOpen(room);

        if (!participantRepository.existsByRoomAndUser(room, currentUser)) {
            participantRepository.save(new RoomParticipant(room, currentUser, trimToNull(request.wishlist()), trimToNull(request.wishlistLinks())));
        }
        return getRoom(room.getId(), currentUser);
    }

    @Transactional
    public RoomResponse updateMyWishlist(Long roomId, UpdateWishlistRequest request, User currentUser) {
        Room room = findRoom(roomId);
        ensureOpen(room);
        RoomParticipant participant = requireParticipant(room, currentUser);
        participant.updateWishlist(trimToNull(request.wishlist()), trimToNull(request.wishlistLinks()));
        return getRoom(roomId, currentUser);
    }

    @Transactional
    public RoomResponse addRestriction(Long roomId, AddRestrictionRequest request, User currentUser) {
        Room room = findRoom(roomId);
        requireOwner(room, currentUser);
        ensureOpen(room);

        RoomParticipant giver = findParticipantInRoom(request.giverParticipantId(), room);
        RoomParticipant receiver = findParticipantInRoom(request.receiverParticipantId(), room);
        if (giver.getId().equals(receiver.getId())) {
            throw new IllegalArgumentException("Participant cannot be restricted from themselves");
        }
        if (!restrictionRepository.existsByRoomAndGiverAndReceiver(room, giver, receiver)) {
            restrictionRepository.save(new DrawRestriction(room, giver, receiver));
        }
        return getRoom(roomId, currentUser);
    }

    @Transactional
    public RoomResponse updateRoom(Long roomId, UpdateRoomRequest request, User currentUser) {
        Room room = findRoom(roomId);
        requireOwner(room, currentUser);
        ensureOpen(room);
        validateCelebrationDate(request.celebrationDate());
        room.updateDetails(
                request.name().trim(),
                trimToNull(request.description()),
                request.celebrationDate(),
                request.giftBudget()
        );
        return getRoom(roomId, currentUser);
    }

    @Transactional
    public void deleteRoom(Long roomId, User currentUser) {
        Room room = findRoom(roomId);
        requireOwner(room, currentUser);
        deleteRoomGraph(room);
    }

    @Transactional
    public RoomResponse deleteRestriction(Long roomId, Long restrictionId, User currentUser) {
        Room room = findRoom(roomId);
        requireOwner(room, currentUser);
        ensureOpen(room);
        DrawRestriction restriction = restrictionRepository.findById(restrictionId)
                .orElseThrow(() -> new EntityNotFoundException("Restriction not found"));
        if (!restriction.getRoom().getId().equals(room.getId())) {
            throw new IllegalArgumentException("Restriction belongs to another room");
        }
        restrictionRepository.delete(restriction);
        return getRoom(roomId, currentUser);
    }

    @Transactional
    public RoomResponse draw(Long roomId, User currentUser) {
        Room room = findRoom(roomId);
        requireOwner(room, currentUser);
        ensureOpen(room);

        List<RoomParticipant> participants = participantRepository.findByRoomId(roomId);
        if (participants.size() < 3) {
            throw new IllegalArgumentException("At least 3 participants are required for a Secret Santa draw");
        }

        Map<Long, Set<Long>> forbidden = restrictionRepository.findByRoomId(roomId).stream()
                .collect(Collectors.groupingBy(
                        restriction -> restriction.getGiver().getId(),
                        Collectors.mapping(restriction -> restriction.getReceiver().getId(), Collectors.toSet())
                ));

        List<GiftAssignment> assignments = buildAssignments(room, participants, forbidden)
                .orElseThrow(() -> new IllegalArgumentException("Cannot build a valid draw with the current restrictions"));
        assignmentRepository.saveAll(assignments);
        room.markDrawn();
        sendDrawNotifications(room, assignments);
        return getRoom(roomId, currentUser);
    }

    @Transactional(readOnly = true)
    public MyAssignmentResponse getMyAssignment(Long roomId, User currentUser) {
        Room room = findRoom(roomId);
        RoomParticipant giver = requireParticipant(room, currentUser);
        if (room.getStatus() != RoomStatus.DRAWN) {
            throw new IllegalArgumentException("Draw has not been completed yet");
        }
        GiftAssignment assignment = assignmentRepository.findByRoomAndGiver(room, giver)
                .orElseThrow(() -> new EntityNotFoundException("Assignment not found"));
        RoomParticipant receiver = assignment.getReceiver();
        return new MyAssignmentResponse(
                receiver.getUser().getId(),
                receiver.getUser().getDisplayName(),
                receiver.getUser().getAvatarUrl(),
                receiver.getWishlist(),
                receiver.getWishlistLinks()
        );
    }

    @Scheduled(cron = "0 5 0 * * *")
    @Transactional
    public void deleteExpiredRooms() {
        roomRepository.findByCelebrationDateBefore(LocalDate.now())
                .forEach(this::deleteRoomGraph);
    }

    private void deleteRoomGraph(Room room) {
        assignmentRepository.deleteByRoom(room);
        restrictionRepository.deleteByRoom(room);
        participantRepository.deleteByRoom(room);
        roomRepository.delete(room);
    }

    private void validateCelebrationDate(LocalDate celebrationDate) {
        if (celebrationDate != null && celebrationDate.isBefore(LocalDate.now())) {
            throw new IllegalArgumentException("Celebration date cannot be in the past");
        }
    }

    private Optional<List<GiftAssignment>> buildAssignments(Room room, List<RoomParticipant> participants, Map<Long, Set<Long>> forbidden) {
        List<GiftAssignment> assignments = new ArrayList<>();
        Set<Long> usedReceivers = new HashSet<>();
        if (assignReceiver(room, participants, participants, forbidden, assignments, usedReceivers, 0)) {
            return Optional.of(assignments);
        }
        return Optional.empty();
    }

    private boolean assignReceiver(
            Room room,
            List<RoomParticipant> givers,
            List<RoomParticipant> receivers,
            Map<Long, Set<Long>> forbidden,
            List<GiftAssignment> assignments,
            Set<Long> usedReceivers,
            int giverIndex
    ) {
        if (giverIndex == givers.size()) {
            return true;
        }

        RoomParticipant giver = givers.get(giverIndex);
        Set<Long> forbiddenForGiver = forbidden.getOrDefault(giver.getId(), Set.of());
        List<RoomParticipant> candidateReceivers = new ArrayList<>(receivers);
        Collections.shuffle(candidateReceivers, DRAW_RANDOM);

        for (RoomParticipant receiver : candidateReceivers) {
            if (giver.getId().equals(receiver.getId())
                    || forbiddenForGiver.contains(receiver.getId())
                    || usedReceivers.contains(receiver.getId())) {
                continue;
            }

            assignments.add(new GiftAssignment(room, giver, receiver));
            usedReceivers.add(receiver.getId());
            if (assignReceiver(room, givers, receivers, forbidden, assignments, usedReceivers, giverIndex + 1)) {
                return true;
            }
            usedReceivers.remove(receiver.getId());
            assignments.remove(assignments.size() - 1);
        }
        return false;
    }

    private RoomResponse mapRoom(Room room, User currentUser) {
        List<ParticipantResponse> participants = participantRepository.findByRoomId(room.getId()).stream()
                .map(participant -> new ParticipantResponse(
                        participant.getId(),
                        participant.getUser().getId(),
                        participant.getUser().getDisplayName(),
                        participant.getUser().getAvatarUrl(),
                        room.getOwner().getId().equals(participant.getUser().getId()),
                        participant.getUser().getId().equals(currentUser.getId()) ? participant.getWishlist() : null,
                        participant.getUser().getId().equals(currentUser.getId()) ? participant.getWishlistLinks() : null
                ))
                .toList();
        List<RestrictionResponse> restrictions = restrictionRepository.findByRoomId(room.getId()).stream()
                .map(restriction -> new RestrictionResponse(
                        restriction.getId(),
                        restriction.getGiver().getId(),
                        restriction.getGiver().getUser().getDisplayName(),
                        restriction.getReceiver().getId(),
                        restriction.getReceiver().getUser().getDisplayName()
                ))
                .toList();
        return new RoomResponse(
                room.getId(),
                room.getName(),
                room.getDescription(),
                room.getCelebrationDate(),
                room.getGiftBudget(),
                room.getInviteCode(),
                room.getStatus(),
                room.getOwner().getId(),
                room.isOwner(currentUser),
                participants,
                restrictions
        );
    }

    private Room findRoom(Long roomId) {
        return roomRepository.findById(roomId)
                .orElseThrow(() -> new EntityNotFoundException("Room not found"));
    }

    private RoomParticipant requireParticipant(Room room, User user) {
        return participantRepository.findByRoomAndUser(room, user)
                .orElseThrow(() -> new AccessDeniedException("You are not a participant of this room"));
    }

    private void requireOwner(Room room, User user) {
        if (!room.isOwner(user)) {
            throw new AccessDeniedException("Only room owner can perform this action");
        }
    }

    private RoomParticipant findParticipantInRoom(Long participantId, Room room) {
        RoomParticipant participant = participantRepository.findById(participantId)
                .orElseThrow(() -> new EntityNotFoundException("Participant not found"));
        if (!participant.getRoom().getId().equals(room.getId())) {
            throw new IllegalArgumentException("Participant belongs to another room");
        }
        return participant;
    }

    private void ensureOpen(Room room) {
        if (room.getStatus() != RoomStatus.OPEN) {
            throw new IllegalArgumentException("Room is already drawn or closed");
        }
    }

    private String trimToNull(String value) {
        if (value == null || value.trim().isBlank()) {
            return null;
        }
        return value.trim();
    }

    private void sendDrawNotifications(Room room, List<GiftAssignment> assignments) {
        for (GiftAssignment assignment : assignments) {
            RoomParticipant giver = assignment.getGiver();
            RoomParticipant receiver = assignment.getReceiver();
            String text = """
                    В комнате "%s" проведена жеребьевка.

                    Вы дарите подарок: %s

                    Пожелания:
                    %s

                    Открыть сайт: %s
                    """.formatted(
                    room.getName(),
                    receiver.getUser().getDisplayName(),
                    receiver.getWishlist() == null ? "Пожелания не указаны." : receiver.getWishlist(),
                    appProperties.publicUrl()
            );
            mailClient.send(giver.getUser().getEmail(), "The Secret Santa: жеребьевка проведена", text);
        }
    }
}
