package org.example.thesecretsanta.chat.web;

import jakarta.validation.Valid;
import org.example.thesecretsanta.chat.domain.MessageSource;
import org.example.thesecretsanta.chat.dto.ChatMessageResponse;
import org.example.thesecretsanta.chat.dto.DialogResponse;
import org.example.thesecretsanta.chat.dto.SendMessageRequest;
import org.example.thesecretsanta.chat.service.ChatService;
import org.example.thesecretsanta.user.service.UserService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api")
public class ChatController {
    private final ChatService chatService;
    private final UserService userService;

    public ChatController(ChatService chatService, UserService userService) {
        this.chatService = chatService;
        this.userService = userService;
    }

    @GetMapping("/rooms/{roomId}/chats")
    public List<DialogResponse> roomDialogs(@PathVariable Long roomId, @AuthenticationPrincipal UserDetails userDetails) {
        return chatService.roomDialogs(roomId, userService.getCurrentUser(userDetails));
    }

    @GetMapping("/chats/{chatId}/messages")
    public List<ChatMessageResponse> messages(
            @PathVariable Long chatId,
            @RequestParam(required = false) Long after,
            @AuthenticationPrincipal UserDetails userDetails
    ) {
        return chatService.messages(chatId, userService.getCurrentUser(userDetails), after);
    }

    @PostMapping("/chats/{chatId}/messages")
    public ChatMessageResponse send(
            @PathVariable Long chatId,
            @Valid @RequestBody SendMessageRequest request,
            @AuthenticationPrincipal UserDetails userDetails
    ) {
        return chatService.send(chatId, userService.getCurrentUser(userDetails), request.text(), MessageSource.WEB);
    }
}
