# Your fighter models go here

Drop rigged humanoid characters in this folder (`.glb`, `.gltf` or `.fbx`) and list them in `fighters.json`:

```json
[
  { "file": "boxer-1.fbx", "name": "Shirtless brawler" },
  { "file": "boxer-2.glb", "name": "Heavyweight", "hide": ["Hat"] }
]
```

- `file`: the file name in this folder.
- `name`: shown on the character creation screen.
- `hide` (optional): mesh or material names to hide (hats, shirts).
- `rotateY` (optional): radians, if the model doesn't face +Z.

Works with Mixamo, Ready Player Me and MakeHuman ("game engine" skeleton) rigs. Opponents are spread across
whatever models you add; you pick yours when starting a new career. See the main README for where to get models.
