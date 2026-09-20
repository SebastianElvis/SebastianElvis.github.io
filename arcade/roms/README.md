# Arcade games

The desktop Arcade icon opens the game selector.
The Start game button starts the selected game.
The site hosts these user-supplied archives:

- `kof98.zip` contains the KOF '98 game for FinalBurn Neo.
- `../neogeo.zip` contains the Neo Geo BIOS (basic input/output system).
- `sfza.zip` contains Street Fighter Zero / Alpha for FinalBurn Alpha 2012 CPS-2.

The emulator keeps the BIOS archive at `/neogeo.zip`.
The emulator links `/sfa.zip` to `/sfza.zip` because the CPS-2 core requires the parent archive name.
The supplied Street Fighter archive contains all required game files.

The arcade uses [EmulatorJS 4.2.3](https://github.com/EmulatorJS/EmulatorJS/releases/tag/v4.2.3) from its content delivery network.
The emulator uses one thread so that GitHub Pages needs no extra response headers.

The W, S, A, and D keys move the player.
The V key inserts a coin.
The Enter key starts the game.

| Game | U | I | O | J | K | L |
| --- | --- | --- | --- | --- | --- | --- |
| KOF '98 | Light punch | Light kick | Heavy punch | Heavy kick | Unused | Unused |
| Street Fighter | Light punch | Medium punch | Heavy punch | Light kick | Medium kick | Heavy kick |

The emulator menu lets the user change controls or select a gamepad.
Touch devices use the emulator's screen controls.
The desktop pauses the game when the user selects another window or hides Arcade.
The emulator's play button resumes the game.
The Close button ends the game session.
The user must save the game state through the emulator menu before they close the window.
