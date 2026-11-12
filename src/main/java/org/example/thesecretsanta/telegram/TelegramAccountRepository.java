package org.example.thesecretsanta.telegram;

import org.example.thesecretsanta.room.domain.Room;
import org.example.thesecretsanta.user.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface TelegramAccountRepository extends JpaRepository<TelegramAccount, Long> {
    Optional<TelegramAccount> findByUser(User user);

    Optional<TelegramAccount> findByUserId(Long userId);

    Optional<TelegramAccount> findByChatId(Long chatId);

    Optional<TelegramAccount> findByLinkToken(String linkToken);

    @Modifying
    @Query("update TelegramAccount t set t.activeAssignmentId = null, t.activeRole = null "
            + "where t.activeAssignmentId in (select a.id from GiftAssignment a where a.room = :room)")
    void clearActiveInRoom(@Param("room") Room room);
}
