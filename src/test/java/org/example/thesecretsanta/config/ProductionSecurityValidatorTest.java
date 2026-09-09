package org.example.thesecretsanta.config;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ProductionSecurityValidatorTest {

    @Test
    void rejectsDefaultJwtSecretWhenProductionProfileIsActive() {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("prod");
        ProductionSecurityValidator validator = new ProductionSecurityValidator(
                environment,
                new SecurityProperties("change-this-secret-key-change-this-secret-key", 86400000)
        );

        assertThatThrownBy(() -> validator.run(null))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("JWT_SECRET must be changed when the prod profile is active");
    }

    @Test
    void allowsDefaultJwtSecretOutsideProductionProfile() {
        MockEnvironment environment = new MockEnvironment();
        ProductionSecurityValidator validator = new ProductionSecurityValidator(
                environment,
                new SecurityProperties("change-this-secret-key-change-this-secret-key", 86400000)
        );

        assertThatCode(() -> validator.run(null)).doesNotThrowAnyException();
    }
}
