package org.example.thesecretsanta.room.dao;

import org.example.thesecretsanta.room.domain.GiftAssignment;
import org.example.thesecretsanta.room.domain.Room;
import org.example.thesecretsanta.room.domain.RoomParticipant;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface GiftAssignmentRepository extends JpaRepository<GiftAssignment, Long> {
    Optional<GiftAssignment> findByRoomAndGiver(Room room, RoomParticipant giver);

    void deleteByRoom(Room room);
}
