package org.example.thesecretsanta.config;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.Arrays;

@Component
public class ProductionSecurityValidator implements ApplicationRunner {
    private static final String DEV_JWT_SECRET = "change-this-secret-key-change-this-secret-key";
    /** The local-development database password, public in application.yml and docker-compose.yml. */
    private static final String DEV_DB_PASSWORD = "santa_password";

    private final Environment environment;
    private final SecurityProperties securityProperties;

    public ProductionSecurityValidator(Environment environment, SecurityProperties securityProperties) {
        this.environment = environment;
        this.securityProperties = securityProperties;
    }

    @Override
    public void run(ApplicationArguments args) {
        boolean productionProfile = Arrays.asList(environment.getActiveProfiles()).contains("prod");
        if (!productionProfile) {
            return;
        }
        if (DEV_JWT_SECRET.equals(securityProperties.jwtSecret())) {
            throw new IllegalStateException("JWT_SECRET must be changed when the prod profile is active");
        }
        if (securityProperties.jwtSecret() == null || securityProperties.jwtSecret().length() < 32) {
            throw new IllegalStateException("JWT_SECRET must be at least 32 characters in production");
        }
        String origins = environment.getProperty("app.cors.allowed-origins", "");
        if (origins.isBlank() || origins.contains("*")) {
            throw new IllegalStateException("CORS_ALLOWED_ORIGINS must list the site's address in production, not *");
        }
        if (DEV_DB_PASSWORD.equals(environment.getProperty("spring.datasource.password"))) {
            throw new IllegalStateException("The database password must not be the public development default in production");
        }
        if (environment.getProperty("app.security.password-auth-enabled", Boolean.class, false)) {
            throw new IllegalStateException("Password sign-in without e-mail verification must stay off in production");
        }
    }
}
