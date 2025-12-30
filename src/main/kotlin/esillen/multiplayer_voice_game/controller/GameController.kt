package esillen.multiplayer_voice_game.controller

import esillen.multiplayer_voice_game.service.GameService
import org.springframework.stereotype.Controller
import org.springframework.ui.Model
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
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
        val state = gameService.getCurrentStateDto()
        model.addAttribute("leftTaken", state.leftPlayerName != null)
        model.addAttribute("rightTaken", state.rightPlayerName != null)
        model.addAttribute("leftPlayerName", state.leftPlayerName)
        model.addAttribute("rightPlayerName", state.rightPlayerName)
        return "join"
    }

    @GetMapping("/play")
    fun play(
        @RequestParam name: String,
        @RequestParam side: String,
        model: Model
    ): String {
        model.addAttribute("playerName", name)
        model.addAttribute("playerSide", side)
        return "play"
    }

    @GetMapping("/spectate")
    fun spectate(): String {
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

