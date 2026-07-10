package org.example.thesecretsanta.room.domain;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import org.example.thesecretsanta.user.domain.User;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "rooms")
public class Room {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 140)
    private String name;

    @Column(length = 800)
    private String description;

    private LocalDate celebrationDate;

    private BigDecimal giftBudget;

    @Column(nullable = false, unique = true, length = 64)
    private String inviteCode = UUID.randomUUID().toString();

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private RoomStatus status = RoomStatus.OPEN;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_id")
    private User owner;

    @OneToMany(mappedBy = "room", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<RoomParticipant> participants = new HashSet<>();

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    protected Room() {
    }

    public Room(String name, String description, LocalDate celebrationDate, BigDecimal giftBudget, User owner) {
        this.name = name;
        this.description = description;
        this.celebrationDate = celebrationDate;
        this.giftBudget = giftBudget;
        this.owner = owner;
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    public LocalDate getCelebrationDate() {
        return celebrationDate;
    }

    public BigDecimal getGiftBudget() {
        return giftBudget;
    }

    public String getInviteCode() {
        return inviteCode;
    }

    public RoomStatus getStatus() {
        return status;
    }

    public User getOwner() {
        return owner;
    }

    public Set<RoomParticipant> getParticipants() {
        return participants;
    }

    public void markDrawn() {
        this.status = RoomStatus.DRAWN;
    }

    public void updateDetails(String name, String description, LocalDate celebrationDate, BigDecimal giftBudget) {
        this.name = name;
        this.description = description;
        this.celebrationDate = celebrationDate;
        this.giftBudget = giftBudget;
    }

    public boolean isOwner(User user) {
        return owner.getId().equals(user.getId());
    }
}
