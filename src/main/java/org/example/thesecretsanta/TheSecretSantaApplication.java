package org.example.thesecretsanta;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class TheSecretSantaApplication {

    public static void main(String[] args) {
        SpringApplication.run(TheSecretSantaApplication.class, args);
    }

}
//cd D:\SpringProjects\TheSecretSanta\frontend
//npm.cmd install
//npm.cmd run dev