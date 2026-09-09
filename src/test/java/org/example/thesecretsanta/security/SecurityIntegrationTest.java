package org.example.thesecretsanta.security;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class SecurityIntegrationTest {
    @Autowired
    private MockMvc mockMvc;

    @Test
    void protectedApiRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/rooms"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void invalidJwtDoesNotBreakRequestProcessing() throws Exception {
        mockMvc.perform(get("/api/rooms")
                        .header("Authorization", "Bearer invalid-token"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void authApiIsPublic() throws Exception {
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "email": "mock@example.com",
                                  "displayName": "Mock User",
                                  "password": "secret123"
                                }
                                """))
                .andExpect(status().isOk());
    }

    @Test
    void roomValidationRejectsNegativeGiftBudget() throws Exception {
        String token = registerAndReturnToken("budget@example.com", "Budget User");

        mockMvc.perform(post("/api/rooms")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name": "Budget Room",
                                  "giftBudget": -1
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("giftBudget: must be greater than or equal to 0"));
    }

    @Test
    void roomValidationRejectsPastCelebrationDate() throws Exception {
        String token = registerAndReturnToken("past-date@example.com", "Past Date User");

        mockMvc.perform(post("/api/rooms")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name": "Past Date Room",
                                  "celebrationDate": "2020-01-01"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("celebrationDate: must be a date in the present or in the future"));
    }

    @Test
    void profileValidationRejectsBlankDisplayName() throws Exception {
        String token = registerAndReturnToken("blank-profile@example.com", "Blank Profile");

        mockMvc.perform(put("/api/profile")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "displayName": "   "
                                }
                                """))
                .andExpect(status().isBadRequest());
    }

    private String registerAndReturnToken(String email, String displayName) throws Exception {
        String response = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "email": "%s",
                                  "displayName": "%s",
                                  "password": "secret123"
                                }
                                """.formatted(email, displayName)))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();

        return response.replaceFirst(".*\"token\":\"([^\"]+)\".*", "$1");
    }
}
