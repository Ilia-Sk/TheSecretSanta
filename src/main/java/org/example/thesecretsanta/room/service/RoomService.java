package org.example.thesecretsanta.room.service;

import jakarta.persistence.EntityNotFoundException;
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
import org.example.thesecretsanta.user.domain.User;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
    private final RoomRepository roomRepository;
    private final RoomParticipantRepository participantRepository;
    private final DrawRestrictionRepository restrictionRepository;
    private final GiftAssignmentRepository assignmentRepository;

    public RoomService(
            RoomRepository roomRepository,
            RoomParticipantRepository participantRepository,
            DrawRestrictionRepository restrictionRepository,
            GiftAssignmentRepository assignmentRepository
    ) {
        this.roomRepository = roomRepository;
        this.participantRepository = participantRepository;
        this.restrictionRepository = restrictionRepository;
        this.assignmentRepository = assignmentRepository;
    }

    @Transactional
    public RoomResponse createRoom(CreateRoomRequest request, User currentUser) {
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
        room.updateDetails(
                request.name().trim(),
                trimToNull(request.description()),
                request.celebrationDate(),
                request.giftBudget()
        );
        return getRoom(roomId, currentUser);
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

    private Optional<List<GiftAssignment>> buildAssignments(Room room, List<RoomParticipant> participants, Map<Long, Set<Long>> forbidden) {
        for (int attempt = 0; attempt < 300; attempt++) {
            List<RoomParticipant> receivers = new ArrayList<>(participants);
            Collections.shuffle(receivers);
            Set<Long> usedReceivers = new HashSet<>();
            List<GiftAssignment> assignments = new ArrayList<>();
            boolean valid = true;

            for (int i = 0; i < participants.size(); i++) {
                RoomParticipant giver = participants.get(i);
                RoomParticipant receiver = receivers.get(i);
                Set<Long> forbiddenForGiver = forbidden.getOrDefault(giver.getId(), Set.of());
                if (giver.getId().equals(receiver.getId()) || forbiddenForGiver.contains(receiver.getId()) || !usedReceivers.add(receiver.getId())) {
                    valid = false;
                    break;
                }
                assignments.add(new GiftAssignment(room, giver, receiver));
            }
            if (valid) {
                return Optional.of(assignments);
            }
        }
        return Optional.empty();
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
}
