RIGGED CHARACTER MODELS (optional) - School Hide & Seek
=====================================================
Put these files in the SAME folder as game.html (the repo root):
  char_boy.glb    (used for boy / default outfits)
  char_girl.glb   (used when the player picks the 'BD School Girl' outfit)
If only one file exists it is used for everyone. If none exist, the game keeps using the built-in procedural characters.

TEST MODE (checks that rigged GLB + animation code works, no files needed):
  open game.html?glbtest=1   (uses the three.js sample 'Soldier' model; not a school student)

MODEL SPEC
- Format: .glb (binary glTF 2.0), one file, textures embedded. Target < 3 MB each, <= 15,000 triangles.
- Humanoid, standing in T-pose or A-pose, facing +Z, Y up. Real height does not matter (auto-scaled to 1.75 m).
- One skeleton, skinned (SkinnedMesh). Mixamo-style bone names work best ('mixamorig:RightHand' etc.).
- Textures: <= 1024x1024 JPG/WebP, no 4K. 1-3 materials.
- Animations embedded in the GLB, IN PLACE (no root motion). Clip names (case-insensitive, matched by text):
    Idle            required (or the first clip is used)
    Walk, Run       needed for movement
    Jump, Fall, Land
    Crouch (idle), CrouchWalk
    Hide (optional), Wave (optional emote)
  Missing clips fall back to Idle (crouch lowers the model a little).
- Optional colour customisation: name materials so they contain: skin / hair / shirt (or top, dress, kameez) / pant (or trouser, salwar, skirt) / shoe.
  Players' chosen skin, hair, shirt and pants colours are applied to those materials.
- Licence: CC0 or CC-BY (keep attribution). Do not use models you are not allowed to redistribute.

WHERE TO GET MODELS (check each licence yourself)
- Quaternius, KayKit, Poly Pizza (CC0 low-poly rigged characters, many as GLB)
- Mixamo (free Adobe account): download FBX with skin + 'In Place' animations, then convert FBX -> GLB with an online converter
- Cinevva free animation library (CC0 clips retargeted onto your rig, exports GLB)
