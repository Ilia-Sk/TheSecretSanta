package org.example.thesecretsanta.room.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.Instant;

@Entity
@Table(
        name = "gift_assignments",
        uniqueConstraints = {
                @UniqueConstraint(columnNames = {"room_id", "giver_id"}),
                @UniqueConstraint(columnNames = {"room_id", "receiver_id"})
        }
)
public class GiftAssignment {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "room_id")
    private Room room;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "giver_id")
    private RoomParticipant giver;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "receiver_id")
    private RoomParticipant receiver;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    protected GiftAssignment() {
    }

    public GiftAssignment(Room room, RoomParticipant giver, RoomParticipant receiver) {
        this.room = room;
        this.giver = giver;
        this.receiver = receiver;
    }

    public RoomParticipant getReceiver() {
        return receiver;
    }
}
