package org.example.thesecretsanta.clerk;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ClerkClientTest {
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void parsesPrimaryVerifiedEmailAndLoginFromMetadata() throws Exception {
        ClerkUser user = ClerkClient.parseUser(mapper.readTree("""
                {
                  "id": "user_1",
                  "username": null,
                  "first_name": "Anna",
                  "image_url": "https://img.clerk.com/a",
                  "has_image": true,
                  "primary_email_address_id": "idn_2",
                  "email_addresses": [
                    {"id": "idn_1", "email_address": "other@example.com", "verification": {"status": "verified"}},
                    {"id": "idn_2", "email_address": "Anna@Example.com", "verification": {"status": "verified"}}
                  ],
                  "unsafe_metadata": {"login": "Анна"}
                }
                """));

        assertThat(user.id()).isEqualTo("user_1");
        assertThat(user.email()).isEqualTo("anna@example.com");
        assertThat(user.emailVerified()).isTrue();
        assertThat(user.metadataLogin()).isEqualTo("Анна");
        assertThat(user.username()).isNull();
        assertThat(user.imageUrl()).isEqualTo("https://img.clerk.com/a");
    }

    @Test
    void unverifiedEmailAndDefaultAvatarAreReported() throws Exception {
        ClerkUser user = ClerkClient.parseUser(mapper.readTree("""
                {
                  "id": "user_2",
                  "username": "santa",
                  "image_url": "https://img.clerk.com/default",
                  "has_image": false,
                  "primary_email_address_id": "idn_1",
                  "email_addresses": [
                    {"id": "idn_1", "email_address": "new@example.com", "verification": {"status": "unverified"}}
                  ],
                  "unsafe_metadata": {}
                }
                """));

        assertThat(user.emailVerified()).isFalse();
        assertThat(user.username()).isEqualTo("santa");
        assertThat(user.metadataLogin()).isNull();
        assertThat(user.imageUrl()).isNull();
    }
}
