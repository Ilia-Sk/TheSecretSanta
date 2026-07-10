package org.example.thesecretsanta.auth.service;

import org.example.thesecretsanta.auth.dto.AuthResponse;
import org.example.thesecretsanta.auth.dto.LoginRequest;
import org.example.thesecretsanta.auth.dto.RegisterRequest;
import org.example.thesecretsanta.security.JwtService;
import org.example.thesecretsanta.user.dao.UserRepository;
import org.example.thesecretsanta.user.domain.User;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;
    private final JwtService jwtService;

    public AuthService(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            AuthenticationManager authenticationManager,
            JwtService jwtService
    ) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.authenticationManager = authenticationManager;
        this.jwtService = jwtService;
    }

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        String email = request.email().trim().toLowerCase();
        if (userRepository.existsByEmail(email)) {
            throw new IllegalArgumentException("Email is already registered");
        }

        User user = new User(email, passwordEncoder.encode(request.password()), request.displayName().trim());
        User savedUser = userRepository.save(user);
        String token = jwtService.generateToken(savedUser, savedUser.getId(), savedUser.getDisplayName());
        return new AuthResponse(token, savedUser.getId(), savedUser.getEmail(), savedUser.getDisplayName(), savedUser.getAvatarUrl());
    }

    public AuthResponse login(LoginRequest request) {
        String email = request.email().trim().toLowerCase();
        authenticationManager.authenticate(new UsernamePasswordAuthenticationToken(email, request.password()));
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new IllegalArgumentException("Invalid email or password"));
        String token = jwtService.generateToken(user, user.getId(), user.getDisplayName());
        return new AuthResponse(token, user.getId(), user.getEmail(), user.getDisplayName(), user.getAvatarUrl());
    }
}
