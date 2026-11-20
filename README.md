# Last Orders: Bare Knuckle

A browser bare-knuckle boxing game. You're a barman at the King's Head in Ashcroft, Greater Manchester.
The pub owes the brewery £6,000, so you fight your way up three divisions to save it.

## Run it

```bash
python3 serve.py
```

Then open http://localhost:8123. (Any static server works; `serve.py` just turns caching off.)
Three.js loads from the jsDelivr CDN, so you need an internet connection.

## What's in it

- **Story mode**: intro scrap in the pub (the tutorial), Maggie, Terry, Ronnie Vance, Vince Doyle, a bribe choice, and an ending.
- **Season mode**: 8-fighter round-robin leagues (3 pts a win, +1 KO bonus, 1 for a draw), fixtures and AI-vs-AI results each week, a top-two final, and promotion: Cellar League → Northern Circuit → National Championship.
- **Weekly loop**: three slots a week for training, bar shifts (money plus random events) or rest (fatigue), then fight night.
- **Training mini-games**: heavy bag (rhythm), skipping (timing), circuits (pace control), sparring (a live fight). You can also sim a session for 70% of the gains.
- **Fighting**: jab/cross/hook/uppercut, body shots, block, slips, counters, stamina and body damage, knockdowns with a get-up mash, corner choices between rounds, and 10-point-must scoring.
- **Quick Fight** against any of the 21 fighters.

## Generated bodies

Every character without a downloaded model gets a **generated body**: one smooth, sculpted mesh built at load time
(`js/bodygen.js`). Each body is defined by about 80 anatomical shapes (skull, jaw, nose, eyelids, pecs, abs, lats, deltoids,
biceps…), turned into a surface with marching cubes, sculpted at higher resolution around the head, shaded with
baked ambient occlusion, and skinned to a Mixamo-style skeleton. Build, skin tone, hair style and colour, beard,
trousers, shirts, hand wraps and male/female body shapes all come from each character's `look`. Each body takes about 0.35s
to generate and is cached.

`Fighter.generatedBodies = false` (in `js/fighter.js`) switches back to the old primitive mannequins.

## Real character models

The fight animation is procedural, and it gets retargeted onto any rigged humanoid, so you can drop in real models:

- **Pub cast:** Terry and Ronnie Vance already use a realistic Ready Player Me avatar that ships with the three.js examples. It loads from a CDN.
- **Fighters:** put your own models in `assets/fighters/` and list them in `assets/fighters/fighters.json` (details in `assets/fighters/README.md`). Opponents get spread across them, and you pick yours on the new-career screen.

Good free sources for shirtless fighters (you need your own account for these):

- **Mixamo** (mixamo.com, free Adobe login): pick a character, then Download → Format *FBX Binary*, Pose *T-pose*, *With Skin*.
- **MakeHuman** (free desktop app, CC0 output): build a man, give him trousers only, then export *glTF* with the *Game engine* skeleton.
- Anything else with a Mixamo, Unreal or Ready Player Me style skeleton.

Models need a full body under the clothes (no hidden torso), facing +Z, roughly in T-pose.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move / circle |
| J / K / L / I | Jab / cross / hook / uppercut |
| Shift + punch | Body shot |
| Space | Block (hold); mash to get up when you're down |
| Q / E | Slip left / right |
| C | Cycle camera |
| Esc | Pause |

## Code map

- `js/engine.js`: renderer, post-processing (bloom, grade, grain, vignette)
- `js/fighter.js`: procedural fighter rig (IK arms and legs) and animation
- `js/models.js`: loads rigged glTF/FBX characters and retargets the animation onto their skeletons
- `js/bodygen.js`: generates sculpted, skinned human bodies from anatomical shapes
- `js/fight.js`: combat, AI styles, HUD, knockdowns, scoring
- `js/scenes.js`: pub, gym and three fight venues
- `js/career.js`: roster, leagues, fixtures, sims, save/load (localStorage)
- `js/story.js`: dialogue scripts and bar-shift events
- `js/training.js`: mini-games
- `js/main.js`: game flow and screens

Console helpers: `__dbg.quick(n)` starts a quick fight against roster #n (0–20).
