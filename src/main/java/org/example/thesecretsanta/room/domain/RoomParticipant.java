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
import org.example.thesecretsanta.user.domain.User;

import java.time.Instant;

@Entity
@Table(
        name = "room_participants",
        uniqueConstraints = @UniqueConstraint(columnNames = {"room_id", "user_id"})
)
public class RoomParticipant {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "room_id")
    private Room room;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(length = 1000)
    private String wishlist;

    @Column(length = 1500)
    private String wishlistLinks;

    @Column(nullable = false)
    private Instant joinedAt = Instant.now();

    protected RoomParticipant() {
    }

    public RoomParticipant(Room room, User user, String wishlist) {
        this(room, user, wishlist, null);
    }

    public RoomParticipant(Room room, User user, String wishlist, String wishlistLinks) {
        this.room = room;
        this.user = user;
        this.wishlist = wishlist;
        this.wishlistLinks = wishlistLinks;
    }

    public Long getId() {
        return id;
    }

    public Room getRoom() {
        return room;
    }

    public User getUser() {
        return user;
    }

    public String getWishlist() {
        return wishlist;
    }

    public String getWishlistLinks() {
        return wishlistLinks;
    }

    public void updateWishlist(String wishlist) {
        this.wishlist = wishlist;
    }
}
