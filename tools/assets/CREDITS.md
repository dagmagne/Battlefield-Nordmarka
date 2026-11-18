# Imported models

Converted by the scripts in this folder into `src/data/`. The source files are not in the repository; download them again from the pages below to re-run a script.

| Output | Source | Author | Licence | Script |
|---|---|---|---|---|
| `fpv.bin`, `fpv_a.webp`, `fpv_n.webp` (the player's FPV drone) | [UAV Strike Drone (War Thunder) Line Of Contact](https://sketchfab.com/3d-models/uav-strike-drone-war-thunder-line-of-contact-5856657e53474cc98d5575f2d3b3eafe) (GLB, 1k textures) | [KojfDiscord](https://sketchfab.com/KojfDiscord) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) | `fpv.mjs <glb> --tris 4500 --err 0.02` |

Changes made: simplified from 58.8k to 5.7k triangles, the rotors split off as spinning parts, flipped to face the game's forward, scaled by 1.25, textures cut to 512 px (specular folded into the normal map), two tiny extra materials dropped. The credit is also shown in the in-game help (H).

Note: the title mentions War Thunder. Sketchfab lists it as the uploader's own work under CC BY; if it turns out to be extracted from the game, replace it.
