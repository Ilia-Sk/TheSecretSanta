package org.example.thesecretsanta.user.service;

import org.example.thesecretsanta.config.AppProperties;
import org.example.thesecretsanta.security.JwtService;
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
    private final UserNameService userNameService;
    private final JwtService jwtService;

    public UserService(UserRepository userRepository, AppProperties appProperties, UserNameService userNameService, JwtService jwtService) {
        this.userRepository = userRepository;
        this.appProperties = appProperties;
        this.userNameService = userNameService;
        this.jwtService = jwtService;
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
        String displayName = request.displayName().trim();
        String username = userNameService.normalize(displayName);
        if (userRepository.existsByUsernameAndIdNot(username, user.getId())
                || userRepository.existsByDisplayNameIgnoreCaseAndIdNot(displayName, user.getId())) {
            throw new IllegalArgumentException("Name is already taken");
        }
        user.updateProfile(username, displayName, safeAvatarUrl(trimToNull(request.avatarUrl())));
        return mapProfile(user, jwtService.generateToken(user, user.getId(), user.getDisplayName()));
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

        // The Content-Type header comes from the client; trust the file's own signature instead.
        String detectedType = detectImageType(file);
        if (detectedType == null || !detectedType.equals(file.getContentType())) {
            throw new IllegalArgumentException("Avatar must be JPG, PNG or WEBP");
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
        return mapProfile(user, null);
    }

    private ProfileResponse mapProfile(User user, String token) {
        return new ProfileResponse(user.getId(), user.getEmail(), user.getLogin(), user.getDisplayName(), user.getAvatarUrl(), token);
    }

    /** Avatar may be our own upload or an https image (e.g. from Google via Clerk) — nothing else. */
    static String safeAvatarUrl(String value) {
        if (value == null) {
            return null;
        }
        if (value.matches("/uploads/avatars/[A-Za-z0-9._-]+")) {
            return value;
        }
        try {
            java.net.URI uri = java.net.URI.create(value);
            if ("https".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null) {
                return value;
            }
        } catch (IllegalArgumentException ignored) {
            // falls through
        }
        throw new IllegalArgumentException("Avatar URL must be an https link");
    }

    /** JPEG / PNG / WEBP by magic bytes; null for anything else. */
    static String detectImageType(MultipartFile file) {
        byte[] head = new byte[12];
        int read;
        try (java.io.InputStream in = file.getInputStream()) {
            read = in.readNBytes(head, 0, head.length);
        } catch (IOException ex) {
            return null;
        }
        if (read >= 3 && (head[0] & 0xFF) == 0xFF && (head[1] & 0xFF) == 0xD8 && (head[2] & 0xFF) == 0xFF) {
            return "image/jpeg";
        }
        if (read >= 8 && (head[0] & 0xFF) == 0x89 && head[1] == 'P' && head[2] == 'N' && head[3] == 'G'
                && head[4] == 0x0D && head[5] == 0x0A && head[6] == 0x1A && head[7] == 0x0A) {
            return "image/png";
        }
        if (read >= 12 && head[0] == 'R' && head[1] == 'I' && head[2] == 'F' && head[3] == 'F'
                && head[8] == 'W' && head[9] == 'E' && head[10] == 'B' && head[11] == 'P') {
            return "image/webp";
        }
        return null;
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
