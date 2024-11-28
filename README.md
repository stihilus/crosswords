# Crossword

<img width="915" alt="image" src="https://github.com/user-attachments/assets/4d0e25b1-e933-4792-83ab-73e1841f0a1c">

An interactive musical grid where objects interact with bullets to create rhythmic patterns and melodies. Create, play, and share your musical compositions.

## Live Demo
https://stihilus.github.io/crosswords/

## Objects

### T - Trigger
- Shoots bullets in specified direction
- Speed options: ss (very slow), s (slow), n (normal), f (fast), ff (very fast)
- Direction options: n (north), e (east), s (south), w (west)

### M - Melody
- Plays musical note when hit by bullet
- Wave types: si (sine), sq (square), tr (triangle), st (sawtooth)
- Notes range: C4 to B5

### N - Noise
- Plays drum sound when hit by bullet
- Types: kd (kick drum), sn (snare), hh (hi-hat), tm (tom)

### D - Deflector
- Changes bullet direction
- Direction options: n (north), e (east), s (south), w (west)

### G - Gate
- Controls bullet passage
- Modes: 1 (all pass), 2 (every 2nd), 3 (every 3rd), 4 (every 4th), r (random)

### S - Sample
- Plays audio sample when hit by bullet
- Sample options: 01, 02, 03

### X - Splitter
- Creates additional bullets perpendicular to incoming bullet direction
- When hit horizontally: creates north and south bullets
- When hit vertically: creates east and west bullets

## Controls
1. Left click cell to select it
2. Press letter key to place object
3. Right click to remove object
4. Click top corners to change object settings

## Dependencies
- [Tone.js](https://tonejs.github.io/) for audio synthesis
- Google Fonts (Space Mono)

## File Structure 
