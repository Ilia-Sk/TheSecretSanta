package org.example.thesecretsanta.user.service;

import org.springframework.stereotype.Service;

@Service
public class UserNameService {
    public String normalize(String name) {
        String normalized = name.trim().toLowerCase().replaceAll("\\s+", " ");
        if (!normalized.matches("^[\\p{L}\\p{N} ._-]{3,60}$")) {
            throw new IllegalArgumentException("Name must be 3-60 characters and can contain letters, digits, spaces, dots, dashes and underscores");
        }
        return normalized;
    }
}
