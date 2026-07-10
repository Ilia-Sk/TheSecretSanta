package org.example.thesecretsanta.user.service;

import org.example.thesecretsanta.user.dao.UserRepository;
import org.example.thesecretsanta.user.domain.User;
import org.example.thesecretsanta.user.dto.ProfileResponse;
import org.example.thesecretsanta.user.dto.UpdateProfileRequest;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserService implements UserDetailsService {
    private final UserRepository userRepository;

    public UserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Override
    public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new UsernameNotFoundException("User not found: " + email));
    }

    public User getCurrentUser(UserDetails userDetails) {
        return userRepository.findByEmail(userDetails.getUsername())
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

    private ProfileResponse mapProfile(User user) {
        return new ProfileResponse(user.getId(), user.getEmail(), user.getDisplayName(), user.getAvatarUrl());
    }

    private String trimToNull(String value) {
        if (value == null || value.trim().isBlank()) {
            return null;
        }
        return value.trim();
    }
}
