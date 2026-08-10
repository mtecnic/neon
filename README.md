<div align="center">

# ⬡ N E O N &nbsp; C I T Y ⬡

### `HARDWARE RUNNER // SECTOR 7`

**Buy low. Sell high. The city is always moving.**

![single file](https://img.shields.io/badge/SINGLE_FILE-one_.html-00f0ff?style=for-the-badge&labelColor=0a0f26)
![three.js](https://img.shields.io/badge/three.js-r160-ff00aa?style=for-the-badge&labelColor=0a0f26)
![zero deps](https://img.shields.io/badge/DEPENDENCIES-zero-f5ff5a?style=for-the-badge&labelColor=0a0f26)
![vanilla js](https://img.shields.io/badge/VANILLA-JS-00ff88?style=for-the-badge&labelColor=0a0f26)
![tests](https://img.shields.io/badge/HEADLESS_TESTS-41_green-b066ff?style=for-the-badge&labelColor=0a0f26)

<br>

<img src="neon%20images/Menu.png" width="85%" alt="NEON CITY title screen">

*You stepped off the maglev with 5,000 credits and a cargo rig.*
*The city doesn't know your name yet.*

</div>

---

## ⟨ JACK IN ⟩

**No install. No build. No servers.** The entire game — renderer, procedural city, economy,
music synth, save system — lives in **one HTML file**. Open `neon.html` in a browser and you're in.

```
git clone → open neon.html → CLICK TO JACK IN
```

That's it. That's the deployment pipeline.

---

## ⟨ THE STREETS ⟩

<div align="center">
<img src="neon%20images/Screenshot%202026-08-10%20024427.png" width="49%" alt="Shadow Circuits plaza in the rain">
<img src="neon%20images/Screenshot%202026-08-10%20025000.png" width="49%" alt="Rain-slick streets under the LOVE HOTEL sign">
</div>

A fully procedural cyberpunk metropolis rendered in real time:

- 🌆 **A living grid** — hundreds of towers with lit windows, rooftop clutter, comm masts, skybridges, holo-billboards raining glyphs, and neon signage that flickers like a real dying grid
- 🌧️ **Weather that matters** — rain slicks the asphalt into a neon mirror (real env-mapped reflections), storms bring lightning, thunder, and umbrella crowds… and better black-market margins
- 🌗 **A full day/night cycle** — dawn god-rays, corporate searchlights after dark, aurora on clear nights, a moon that rises as the sun sets
- 🚗 **Hover traffic, bird flocks, fireflies over the park pond** — the city moves whether you do or not
- 🤖 **160 street NPCs** walking real lanes, turning real corners, gossiping real market intel — plus 10 named vendors with their own agendas

## ⟨ THE HUSTLE ⟩

<div align="center">
<img src="neon%20images/Screenshot%202026-08-10%20024656.png" width="80%" alt="Trading GPUs at the Corporate Spire">
</div>

An honest-to-god simulated hardware market:

- 📈 **GPUs · RAM · CPUs** — procedurally named models (`ONI 6100`, `HYPERCELL DDR7`, `RONIN 24C-9.2`) release on a **real-world clock**: new generations drop every ~2 days whether you're logged in or not
- 💾 **A lifecycle ladder** — `NEW → STD → HOBBY → COLLECTOR`. Yesterday's flagship is tomorrow's garbage… until it goes vintage and collectors pay stupid money
- 🏙️ **Four districts per city, four different markets** — the Spire pays premium, the Docks move bulk, the Circuits gamble hard after dark in the rain
- 🌊 **Live supply & demand** — your own trades move local prices; dump a stack and watch the margin die
- 📡 **World events** — chip shortages, AI training rushes, memory gluts, corporate raids with physical lockdowns, convoy crates you can crack open on the street
- 🚚 **Courier contracts, street bounties, rig-building quests, a hi-lo gambling den** (the house always eats — we tested, over 2,000 hands)

## ⟨ THE CLIMB ⟩

<div align="center">
<img src="neon%20images/Screenshot%202026-08-10%20024600.png" width="49%" alt="Your studio — bed, locker, skyline">
<img src="neon%20images/Screenshot%202026-08-10%20024903.png" width="49%" alt="Club Voltage — lasers, dancers, mirror ball">
</div>

- 🏠 **Housing ladder** — capsule pod → studio → loft → penthouse. Pay rent or wake up evicted with your stash impounded in the basement
- 🛋️ **Furnish your place** — koi tank, arcade cabinet, plasma column, micro shrine, panorama glass… a foam-core mattress that genuinely makes you sleep better
- 🧠 **Cyberware tree** — carbon legs, air-dash thrusters, market-maker ghost orders, sealed mag-lock cargo, an auto-trader drone that runs routes while you sleep
- 🏆 **STREET RAT → GHOST IN THE GRID** — seven ranks of the city slowly learning your name
- 📖 **The Ledger** — a five-act story about a broker who vanished ten years ago, threaded through every vendor in town
- 🕺 **Club Voltage** — beat-synced dance floor, lasers, strobe, VIP gossip lounge. Cover is 200c. Syndicates walk in free.

## ⟨ THE SPRAWL ⟩

<div align="center">
<img src="neon%20images/Screenshot%202026-08-10%20025203.png" width="80%" alt="Deep night at the maglev gate">
</div>

Hit **250,000 credits net worth** and the trans-city maglev unlocks:

- 🚄 **OBSIDIAN SPRAWL** — a second, bigger, meaner city. 11×11 blocks of old money and blackout rows: the Mirror Exchange, The Crown, Blackout Row, the Foundry Pits
- 🎲 **Its own economy** — independent markets, stock windows, warehouses, and price streams. Real inter-city arbitrage
- 🧬 **Deterministic worlds** — both cities regenerate byte-identically every visit. Your city is *your* city.

---

## ⟨ CONTROLS ⟩

| KEY | ACTION | KEY | ACTION |
|:---:|--------|:---:|--------|
| `WASD` | move | `E` | trade (inside a district) |
| `MOUSE` | look | `F` | talk / doors / interact |
| `SHIFT` | sprint | `M` | market scanner |
| `SPACE` | jump | `T` | maglev transit |
| `N` | city map | `H` | toggle HUD |
| `P` | sound / music | `ESC` | close / release mouse |

Full touch controls on mobile — virtual stick + action buttons.

---

## ⟨ UNDER THE HOOD ⟩

- **One file.** ~9,000 lines of hand-rolled vanilla JS + three.js r160 off a CDN. Every texture is painted on a `<canvas>` at boot — zero image assets
- **Hand-built HDR post pipeline** — MSAA → dual-kawase bloom → god rays → ACES + chromatic aberration + grain + scanlines in one composite shader (WebGL2, graceful fallback)
- **Procedural audio** — the entire soundtrack and every SFX synthesized live via WebAudio; the bass shows up at night, the drums show up when your street risk does
- **Deterministic world-gen** — seeded mulberry32 streams; the market catalog derives from your save seed and the real-world clock, so reload-scumming rerolls nothing
- **Battle-tested** — ships with a headless Node test harness (`neon_tests/`) that boots the *actual game* under a virtual clock: 41 checks across boot, travel, economy, save/load, regressions, plus a 10,000-action fuzz soak and a mutation self-test. No money glitches. No teleport corruption. We checked. Twice. Deterministically.

```
cd neon_tests && node tests.js        # full suite, run twice for determinism
node tests.js selftest                # proves the suite catches seeded bugs
node tests.js soak --soak=20000       # 20k-action fuzz gauntlet
```

---

## ⟨ TAGS ⟩

`cyberpunk` `trading-sim` `threejs` `webgl` `single-file` `procedural-generation`
`open-world` `economy-simulation` `vanilla-javascript` `no-dependencies` `browser-game`
`synthwave` `neon` `roguelite` `day-night-cycle` `procedural-audio` `indie-game`

---

<div align="center">

**`buy low · sell high · the city is always moving`**

⬡ &nbsp; *stay dry, stay solvent* &nbsp; ⬡

</div>
