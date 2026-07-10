package org.example.thesecretsanta.room.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(
        name = "draw_restrictions",
        uniqueConstraints = @UniqueConstraint(columnNames = {"room_id", "giver_id", "receiver_id"})
)
public class DrawRestriction {
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

    protected DrawRestriction() {
    }

    public DrawRestriction(Room room, RoomParticipant giver, RoomParticipant receiver) {
        this.room = room;
        this.giver = giver;
        this.receiver = receiver;
    }

    public Long getId() {
        return id;
    }

    public Room getRoom() {
        return room;
    }

    public RoomParticipant getGiver() {
        return giver;
    }

    public RoomParticipant getReceiver() {
        return receiver;
    }
}
