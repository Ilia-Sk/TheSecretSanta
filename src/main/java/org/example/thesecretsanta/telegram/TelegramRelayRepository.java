package org.example.thesecretsanta.telegram;

import org.example.thesecretsanta.room.domain.Room;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface TelegramRelayRepository extends JpaRepository<TelegramRelay, Long> {
    Optional<TelegramRelay> findFirstByChatIdAndMessageId(Long chatId, Long messageId);

    @Modifying
    @Query("delete from TelegramRelay r where r.assignmentId in (select a.id from GiftAssignment a where a.room = :room)")
    void deleteByRoom(@Param("room") Room room);
}
