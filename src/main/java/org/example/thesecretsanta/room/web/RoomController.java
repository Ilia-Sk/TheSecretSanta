package org.example.thesecretsanta.room.web;

import jakarta.validation.Valid;
import org.example.thesecretsanta.room.dto.AddRestrictionRequest;
import org.example.thesecretsanta.room.dto.CreateRoomRequest;
import org.example.thesecretsanta.room.dto.JoinRoomRequest;
import org.example.thesecretsanta.room.dto.InvitePreviewResponse;
import org.example.thesecretsanta.room.dto.MyAssignmentResponse;
import org.example.thesecretsanta.room.dto.RoomResponse;
import org.example.thesecretsanta.room.dto.UpdateRoomRequest;
import org.example.thesecretsanta.room.service.RoomService;
import org.example.thesecretsanta.user.domain.User;
import org.example.thesecretsanta.user.service.UserService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/rooms")
public class RoomController {
    private final RoomService roomService;
    private final UserService userService;

    public RoomController(RoomService roomService, UserService userService) {
        this.roomService = roomService;
        this.userService = userService;
    }

    @GetMapping
    public List<RoomResponse> getMyRooms(@AuthenticationPrincipal UserDetails userDetails) {
        return roomService.getMyRooms(currentUser(userDetails));
    }

    @PostMapping
    public RoomResponse createRoom(@Valid @RequestBody CreateRoomRequest request, @AuthenticationPrincipal UserDetails userDetails) {
        return roomService.createRoom(request, currentUser(userDetails));
    }

    @GetMapping("/{roomId}")
    public RoomResponse getRoom(@PathVariable Long roomId, @AuthenticationPrincipal UserDetails userDetails) {
        return roomService.getRoom(roomId, currentUser(userDetails));
    }

    @GetMapping("/invite/{inviteCode}")
    public InvitePreviewResponse previewInvite(@PathVariable String inviteCode) {
        return roomService.previewInvite(inviteCode);
    }

    @PutMapping("/{roomId}")
    public RoomResponse updateRoom(
            @PathVariable Long roomId,
            @Valid @RequestBody UpdateRoomRequest request,
            @AuthenticationPrincipal UserDetails userDetails
    ) {
        return roomService.updateRoom(roomId, request, currentUser(userDetails));
    }

    @PostMapping("/join/{inviteCode}")
    public RoomResponse joinRoom(
            @PathVariable String inviteCode,
            @Valid @RequestBody JoinRoomRequest request,
            @AuthenticationPrincipal UserDetails userDetails
    ) {
        return roomService.joinRoom(inviteCode, request, currentUser(userDetails));
    }

    @PostMapping("/{roomId}/restrictions")
    public RoomResponse addRestriction(
            @PathVariable Long roomId,
            @Valid @RequestBody AddRestrictionRequest request,
            @AuthenticationPrincipal UserDetails userDetails
    ) {
        return roomService.addRestriction(roomId, request, currentUser(userDetails));
    }

    @DeleteMapping("/{roomId}/restrictions/{restrictionId}")
    public RoomResponse deleteRestriction(
            @PathVariable Long roomId,
            @PathVariable Long restrictionId,
            @AuthenticationPrincipal UserDetails userDetails
    ) {
        return roomService.deleteRestriction(roomId, restrictionId, currentUser(userDetails));
    }

    @PostMapping("/{roomId}/draw")
    public RoomResponse draw(@PathVariable Long roomId, @AuthenticationPrincipal UserDetails userDetails) {
        return roomService.draw(roomId, currentUser(userDetails));
    }

    @GetMapping("/{roomId}/my-assignment")
    public MyAssignmentResponse getMyAssignment(@PathVariable Long roomId, @AuthenticationPrincipal UserDetails userDetails) {
        return roomService.getMyAssignment(roomId, currentUser(userDetails));
    }

    private User currentUser(UserDetails userDetails) {
        return userService.getCurrentUser(userDetails);
    }
}
