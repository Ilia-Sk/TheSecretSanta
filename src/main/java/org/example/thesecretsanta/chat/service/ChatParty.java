package org.example.thesecretsanta.chat.service;

import org.example.thesecretsanta.chat.domain.ChatRole;
import org.example.thesecretsanta.room.domain.GiftAssignment;
import org.example.thesecretsanta.room.domain.RoomParticipant;
import org.example.thesecretsanta.user.domain.User;

/** A user standing on one side of a conversation (a gift assignment). */
public record ChatParty(GiftAssignment assignment, ChatRole role) {

    public static ChatRole roleOf(GiftAssignment assignment, User user) {
        if (assignment.getGiver().getUser().getId().equals(user.getId())) {
            return ChatRole.SANTA;
        }
        if (assignment.getReceiver().getUser().getId().equals(user.getId())) {
            return ChatRole.RECIPIENT;
        }
        return null;
    }

    public RoomParticipant participant(ChatRole side) {
        return side == ChatRole.SANTA ? assignment.getGiver() : assignment.getReceiver();
    }

    /** The person on the other end. */
    public User counterpart() {
        return participant(role.other()).getUser();
    }

    /**
     * How this party sees the conversation: a Santa sees the recipient's name,
     * a recipient only ever sees "Тайный Санта".
     */
    public String title() {
        return role == ChatRole.SANTA
                ? assignment.getReceiver().getUser().getDisplayName()
                : ChatTitles.SECRET_SANTA;
    }
}
