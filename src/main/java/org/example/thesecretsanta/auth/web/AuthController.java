package org.example.thesecretsanta.auth.web;

import jakarta.validation.Valid;
import org.example.thesecretsanta.auth.dto.AuthResponse;
import org.example.thesecretsanta.auth.dto.LoginRequest;
import org.example.thesecretsanta.auth.dto.RegisterRequest;
import org.example.thesecretsanta.auth.service.AuthService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register")
    public AuthResponse register(@Valid @RequestBody RegisterRequest request) {
        return authService.register(request);
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request);
    }
}
