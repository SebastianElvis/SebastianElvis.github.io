# Game files

This directory does not contain game archives.
The user can select local archives if the site has no game files.
The browser reads these local files without an upload.

The arcade reads these files from this directory:

- `kof98.zip` contains the KOF '98 ROM set for FinalBurn Neo (FBNeo).
- `neogeo.zip` contains the Neo Geo BIOS set for FBNeo.

The emulator requires both ZIP files with their original names.
The ROM set must match the FBNeo core.
The arcade loads the BIOS archive at `/neogeo.zip` in the emulator file system.
The site serves both archives as static files.

The arcade uses [EmulatorJS 4.2.3](https://github.com/EmulatorJS/EmulatorJS/releases/tag/v4.2.3) from its content delivery network.
The desktop loads the emulator only when the user opens Arcade.
The Start game button starts the game download.
The emulator uses one thread so that GitHub Pages needs no extra response headers.

The arrow keys move the player.
The V key inserts a coin.
The Enter key starts the game.
The Z, X, A, and S keys control the four action buttons.
The emulator menu lets the user change controls or select a gamepad.
Touch devices use the emulator's screen controls.

The desktop pauses the game when the user selects another window or hides Arcade.
The emulator's play button resumes the game.
The Close button ends the game session.
The user must save the game state through the emulator menu before they close the window.
