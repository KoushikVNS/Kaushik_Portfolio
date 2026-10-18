# Kaushik Chakraborty · Portfolio (KC-OS)

A single-page portfolio with a robotics HUD theme: boot sequence with blast doors, neural-mesh background, a "vision pod" portrait with four camera modes and a face-lock overlay, target-lock cursor, stacking directive cards, installed-module cards, an interactive neural network, mission-file project placeholders, a working terminal, and a robot mascot that watches the cursor. Try the Konami code (or `overdrive` in the terminal).

## Run it

Open `index.html` directly in a browser, or serve the folder:

```bash
python3 -m http.server 5173
```

GSAP + ScrollTrigger and Lenis load from CDNs. If they fail, the page still renders; only the motion is skipped.

## Fill in the placeholders

| What | Where |
| --- | --- |
| Projects (title, text, tags, link, screenshot) | `index.html`, the four `PROJECT PLACEHOLDER` blocks in `#missions`. Put a screenshot in `assets/img/` and un-comment the `<img>` line. |
| Email, GitHub, LinkedIn, résumé | `index.html`, the links in `#uplink` (email is in both `href` and `data-copy`; the résumé is `assets/resume.pdf`). The terminal's `contact`, `resume`, `github` and `linkedin` commands in `js/main.js` use the same links. |
| Terminal commands | `js/main.js`, the `CMDS` object. |
| Robot lines | `js/main.js`, the `LINES` array. |

## Photo

All portrait assets were made on-device from `assets/img/portrait-original.jpg` with `assets/robot-vision.swift` (macOS Vision + Core Image):

- `portrait.png`: cut-out with orange key light and cyan rim
- `portrait-thermal.png`, `portrait-night.png`, `portrait-edge.png`: the Thermal, Night and Lidar camera modes
- `js/face-data.js`: face landmarks used for the face-lock mesh

Re-run after swapping the photo:

```bash
swift assets/robot-vision.swift assets/img/portrait-original.jpg assets/img js/face-data.js
```

(It also writes an `assets/img/_preview.png` you can delete.)
