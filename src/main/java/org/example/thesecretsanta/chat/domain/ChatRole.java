package org.example.thesecretsanta.chat.domain;

/**
 * A side of a Santa ↔ recipient conversation. Each gift assignment is one
 * conversation: the giver writes as {@link #SANTA}, the receiver as {@link #RECIPIENT}.
 */
public enum ChatRole {
    SANTA,
    RECIPIENT;

    public ChatRole other() {
        return this == SANTA ? RECIPIENT : SANTA;
    }
}
