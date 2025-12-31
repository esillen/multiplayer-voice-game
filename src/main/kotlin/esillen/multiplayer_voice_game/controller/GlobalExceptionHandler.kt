package esillen.multiplayer_voice_game.controller

import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ControllerAdvice
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.servlet.ModelAndView
import jakarta.servlet.http.HttpServletRequest

@ControllerAdvice
class GlobalExceptionHandler {

    private val logger = LoggerFactory.getLogger(GlobalExceptionHandler::class.java)

    @ExceptionHandler(Exception::class)
    fun handleException(request: HttpServletRequest, ex: Exception): Any {
        logger.error("Unhandled exception for request: ${request.requestURI}", ex)
        
        // Check if this is an API request (JSON expected)
        val acceptHeader = request.getHeader("Accept") ?: ""
        if (acceptHeader.contains("application/json")) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(mapOf(
                    "error" to "Internal Server Error",
                    "message" to "An unexpected error occurred",
                    "path" to request.requestURI
                ))
        }
        
        // Otherwise return a view
        val modelAndView = ModelAndView("error")
        modelAndView.status = HttpStatus.INTERNAL_SERVER_ERROR
        modelAndView.addObject("status", HttpStatus.INTERNAL_SERVER_ERROR.value())
        modelAndView.addObject("error", "Internal Server Error")
        modelAndView.addObject("message", "An unexpected error occurred")
        modelAndView.addObject("path", request.requestURI)
        
        return modelAndView
    }
}

