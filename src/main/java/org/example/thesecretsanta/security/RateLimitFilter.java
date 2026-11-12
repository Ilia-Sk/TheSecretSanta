package org.example.thesecretsanta.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Pattern;

/**
 * Per-IP request limits (fixed one-minute windows), checked before anything else.
 * Tight limits on what can be abused (sign-in, uploads, sending messages, creating
 * rooms), a generous one on the rest of the API (the chat polls every few seconds).
 * Over the limit → 429 with Retry-After.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class RateLimitFilter extends OncePerRequestFilter {
    private static final long WINDOW_MS = 60_000;

    record Rule(String name, String method, Pattern path, int perMinute) {
        boolean matches(HttpServletRequest request) {
            return (method == null || method.equals(request.getMethod())) && path.matcher(request.getRequestURI()).matches();
        }
    }

    /** First matching rule wins; every API request also counts towards "api". */
    static final List<Rule> RULES = List.of(
            new Rule("auth", "POST", Pattern.compile("/api/auth/.*"), 10),
            new Rule("upload", "POST", Pattern.compile("/api/profile/avatar"), 10),
            new Rule("telegram-link", "POST", Pattern.compile("/api/telegram/link"), 10),
            new Rule("chat-send", "POST", Pattern.compile("/api/chats/\\d+/messages"), 30),
            new Rule("rooms-write", "POST", Pattern.compile("/api/rooms(/.*)?"), 30)
    );
    static final Rule API = new Rule("api", null, Pattern.compile("/api/.*"), 300);

    private record Window(long start, AtomicInteger count) {
    }

    private final Map<String, Window> windows = new ConcurrentHashMap<>();
    private final boolean enabled;
    private volatile long lastCleanup = System.currentTimeMillis();

    public RateLimitFilter(@Value("${app.rate-limit.enabled:true}") boolean enabled) {
        this.enabled = enabled;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !enabled || !request.getRequestURI().startsWith("/api/") || "OPTIONS".equals(request.getMethod());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String ip = clientIp(request);
        long now = System.currentTimeMillis();
        cleanup(now);

        for (Rule rule : RULES) {
            if (rule.matches(request)) {
                if (!allow(rule, ip, now)) {
                    reject(response, now);
                    return;
                }
                break;
            }
        }
        if (!allow(API, ip, now)) {
            reject(response, now);
            return;
        }
        chain.doFilter(request, response);
    }

    private boolean allow(Rule rule, String ip, long now) {
        Window window = windows.compute(rule.name() + "|" + ip, (key, current) ->
                current == null || now - current.start() >= WINDOW_MS ? new Window(now, new AtomicInteger()) : current);
        return window.count().incrementAndGet() <= rule.perMinute();
    }

    private void reject(HttpServletResponse response, long now) throws IOException {
        response.setStatus(429);
        response.setHeader("Retry-After", "60");
        response.setContentType("application/json");
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write("{\"status\":429,\"error\":\"Too Many Requests\","
                + "\"message\":\"Слишком много запросов. Подождите минуту и попробуйте снова\"}");
    }

    private void cleanup(long now) {
        if (now - lastCleanup < WINDOW_MS) {
            return;
        }
        lastCleanup = now;
        windows.entrySet().removeIf(entry -> now - entry.getValue().start() >= WINDOW_MS);
    }

    /**
     * Real client address. Behind our proxies (Caddy → nginx → backend) the TCP peer
     * is a private Docker address and Caddy has put the client first in
     * X-Forwarded-For (Caddy ignores a client-supplied header by default). A request
     * coming straight from the internet can't spoof it: then the peer is public and used as is.
     */
    static String clientIp(HttpServletRequest request) {
        String peer = request.getRemoteAddr();
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank() && isPrivate(peer)) {
            String first = forwarded.split(",")[0].strip();
            if (!first.isEmpty()) {
                return first;
            }
        }
        return peer;
    }

    private static boolean isPrivate(String address) {
        if (address == null) {
            return false;
        }
        return address.startsWith("10.") || address.startsWith("192.168.") || address.startsWith("127.")
                || address.equals("::1") || address.equals("0:0:0:0:0:0:0:1")
                || address.matches("172\\.(1[6-9]|2\\d|3[01])\\..*");
    }
}
