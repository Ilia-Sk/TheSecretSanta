package org.example.thesecretsanta.config;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.Arrays;

@Component
public class ProductionSecurityValidator implements ApplicationRunner {
    private static final String DEV_JWT_SECRET = "change-this-secret-key-change-this-secret-key";

    private final Environment environment;
    private final SecurityProperties securityProperties;

    public ProductionSecurityValidator(Environment environment, SecurityProperties securityProperties) {
        this.environment = environment;
        this.securityProperties = securityProperties;
    }

    @Override
    public void run(ApplicationArguments args) {
        boolean productionProfile = Arrays.asList(environment.getActiveProfiles()).contains("prod");
        if (productionProfile && DEV_JWT_SECRET.equals(securityProperties.jwtSecret())) {
            throw new IllegalStateException("JWT_SECRET must be changed when the prod profile is active");
        }
    }
}
