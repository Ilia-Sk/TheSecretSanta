package org.example.thesecretsanta.room.dao;

import org.example.thesecretsanta.room.domain.Room;
import org.example.thesecretsanta.user.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.time.LocalDate;

public interface RoomRepository extends JpaRepository<Room, Long> {
    Optional<Room> findByInviteCode(String inviteCode);

    List<Room> findDistinctByOwnerOrParticipants_User(User owner, User participant);

    List<Room> findByCelebrationDateBefore(LocalDate date);
}
