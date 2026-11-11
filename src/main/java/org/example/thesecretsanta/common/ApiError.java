package org.example.thesecretsanta.common;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;

/**
 * Error body of every API response.
 *
 * @param code machine-readable reason for errors the frontend reacts to (e.g. LOGIN_REQUIRED); omitted otherwise
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ApiError(
        Instant timestamp,
        int status,
        String error,
        String message,
        String code
) {
    public static ApiError of(int status, String error, String message) {
        return new ApiError(Instant.now(), status, error, message, null);
    }

    public static ApiError of(int status, String error, String message, String code) {
        return new ApiError(Instant.now(), status, error, message, code);
    }
}
