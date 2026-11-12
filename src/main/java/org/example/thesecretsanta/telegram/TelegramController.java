package org.example.thesecretsanta.telegram;

import org.example.thesecretsanta.user.service.UserService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/telegram")
public class TelegramController {
    public record LinkResponse(String url) {
    }

    private final TelegramLinkService linkService;
    private final UserService userService;

    public TelegramController(TelegramLinkService linkService, UserService userService) {
        this.linkService = linkService;
        this.userService = userService;
    }

    @GetMapping
    public TelegramLinkService.Status status(@AuthenticationPrincipal UserDetails userDetails) {
        return linkService.status(userService.getCurrentUser(userDetails));
    }

    @PostMapping("/link")
    public LinkResponse link(@AuthenticationPrincipal UserDetails userDetails) {
        return new LinkResponse(linkService.createLink(userService.getCurrentUser(userDetails)));
    }

    @DeleteMapping
    public TelegramLinkService.Status unlink(@AuthenticationPrincipal UserDetails userDetails) {
        var user = userService.getCurrentUser(userDetails);
        linkService.unlink(user);
        return linkService.status(user);
    }
}
