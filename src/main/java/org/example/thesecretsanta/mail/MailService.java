package org.example.thesecretsanta.mail;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.mail.MailProperties;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Service
public class MailService {
    private static final Logger log = LoggerFactory.getLogger(MailService.class);

    private final JavaMailSender mailSender;
    private final MailProperties mailProperties;

    public MailService(ObjectProvider<JavaMailSender> mailSender, MailProperties mailProperties) {
        this.mailSender = mailSender.getIfAvailable();
        this.mailProperties = mailProperties;
    }

    public void send(String to, String subject, String text) {
        if (mailSender == null || mailProperties.getHost() == null || mailProperties.getHost().isBlank()) {
            log.info("Email sending is disabled. Skipped email to {} with subject {}", to, subject);
            return;
        }
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(mailProperties.getUsername());
            message.setTo(to);
            message.setSubject(subject);
            message.setText(text);
            mailSender.send(message);
        } catch (MailException ex) {
            log.warn("Failed to send email to {}", to, ex);
        }
    }
}
