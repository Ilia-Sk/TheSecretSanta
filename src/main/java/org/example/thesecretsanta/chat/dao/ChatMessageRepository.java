package org.example.thesecretsanta.chat.dao;

import org.example.thesecretsanta.chat.domain.ChatMessage;
import org.example.thesecretsanta.chat.domain.ChatRole;
import org.example.thesecretsanta.room.domain.Room;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {
    List<ChatMessage> findByAssignmentIdOrderByIdAsc(Long assignmentId);

    List<ChatMessage> findByAssignmentIdAndIdGreaterThanOrderByIdAsc(Long assignmentId, Long afterId);

    Optional<ChatMessage> findFirstByAssignmentIdOrderByIdDesc(Long assignmentId);

    long countByAssignmentIdAndAuthorRoleAndReadAtIsNull(Long assignmentId, ChatRole authorRole);

    @Modifying
    @Query("update ChatMessage m set m.readAt = :now where m.assignment.id = :assignmentId and m.authorRole = :authorRole and m.readAt is null")
    int markRead(@Param("assignmentId") Long assignmentId, @Param("authorRole") ChatRole authorRole, @Param("now") Instant now);

    @Modifying
    @Query("delete from ChatMessage m where m.assignment.id in (select a.id from GiftAssignment a where a.room = :room)")
    void deleteByRoom(@Param("room") Room room);
}
