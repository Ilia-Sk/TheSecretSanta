package org.example.thesecretsanta.mail;

public interface MailClient {
    void send(String to, String subject, String text);
}
