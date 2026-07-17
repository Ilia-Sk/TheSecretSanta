package org.example.thesecretsanta.auth.service;

import org.example.thesecretsanta.auth.dao.PasswordResetTokenRepository;
import org.example.thesecretsanta.auth.domain.PasswordResetToken;
import org.example.thesecretsanta.auth.dto.AuthResponse;
import org.example.thesecretsanta.auth.dto.ForgotPasswordRequest;
import org.example.thesecretsanta.auth.dto.LoginRequest;
import org.example.thesecretsanta.auth.dto.RegisterRequest;
import org.example.thesecretsanta.auth.dto.ResetPasswordRequest;
import org.example.thesecretsanta.common.dto.MessageResponse;
import org.example.thesecretsanta.config.AppProperties;
import org.example.thesecretsanta.mail.MailService;
import org.example.thesecretsanta.security.JwtService;
import org.example.thesecretsanta.user.dao.UserRepository;
import org.example.thesecretsanta.user.domain.User;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;

@Service
public class AuthService {
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final UserRepository userRepository;
    private final PasswordResetTokenRepository resetTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;
    private final JwtService jwtService;
    private final MailService mailService;
    private final AppProperties appProperties;

    public AuthService(
            UserRepository userRepository,
            PasswordResetTokenRepository resetTokenRepository,
            PasswordEncoder passwordEncoder,
            AuthenticationManager authenticationManager,
            JwtService jwtService,
            MailService mailService,
            AppProperties appProperties
    ) {
        this.userRepository = userRepository;
        this.resetTokenRepository = resetTokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.authenticationManager = authenticationManager;
        this.jwtService = jwtService;
        this.mailService = mailService;
        this.appProperties = appProperties;
    }

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        String email = request.email().trim().toLowerCase();
        String login = normalizeLogin(request.login());
        if (userRepository.existsByEmail(email)) {
            throw new IllegalArgumentException("Email is already registered");
        }
        if (userRepository.existsByUsername(login)) {
            throw new IllegalArgumentException("Login is already taken");
        }

        User user = new User(email, login, passwordEncoder.encode(request.password()), request.displayName().trim());
        User savedUser = userRepository.save(user);
        String token = jwtService.generateToken(savedUser, savedUser.getId(), savedUser.getDisplayName());
        return new AuthResponse(token, savedUser.getId(), savedUser.getEmail(), savedUser.getLogin(), savedUser.getDisplayName(), savedUser.getAvatarUrl());
    }

    public AuthResponse login(LoginRequest request) {
        String login = normalizeLogin(request.login());
        authenticationManager.authenticate(new UsernamePasswordAuthenticationToken(login, request.password()));
        User user = userRepository.findByUsername(login)
                .orElseThrow(() -> new IllegalArgumentException("Invalid login or password"));
        String token = jwtService.generateToken(user, user.getId(), user.getDisplayName());
        return new AuthResponse(token, user.getId(), user.getEmail(), user.getLogin(), user.getDisplayName(), user.getAvatarUrl());
    }

    @Transactional
    public MessageResponse forgotPassword(ForgotPasswordRequest request) {
        String email = request.email().trim().toLowerCase();
        userRepository.findByEmail(email).ifPresent(user -> {
            resetTokenRepository.deleteByUserAndUsedFalse(user);
            String token = randomToken();
            resetTokenRepository.save(new PasswordResetToken(user, token, Instant.now().plus(30, ChronoUnit.MINUTES)));
            String resetLink = appProperties.publicUrl() + "/reset-password?token=" + token;
            mailService.send(
                    user.getEmail(),
                    "The Secret Santa: восстановление пароля",
                    "Для смены пароля откройте ссылку:\n\n" + resetLink + "\n\nСсылка действует 30 минут."
            );
        });
        return new MessageResponse("If this email exists, password reset instructions were sent");
    }

    @Transactional
    public MessageResponse resetPassword(ResetPasswordRequest request) {
        PasswordResetToken token = resetTokenRepository.findByToken(request.token().trim())
                .orElseThrow(() -> new IllegalArgumentException("Password reset link is invalid or expired"));
        if (!token.isUsable()) {
            throw new IllegalArgumentException("Password reset link is invalid or expired");
        }
        token.getUser().updatePassword(passwordEncoder.encode(request.password()));
        token.markUsed();
        return new MessageResponse("Password has been changed");
    }

    private String normalizeLogin(String login) {
        String normalized = login.trim().toLowerCase();
        if (!normalized.matches("^[a-z0-9._-]{3,60}$")) {
            throw new IllegalArgumentException("Login can contain latin letters, digits, dots, dashes and underscores");
        }
        return normalized;
    }

    private String randomToken() {
        byte[] bytes = new byte[32];
        SECURE_RANDOM.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }
}
