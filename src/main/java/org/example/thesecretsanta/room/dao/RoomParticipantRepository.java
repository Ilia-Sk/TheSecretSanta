package org.example.thesecretsanta.room.dao;

import org.example.thesecretsanta.room.domain.Room;
import org.example.thesecretsanta.room.domain.RoomParticipant;
import org.example.thesecretsanta.user.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface RoomParticipantRepository extends JpaRepository<RoomParticipant, Long> {
    List<RoomParticipant> findByRoomId(Long roomId);

    Optional<RoomParticipant> findByRoomAndUser(Room room, User user);

    boolean existsByRoomAndUser(Room room, User user);
}
