package org.example.thesecretsanta.mail;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.mail.MailProperties;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

import jakarta.annotation.PreDestroy;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Service
public class MailService implements MailClient {
    private static final Logger log = LoggerFactory.getLogger(MailService.class);

    private final JavaMailSender mailSender;
    private final MailProperties mailProperties;
    /**
     * Emails go out in the background: a slow or blocked SMTP server must never
     * hold up (or fail) the request that triggered the email, e.g. the draw.
     */
    private final ExecutorService executor = Executors.newSingleThreadExecutor(runnable -> {
        Thread thread = new Thread(runnable, "mail-sender");
        thread.setDaemon(true);
        return thread;
    });

    /** "From" address; empty = the SMTP login (fine for Gmail, not for relays like Brevo). */
    private final String from;

    public MailService(
            ObjectProvider<JavaMailSender> mailSender,
            MailProperties mailProperties,
            @Value("${app.mail.from:}") String from
    ) {
        this.mailSender = mailSender.getIfAvailable();
        this.mailProperties = mailProperties;
        this.from = from == null || from.isBlank() ? mailProperties.getUsername() : from.strip();
    }

    @Override
    public void send(String to, String subject, String text) {
        if (mailSender == null || mailProperties.getHost() == null || mailProperties.getHost().isBlank()) {
            log.info("Email sending is disabled. Skipped email to {} with subject {}", to, subject);
            return;
        }
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(to);
        message.setSubject(subject);
        message.setText(text);
        executor.submit(() -> {
            try {
                mailSender.send(message);
            } catch (MailException ex) {
                log.warn("Failed to send email to {}: {}", to, ex.getMessage());
            } catch (RuntimeException ex) {
                log.warn("Failed to send email to {}", to, ex);
            }
        });
    }

    @PreDestroy
    void shutdown() {
        executor.shutdown();
    }
}
