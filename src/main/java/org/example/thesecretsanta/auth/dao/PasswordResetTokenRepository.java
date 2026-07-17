package org.example.thesecretsanta.auth.dao;

import org.example.thesecretsanta.auth.domain.PasswordResetToken;
import org.example.thesecretsanta.user.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, Long> {
    Optional<PasswordResetToken> findByToken(String token);

    void deleteByUserAndUsedFalse(User user);
}
