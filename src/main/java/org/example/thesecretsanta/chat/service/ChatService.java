package org.example.thesecretsanta.chat.service;

import jakarta.persistence.EntityNotFoundException;
import org.example.thesecretsanta.chat.dao.ChatMessageRepository;
import org.example.thesecretsanta.chat.domain.ChatMessage;
import org.example.thesecretsanta.chat.domain.ChatRole;
import org.example.thesecretsanta.chat.domain.MessageSource;
import org.example.thesecretsanta.chat.dto.ChatMessageResponse;
import org.example.thesecretsanta.chat.dto.DialogResponse;
import org.example.thesecretsanta.room.dao.GiftAssignmentRepository;
import org.example.thesecretsanta.room.dao.RoomParticipantRepository;
import org.example.thesecretsanta.room.dao.RoomRepository;
import org.example.thesecretsanta.room.domain.GiftAssignment;
import org.example.thesecretsanta.room.domain.Room;
import org.example.thesecretsanta.room.domain.RoomParticipant;
import org.example.thesecretsanta.room.domain.RoomStatus;
import org.example.thesecretsanta.user.domain.User;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Anonymous chat between a Secret Santa and their recipient. A conversation is a
 * gift assignment, so it exists only after the draw and only for those two people.
 * The Santa's identity never leaves the server: messages carry a role, not an author.
 */
@Service
public class ChatService {
    private final ChatMessageRepository messageRepository;
    private final GiftAssignmentRepository assignmentRepository;
    private final RoomRepository roomRepository;
    private final RoomParticipantRepository participantRepository;
    private final ChatNotifier notifier;

    public ChatService(
            ChatMessageRepository messageRepository,
            GiftAssignmentRepository assignmentRepository,
            RoomRepository roomRepository,
            RoomParticipantRepository participantRepository,
            ChatNotifier notifier
    ) {
        this.messageRepository = messageRepository;
        this.assignmentRepository = assignmentRepository;
        this.roomRepository = roomRepository;
        this.participantRepository = participantRepository;
        this.notifier = notifier;
    }

    /** The two conversations of a room: with my recipient and with my Santa. */
    @Transactional(readOnly = true)
    public List<DialogResponse> roomDialogs(Long roomId, User user) {
        Room room = roomRepository.findById(roomId)
                .orElseThrow(() -> new EntityNotFoundException("Room not found"));
        RoomParticipant me = participantRepository.findByRoomAndUser(room, user)
                .orElseThrow(() -> new AccessDeniedException("You are not a participant of this room"));
        if (room.getStatus() != RoomStatus.DRAWN) {
            return List.of();
        }
        List<DialogResponse> dialogs = new ArrayList<>();
        assignmentRepository.findByRoomAndGiver(room, me)
                .ifPresent(a -> dialogs.add(toDialog(new ChatParty(a, ChatRole.SANTA))));
        assignmentRepository.findByRoomAndReceiver(room, me)
                .ifPresent(a -> dialogs.add(toDialog(new ChatParty(a, ChatRole.RECIPIENT))));
        return dialogs;
    }

    /** Every conversation of the user across rooms (the Telegram chat list). */
    @Transactional(readOnly = true)
    public List<ChatParty> allParties(User user) {
        List<ChatParty> parties = new ArrayList<>();
        for (GiftAssignment assignment : assignmentRepository.findAllInvolving(user)) {
            if (assignment.getRoom().getStatus() != RoomStatus.DRAWN) {
                continue;
            }
            // In a 2+ person draw a user is never their own recipient, but be explicit.
            if (assignment.getGiver().getUser().getId().equals(user.getId())) {
                parties.add(new ChatParty(assignment, ChatRole.SANTA));
            }
            if (assignment.getReceiver().getUser().getId().equals(user.getId())) {
                parties.add(new ChatParty(assignment, ChatRole.RECIPIENT));
            }
        }
        return parties;
    }

    /** Messages of a conversation (all, or only newer than {@code afterId}); marks the other side's ones read. */
    @Transactional
    public List<ChatMessageResponse> messages(Long assignmentId, User user, Long afterId) {
        ChatParty party = party(assignmentId, user);
        List<ChatMessage> messages = afterId == null
                ? messageRepository.findByAssignmentIdOrderByIdAsc(assignmentId)
                : messageRepository.findByAssignmentIdAndIdGreaterThanOrderByIdAsc(assignmentId, afterId);
        messageRepository.markRead(assignmentId, party.role().other(), Instant.now());
        return messages.stream().map(m -> toResponse(m, party.role())).toList();
    }

    @Transactional
    public ChatMessageResponse send(Long assignmentId, User user, String text, MessageSource source) {
        return toResponse(post(party(assignmentId, user), text, source), null);
    }

    /** Posts as an already resolved party (used by the Telegram bot). */
    @Transactional
    public ChatMessage post(ChatParty party, String text, MessageSource source) {
        String clean = text == null ? "" : text.strip();
        if (clean.isEmpty()) {
            throw new IllegalArgumentException("Message is empty");
        }
        if (clean.length() > ChatMessage.MAX_LENGTH) {
            throw new IllegalArgumentException("Message is too long");
        }
        ChatMessage saved = messageRepository.save(new ChatMessage(party.assignment(), party.role(), clean, source));
        notifier.messageSent(saved, party);
        return saved;
    }

    /** Resolves the user's side of a conversation, or refuses if they are not part of it. */
    @Transactional(readOnly = true)
    public ChatParty party(Long assignmentId, User user) {
        GiftAssignment assignment = assignmentRepository.findById(assignmentId)
                .orElseThrow(() -> new EntityNotFoundException("Chat not found"));
        ChatRole role = ChatParty.roleOf(assignment, user);
        if (role == null) {
            throw new AccessDeniedException("You are not part of this chat");
        }
        if (assignment.getRoom().getStatus() != RoomStatus.DRAWN) {
            throw new IllegalArgumentException("Chat opens after the draw");
        }
        return new ChatParty(assignment, role);
    }

    public Optional<ChatParty> findParty(Long assignmentId, ChatRole role, User user) {
        return assignmentRepository.findById(assignmentId)
                .filter(a -> a.getRoom().getStatus() == RoomStatus.DRAWN)
                .filter(a -> ChatParty.roleOf(a, user) == role)
                .map(a -> new ChatParty(a, role));
    }

    private DialogResponse toDialog(ChatParty party) {
        GiftAssignment a = party.assignment();
        Optional<ChatMessage> last = messageRepository.findFirstByAssignmentIdOrderByIdDesc(a.getId());
        return new DialogResponse(
                a.getId(),
                a.getRoom().getId(),
                a.getRoom().getName(),
                party.role(),
                party.title(),
                party.role() == ChatRole.SANTA ? a.getReceiver().getUser().getAvatarUrl() : null,
                last.map(ChatMessage::getText).orElse(null),
                last.map(ChatMessage::getCreatedAt).orElse(null),
                last.map(m -> m.getAuthorRole() == party.role()).orElse(false),
                messageRepository.countByAssignmentIdAndAuthorRoleAndReadAtIsNull(a.getId(), party.role().other())
        );
    }

    private ChatMessageResponse toResponse(ChatMessage message, ChatRole viewer) {
        boolean mine = viewer == null || message.getAuthorRole() == viewer;
        return new ChatMessageResponse(message.getId(), mine, message.getText(), message.getCreatedAt(), message.getReadAt() != null);
    }
}
