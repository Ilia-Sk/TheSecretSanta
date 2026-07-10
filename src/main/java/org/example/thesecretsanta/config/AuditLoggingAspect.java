package org.example.thesecretsanta.config;

import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.annotation.AfterReturning;
import org.aspectj.lang.annotation.Aspect;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Aspect
@Component
public class AuditLoggingAspect {
    private static final Logger log = LoggerFactory.getLogger(AuditLoggingAspect.class);

    @AfterReturning("execution(* org.example.thesecretsanta.room.service..*(..)) || execution(* org.example.thesecretsanta.auth.service..*(..))")
    public void logServiceAction(JoinPoint joinPoint) {
        log.info("Service action completed: {}", joinPoint.getSignature().toShortString());
    }
}
