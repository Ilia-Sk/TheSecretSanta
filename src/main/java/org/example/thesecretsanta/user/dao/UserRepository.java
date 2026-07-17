package org.example.thesecretsanta.user.dao;

import org.example.thesecretsanta.user.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByEmail(String email);

    Optional<User> findByUsername(String username);

    Optional<User> findFirstByDisplayNameIgnoreCase(String displayName);

    boolean existsByEmail(String email);

    boolean existsByUsername(String username);

    boolean existsByDisplayNameIgnoreCase(String displayName);
}
