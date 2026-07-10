package org.example.thesecretsanta.room.dao;

import org.example.thesecretsanta.room.domain.DrawRestriction;
import org.example.thesecretsanta.room.domain.Room;
import org.example.thesecretsanta.room.domain.RoomParticipant;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DrawRestrictionRepository extends JpaRepository<DrawRestriction, Long> {
    List<DrawRestriction> findByRoomId(Long roomId);

    boolean existsByRoomAndGiverAndReceiver(Room room, RoomParticipant giver, RoomParticipant receiver);
}
