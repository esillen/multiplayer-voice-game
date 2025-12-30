package esillen.multiplayer_voice_game.controller

import esillen.multiplayer_voice_game.service.GameService
import org.springframework.stereotype.Controller
import org.springframework.ui.Model
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestParam

@Controller
class GameController(
    private val gameService: GameService
) {

    @GetMapping("/")
    fun index(): String {
        return "index"
    }

    @GetMapping("/join")
    fun join(model: Model): String {
        // Show all courts in the lobby view
        model.addAttribute("courts", gameService.getAllCourtSummaries())
        return "join"
    }

    @GetMapping("/play")
    fun play(
        @RequestParam name: String,
        @RequestParam side: String,
        @RequestParam(defaultValue = "1") court: Int,
        model: Model
    ): String {
        model.addAttribute("playerName", name)
        model.addAttribute("playerSide", side)
        model.addAttribute("courtId", court)
        model.addAttribute("visualSeed", gameService.getCourt(court)?.visualSeed ?: 0L)
        return "play"
    }

    @GetMapping("/spectate")
    fun spectate(
        @RequestParam(defaultValue = "1") court: Int,
        model: Model
    ): String {
        model.addAttribute("courtId", court)
        model.addAttribute("visualSeed", gameService.getCourt(court)?.visualSeed ?: 0L)
        return "spectate"
    }

    @GetMapping("/calibrate")
    fun calibrate(): String {
        return "calibrate"
    }

    @GetMapping("/singleplayer")
    fun singleplayer(): String {
        return "singleplayer"
    }
}
