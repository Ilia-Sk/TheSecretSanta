package org.example.thesecretsanta.user.service;

import org.example.thesecretsanta.config.AppProperties;
import org.example.thesecretsanta.user.dao.UserRepository;
import org.example.thesecretsanta.user.domain.User;
import org.example.thesecretsanta.user.dto.ProfileResponse;
import org.example.thesecretsanta.user.dto.UpdateProfileRequest;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import java.util.UUID;

@Service
public class UserService implements UserDetailsService {
    private static final Set<String> ALLOWED_AVATAR_TYPES = Set.of("image/jpeg", "image/png", "image/webp");

    private final UserRepository userRepository;
    private final AppProperties appProperties;

    public UserService(UserRepository userRepository, AppProperties appProperties) {
        this.userRepository = userRepository;
        this.appProperties = appProperties;
    }

    @Override
    public UserDetails loadUserByUsername(String login) throws UsernameNotFoundException {
        return userRepository.findByUsername(login)
                .or(() -> userRepository.findFirstByDisplayNameIgnoreCase(login))
                .or(() -> userRepository.findByEmail(login))
                .orElseThrow(() -> new UsernameNotFoundException("User not found: " + login));
    }

    public User getCurrentUser(UserDetails userDetails) {
        return userRepository.findByUsername(userDetails.getUsername())
                .or(() -> userRepository.findByEmail(userDetails.getUsername()))
                .orElseThrow(() -> new UsernameNotFoundException("User not found: " + userDetails.getUsername()));
    }

    @Transactional(readOnly = true)
    public ProfileResponse getProfile(UserDetails userDetails) {
        return mapProfile(getCurrentUser(userDetails));
    }

    @Transactional
    public ProfileResponse updateProfile(UpdateProfileRequest request, UserDetails userDetails) {
        User user = getCurrentUser(userDetails);
        user.updateProfile(request.displayName().trim(), trimToNull(request.avatarUrl()));
        return mapProfile(user);
    }

    @Transactional
    public ProfileResponse uploadAvatar(MultipartFile file, UserDetails userDetails) {
        if (file.isEmpty()) {
            throw new IllegalArgumentException("Avatar file is empty");
        }
        if (!ALLOWED_AVATAR_TYPES.contains(file.getContentType())) {
            throw new IllegalArgumentException("Avatar must be JPG, PNG or WEBP");
        }
        if (file.getSize() > 3 * 1024 * 1024) {
            throw new IllegalArgumentException("Avatar file is too large");
        }

        User user = getCurrentUser(userDetails);
        String extension = extensionFor(file.getContentType());
        String filename = user.getId() + "-" + UUID.randomUUID() + extension;
        Path avatarDir = Path.of(appProperties.uploadDir(), "avatars");
        try {
            Files.createDirectories(avatarDir);
            file.transferTo(avatarDir.resolve(filename));
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to save avatar", ex);
        }
        user.updateAvatar("/uploads/avatars/" + filename);
        return mapProfile(user);
    }

    private ProfileResponse mapProfile(User user) {
        return new ProfileResponse(user.getId(), user.getEmail(), user.getLogin(), user.getDisplayName(), user.getAvatarUrl());
    }

    private String extensionFor(String contentType) {
        return switch (contentType) {
            case "image/png" -> ".png";
            case "image/webp" -> ".webp";
            default -> ".jpg";
        };
    }

    private String trimToNull(String value) {
        if (value == null || value.trim().isBlank()) {
            return null;
        }
        return value.trim();
    }
}
