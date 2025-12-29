package esillen.multiplayer_voice_game

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import org.springframework.scheduling.annotation.EnableScheduling

@SpringBootApplication
@EnableScheduling
class MultiplayerVoiceGameApplication

fun main(args: Array<String>) {
	runApplication<MultiplayerVoiceGameApplication>(*args)
}
