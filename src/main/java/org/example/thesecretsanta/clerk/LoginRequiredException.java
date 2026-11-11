package org.example.thesecretsanta.clerk;

/**
 * A new Clerk user (for example, signed up with Google) has no login in our app yet.
 * The frontend answers with a login and repeats the request.
 */
public class LoginRequiredException extends RuntimeException {
    public static final String CODE = "LOGIN_REQUIRED";

    public LoginRequiredException(String message) {
        super(message);
    }
}
