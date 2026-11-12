package org.example.thesecretsanta.room.dao;

import org.example.thesecretsanta.room.domain.GiftAssignment;
import org.example.thesecretsanta.room.domain.Room;
import org.example.thesecretsanta.room.domain.RoomParticipant;
import org.example.thesecretsanta.user.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface GiftAssignmentRepository extends JpaRepository<GiftAssignment, Long> {
    Optional<GiftAssignment> findByRoomAndGiver(Room room, RoomParticipant giver);

    Optional<GiftAssignment> findByRoomAndReceiver(Room room, RoomParticipant receiver);

    /** Every pair the user is part of, as Santa or as recipient (for the Telegram chat list). */
    @Query("select a from GiftAssignment a where a.giver.user = :user or a.receiver.user = :user order by a.id")
    List<GiftAssignment> findAllInvolving(@Param("user") User user);

    void deleteByRoom(Room room);
}
