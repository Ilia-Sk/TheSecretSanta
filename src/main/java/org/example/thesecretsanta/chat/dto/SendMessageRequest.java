package org.example.thesecretsanta.chat.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.example.thesecretsanta.chat.domain.ChatMessage;

public record SendMessageRequest(
        @NotBlank @Size(max = ChatMessage.MAX_LENGTH) String text
) {
}
