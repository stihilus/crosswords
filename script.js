document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('grid');
    const GRID_SIZE = 15;
    let selectedCell = null;
    const BPM = 120;
    const MS_PER_BEAT = (60 * 1000) / BPM;
    let projectiles = [];
    let shooters = [];
    let beatCount = 0;
    let isPlaying = true;
    let shootingInterval = null;

    // Define available tones (using standard octave notation)
    const TONES = [
        'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4',
        'C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5'
    ];

    // Add oscillator types
    const OSCILLATOR_TYPES = [
        { code: 'si', type: 'sine' },
        { code: 'sq', type: 'square' },
        { code: 'tr', type: 'triangle' },
        { code: 'st', type: 'sawtooth' }
    ];

    // Add noise types
    const NOISE_TYPES = [
        { code: 'kd', type: 'kick', settings: {
            noise: { type: 'brown' },
            envelope: { attack: 0.001, decay: 0.2, sustain: 0 }
        }},
        { code: 'sn', type: 'snare', settings: {
            noise: { type: 'white' },
            envelope: { attack: 0.005, decay: 0.1, sustain: 0 }
        }},
        { code: 'hh', type: 'hihat', settings: {
            noise: { type: 'white' },
            envelope: { attack: 0.001, decay: 0.05, sustain: 0 }
        }},
        { code: 'tm', type: 'tom', settings: {
            noise: { type: 'pink' },
            envelope: { attack: 0.001, decay: 0.15, sustain: 0 }
        }}
    ];

    // Add shooting speed variations
    const SHOOT_SPEEDS = [
        { code: 'n', multiplier: 1, desc: 'normal' },    // shoots every 4 beats (current default)
        { code: 'f', multiplier: 2, desc: 'fast' },      // shoots every 2 beats
        { code: 'ff', multiplier: 4, desc: 'very fast' },// shoots every beat
        { code: 's', multiplier: 0.5, desc: 'slow' },    // shoots every 8 beats
        { code: 'ss', multiplier: 0.25, desc: 'very slow' } // shoots every 16 beats
    ];

    // Add deflector directions
    const DEFLECTOR_DIRECTIONS = {
        e: { dx: 1, dy: 0, name: 'e' },    // east
        s: { dx: 0, dy: 1, name: 's' },    // south
        w: { dx: -1, dy: 0, name: 'w' },   // west
        n: { dx: 0, dy: -1, name: 'n' }    // north
    };

    // Add after other constants
    const GATE_FILTERS = [
        { code: '1', interval: 1 },
        { code: '2', interval: 2 },
        { code: '3', interval: 3 },
        { code: '4', interval: 4 },
        { code: 'r', interval: 'random' }
    ];

    // Add audio samples
    const AUDIO_SAMPLES = [
        { code: '01', file: '01.wav' },
        { code: '02', file: '02.wav' },
        { code: '03', file: '03.wav' }
    ];

    // Create audio players pool
    const audioPlayers = AUDIO_SAMPLES.map(sample => {
        const player = new Tone.Player({
            url: `samples/${sample.file}`,
            onload: () => console.log(`Loaded ${sample.file}`),
        }).toDestination();
        return { code: sample.code, player };
    });

    // Create a function to get a new synth instance
    function createSynth() {
        return new Tone.Synth({
            oscillator: {
                type: "sine" // default type, will be changed when playing
            },
            envelope: {
                attack: 0.01,
                decay: 0.1,
                sustain: 0.3,
                release: 0.1
            }
        }).toDestination();
    }

    // Initialize a pool of synths for polyphonic playback
    const synthPool = Array(5).fill(null).map(() => createSynth());
    let currentSynthIndex = 0;

    // Initialize a pool of noise synths for polyphonic playback
    const noiseSynthPool = Array(5).fill(null).map(() => new Tone.NoiseSynth().toDestination());
    let currentNoiseSynthIndex = 0;

    // Define directions
    const DIRECTIONS = {
        e: { dx: 1, dy: 0, name: 'e' },    // east
        s: { dx: 0, dy: 1, name: 's' },    // south
        w: { dx: -1, dy: 0, name: 'w' },   // west
        n: { dx: 0, dy: -1, name: 'n' }    // north
    };

    // Create grid cells with position data
    for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.x = i % GRID_SIZE;
        cell.dataset.y = Math.floor(i / GRID_SIZE);
        grid.appendChild(cell);
    }

    // Handle cell selection and rotation
    grid.addEventListener('click', async (e) => {
        if (e.target.classList.contains('cell')) {
            if (Tone.context.state !== 'running') {
                await Tone.start();
            }

            const x = parseInt(e.target.dataset.x);
            const y = parseInt(e.target.dataset.y);
            
            const rect = e.target.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            
            // Check for clicks in corners
            const isLeftCornerClick = clickX <= 20 && clickY <= 20;
            const isRightCornerClick = clickX >= rect.width - 20 && clickY <= 20;
            
            // Handle S object
            if (e.target.textContent === 'S') {
                const shooterIndex = shooters.findIndex(s => s.x === x && s.y === y);
                if (shooterIndex !== -1) {
                    if (isLeftCornerClick) {
                        // Change speed
                        const currentSpeed = e.target.dataset.speed || 'n';
                        const currentIndex = SHOOT_SPEEDS.findIndex(s => s.code === currentSpeed);
                        const nextIndex = (currentIndex + 1) % SHOOT_SPEEDS.length;
                        const nextSpeed = SHOOT_SPEEDS[nextIndex];
                        
                        shooters[shooterIndex].speedCode = nextSpeed.code;
                        e.target.dataset.speed = nextSpeed.code;
                        updateURL();
                        return;
                    } else if (isRightCornerClick) {
                        // Change direction
                        const directions = Object.values(DIRECTIONS);
                        const currentDir = shooters[shooterIndex].direction;
                        const currentIndex = directions.findIndex(d => 
                            d.dx === currentDir.dx && d.dy === currentDir.dy
                        );
                        const nextIndex = (currentIndex + 1) % directions.length;
                        const nextDir = directions[nextIndex];
                        
                        shooters[shooterIndex].direction = nextDir;
                        e.target.dataset.direction = nextDir.name;
                        updateURL();
                        return;
                    }
                }
            }
            
            // Handle T object
            if (e.target.textContent === 'T') {
                const shooterIndex = shooters.findIndex(s => s.x === x && s.y === y);
                if (shooterIndex !== -1) {
                    if (isLeftCornerClick) {
                        // Change speed
                        const currentSpeed = e.target.dataset.speed || 'n';
                        const currentIndex = SHOOT_SPEEDS.findIndex(s => s.code === currentSpeed);
                        const nextIndex = (currentIndex + 1) % SHOOT_SPEEDS.length;
                        const nextSpeed = SHOOT_SPEEDS[nextIndex];
                        
                        shooters[shooterIndex].speedCode = nextSpeed.code;
                        e.target.dataset.speed = nextSpeed.code;
                        updateURL();
                        return;
                    } else if (isRightCornerClick) {
                        // Change direction
                        const directions = Object.values(DIRECTIONS);
                        const currentDir = shooters[shooterIndex].direction;
                        const currentIndex = directions.findIndex(d => 
                            d.dx === currentDir.dx && d.dy === currentDir.dy
                        );
                        const nextIndex = (currentIndex + 1) % directions.length;
                        const nextDir = directions[nextIndex];
                        
                        shooters[shooterIndex].direction = nextDir;
                        e.target.dataset.direction = nextDir.name;
                        updateURL();
                        return;
                    }
                }
            }
            
            // Handle M object
            if (e.target.textContent === 'M') {
                if (isLeftCornerClick) {
                    // Change oscillator type
                    const currentOsc = e.target.dataset.oscillator || 'si';
                    const currentIndex = OSCILLATOR_TYPES.findIndex(osc => osc.code === currentOsc);
                    const nextIndex = (currentIndex + 1) % OSCILLATOR_TYPES.length;
                    const nextOsc = OSCILLATOR_TYPES[nextIndex];
                    e.target.dataset.oscillator = nextOsc.code;
                    
                    // Preview the sound
                    const tone = e.target.dataset.tone || 'C4';
                    const synth = synthPool[currentSynthIndex];
                    synth.oscillator.type = nextOsc.type;
                    synth.triggerAttackRelease(tone, "8n");
                    updateURL();
                    return;
                }
                else if (isRightCornerClick) {
                    // Change tone
                    const currentTone = e.target.dataset.tone || 'C4';
                    const currentIndex = TONES.indexOf(currentTone);
                    const nextIndex = (currentIndex + 1) % TONES.length;
                    const nextTone = TONES[nextIndex];
                    e.target.dataset.tone = nextTone;
                    e.target.title = nextTone;
                    
                    // Preview the sound
                    const oscType = OSCILLATOR_TYPES.find(
                        osc => osc.code === (e.target.dataset.oscillator || 'si')
                    ).type;
                    const synth = synthPool[currentSynthIndex];
                    synth.oscillator.type = oscType;
                    synth.triggerAttackRelease(nextTone, "8n");
                    updateURL();
                    return;
                }
            }

            // Handle N object
            if (e.target.textContent === 'N' && isLeftCornerClick) {
                // Change noise type
                const currentNoise = e.target.dataset.noisetype || 'kd';
                const currentIndex = NOISE_TYPES.findIndex(n => n.code === currentNoise);
                const nextIndex = (currentIndex + 1) % NOISE_TYPES.length;
                const nextNoise = NOISE_TYPES[nextIndex];
                e.target.dataset.noisetype = nextNoise.code;
                
                // Preview the sound
                const synth = noiseSynthPool[currentNoiseSynthIndex];
                Object.assign(synth.noise, nextNoise.settings.noise);
                Object.assign(synth.envelope, nextNoise.settings.envelope);
                synth.triggerAttackRelease('8n');
                updateURL();
                return;
            }

            // Handle D object
            if (e.target.textContent === 'D' && isRightCornerClick) {
                const currentDeflect = e.target.dataset.deflect || 'e';
                const directions = Object.values(DEFLECTOR_DIRECTIONS);
                const currentIndex = directions.findIndex(d => d.name === currentDeflect);
                const nextIndex = (currentIndex + 1) % directions.length;
                const nextDir = directions[nextIndex];
                
                e.target.dataset.deflect = nextDir.name;
                updateURL();
                return;
            }

            // Handle G object
            if (e.target.textContent === 'G' && isLeftCornerClick) {
                const currentGate = e.target.dataset.gate || '1';
                const currentIndex = GATE_FILTERS.findIndex(g => g.code === currentGate);
                const nextIndex = (currentIndex + 1) % GATE_FILTERS.length;
                const nextGate = GATE_FILTERS[nextIndex];
                e.target.dataset.gate = nextGate.code;
                updateURL();
                return;
            }

            // Handle S object
            if (e.target.textContent === 'S' && isLeftCornerClick) {
                const currentSample = e.target.dataset.sample || '01';
                const currentIndex = AUDIO_SAMPLES.findIndex(s => s.code === currentSample);
                const nextIndex = (currentIndex + 1) % AUDIO_SAMPLES.length;
                const nextSample = AUDIO_SAMPLES[nextIndex];
                e.target.dataset.sample = nextSample.code;
                
                // Preview the sample
                const player = audioPlayers.find(p => p.code === nextSample.code);
                if (player && player.player.loaded) {
                    player.player.start();
                }
                updateURL();
                return;
            }

            // Only select cell if not clicking corners
            if (!isLeftCornerClick && !isRightCornerClick) {
                if (selectedCell) {
                    selectedCell.classList.remove('selected');
                }
                selectedCell = e.target;
                selectedCell.classList.add('selected');
            }

            // Add URL update after any property change
            if (isLeftCornerClick || isRightCornerClick) {
                updateURL();
            }
        }
    });

    function getCellAt(x, y) {
        return document.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
    }

    function createProjectile(shooter) {
        // Calculate starting position based on direction
        const startX = parseInt(shooter.x) + shooter.direction.dx;
        const startY = parseInt(shooter.y) + shooter.direction.dy;
        
        // Only create projectile if starting position is within grid
        if (startX >= 0 && startX < GRID_SIZE && 
            startY >= 0 && startY < GRID_SIZE) {
            return {
                x: startX,
                y: startY,
                direction: shooter.direction,
                char: '·'
            };
        }
        return null;
    }

    function playTone(cell) {
        if (cell.textContent === 'S') {
            const sampleCode = cell.dataset.sample || '01';
            const player = audioPlayers.find(p => p.code === sampleCode);
            if (player && player.player.loaded) {
                player.player.start();
            }
        } else if (cell.textContent === 'N') {
            const noiseType = NOISE_TYPES.find(
                n => n.code === (cell.dataset.noisetype || 'kd')
            );
            const synth = noiseSynthPool[currentNoiseSynthIndex];
            Object.assign(synth.noise, noiseType.settings.noise);
            Object.assign(synth.envelope, noiseType.settings.envelope);
            synth.triggerAttackRelease('8n');
            currentNoiseSynthIndex = (currentNoiseSynthIndex + 1) % noiseSynthPool.length;
        } else if (cell.textContent === 'M') {
            const tone = cell.dataset.tone || 'C4';
            const oscType = OSCILLATOR_TYPES.find(
                osc => osc.code === (cell.dataset.oscillator || 'si')
            ).type;
            
            const synth = synthPool[currentSynthIndex];
            synth.oscillator.type = oscType;
            synth.triggerAttackRelease(tone, "8n");
            currentSynthIndex = (currentSynthIndex + 1) % synthPool.length;
        }
    }

    function updateProjectiles() {
        const hitsToneThisFrame = [];
        const newProjectiles = []; // Array to collect new projectiles

        projectiles = projectiles.filter(projectile => {
            const oldCell = getCellAt(projectile.x, projectile.y);
            if (oldCell && oldCell.textContent === projectile.char) {
                oldCell.textContent = '';
            }

            projectile.x += projectile.direction.dx;
            projectile.y += projectile.direction.dy;

            if (projectile.x >= GRID_SIZE || projectile.x < 0 || 
                projectile.y >= GRID_SIZE || projectile.y < 0) {
                return false;
            }

            const newCell = getCellAt(projectile.x, projectile.y);
            if (newCell) {
                // Handle gate
                if (newCell.textContent === 'G') {
                    const gateType = newCell.dataset.gate;
                    
                    if (gateType === 'r') {
                        // Random mode: 50% chance to pass
                        if (Math.random() < 0.5) {
                            // Add hit animation for gate
                            newCell.classList.add('hit-g');
                            setTimeout(() => {
                                newCell.classList.remove('hit-g');
                            }, 200);
                        } else {
                            return false; // Don't let bullet through
                        }
                    } else {
                        // Normal numbered modes
                        const gateInterval = parseInt(gateType);
                        let bulletCount = parseInt(newCell.dataset.bulletCount || '0');
                        bulletCount = (bulletCount + 1) % gateInterval;
                        newCell.dataset.bulletCount = bulletCount.toString();
                        
                        // Only let through if bulletCount is 0
                        if (bulletCount !== 0) {
                            return false;
                        }
                        
                        // Add hit animation for gate
                        newCell.classList.add('hit-g');
                        setTimeout(() => {
                            newCell.classList.remove('hit-g');
                        }, 200);
                    }
                }
                
                // Handle deflector
                if (newCell.textContent === 'D') {
                    const deflectDir = DEFLECTOR_DIRECTIONS[newCell.dataset.deflect];
                    projectile.direction = deflectDir;
                    // Add hit animation for D
                    newCell.classList.add('hit-d');
                    setTimeout(() => {
                        newCell.classList.remove('hit-d');
                    }, 200);
                }
                // Handle M, N, and S objects
                if (newCell.textContent === 'M') {
                    hitsToneThisFrame.push(newCell);
                    newCell.classList.add('hit-t');
                    setTimeout(() => {
                        newCell.classList.remove('hit-t');
                    }, 200);
                }
                if (newCell.textContent === 'N') {
                    hitsToneThisFrame.push(newCell);
                    newCell.classList.add('hit-n');
                    setTimeout(() => {
                        newCell.classList.remove('hit-n');
                    }, 200);
                }
                if (newCell.textContent === 'S') {
                    hitsToneThisFrame.push(newCell);
                    newCell.classList.add('hit-s');
                    setTimeout(() => {
                        newCell.classList.remove('hit-s');
                    }, 200);
                }
                // Handle splitter (X)
                if (newCell.textContent === 'X') {
                    // Create two additional projectiles perpendicular to current direction
                    const currentDir = projectile.direction;
                    
                    // If moving horizontally, create vertical bullets
                    if (Math.abs(currentDir.dx) === 1) {
                        // Create north bullet
                        newProjectiles.push({
                            x: projectile.x,
                            y: projectile.y - 1, // Start one cell up
                            direction: DIRECTIONS.n,
                            char: '·'
                        });
                        // Create south bullet
                        newProjectiles.push({
                            x: projectile.x,
                            y: projectile.y + 1, // Start one cell down
                            direction: DIRECTIONS.s,
                            char: '·'
                        });
                    }
                    // If moving vertically, create horizontal bullets
                    else if (Math.abs(currentDir.dy) === 1) {
                        // Create east bullet
                        newProjectiles.push({
                            x: projectile.x + 1, // Start one cell right
                            y: projectile.y,
                            direction: DIRECTIONS.e,
                            char: '·'
                        });
                        // Create west bullet
                        newProjectiles.push({
                            x: projectile.x - 1, // Start one cell left
                            y: projectile.y,
                            direction: DIRECTIONS.w,
                            char: '·'
                        });
                    }

                    // Add hit animation
                    newCell.classList.add('hit-x');
                    setTimeout(() => {
                        newCell.classList.remove('hit-x');
                    }, 200);
                }
                if (!newCell.textContent || newCell.textContent === '·') {
                    newCell.textContent = projectile.char;
                }
            }
            return true;
        });

        // Add new projectiles after filtering
        projectiles = projectiles.concat(
            newProjectiles.filter(p => 
                p.x >= 0 && p.x < GRID_SIZE && 
                p.y >= 0 && p.y < GRID_SIZE
            )
        );

        hitsToneThisFrame.forEach(cell => {
            playTone(cell);
        });
    }

    function shootFromShooters() {
        beatCount++;
        shooters.forEach(shooter => {
            const speedSetting = SHOOT_SPEEDS.find(s => s.code === shooter.speedCode);
            const beatMultiple = 4 / speedSetting.multiplier; // 4 is our base beat count
            
            if (beatCount % beatMultiple === 0) {
                const projectile = createProjectile(shooter);
                if (projectile) {
                    projectiles.push(projectile);
                    const shooterCell = getCellAt(shooter.x, shooter.y);
                    shooterCell.classList.add('shooting');
                    setTimeout(() => {
                        shooterCell.classList.remove('shooting');
                    }, 200);
                }
            }
        });
    }

    // Add the play/stop control functionality
    const playButton = document.getElementById('play-button');
    const controlIcon = document.getElementById('control-icon');

    playButton.addEventListener('click', () => {
        isPlaying = !isPlaying;
        
        if (isPlaying) {
            // Start shooting
            shootingInterval = setInterval(() => {
                updateProjectiles();
                shootFromShooters();
            }, MS_PER_BEAT);
            
            // Switch to stop icon
            controlIcon.src = 'stop.svg';
        } else {
            // Stop shooting
            if (shootingInterval) {
                clearInterval(shootingInterval);
                shootingInterval = null;
            }
            
            // Switch to play icon
            controlIcon.src = 'play.svg';
        }
    });

    // Add this function to update URL without reloading page
    function updateURL() {
        const state = encodeGridState();
        const newURL = `${window.location.origin}${window.location.pathname}?grid=${state}`;
        window.history.replaceState({ grid: state }, '', newURL);
    }

    // Modify the keypress handler to update URL after placing objects
    document.addEventListener('keypress', (e) => {
        if (selectedCell) {
            const char = String.fromCharCode(e.keyCode).toUpperCase();
            
            if (char === 'T') {
                const x = parseInt(selectedCell.dataset.x);
                const y = parseInt(selectedCell.dataset.y);
                shooters.push({ 
                    x, 
                    y, 
                    direction: DIRECTIONS.e,
                    speedCode: 'n'
                });
                selectedCell.textContent = char;
                selectedCell.dataset.direction = 'e';
                selectedCell.dataset.speed = 'n';
            } else if (char === 'M') {
                selectedCell.textContent = char;
                selectedCell.dataset.tone = 'C4';
                selectedCell.dataset.oscillator = 'si';
                selectedCell.title = 'C4';
            } else if (char === 'N') {
                selectedCell.textContent = char;
                selectedCell.dataset.noisetype = 'kd'; // Set default noise type
                selectedCell.removeAttribute('data-tone');
                selectedCell.removeAttribute('data-oscillator');
            } else if (char === 'D') {
                selectedCell.textContent = char;
                selectedCell.dataset.deflect = 'e'; // Start with east direction
            } else if (char === 'G') {
                selectedCell.textContent = char;
                selectedCell.dataset.gate = '1';  // Start with letting all bullets pass
                selectedCell.dataset.bulletCount = '0';  // Counter for bullets
            } else if (char === 'S') {
                selectedCell.textContent = char;
                selectedCell.dataset.sample = '01'; // Default to first sample
            } else if (char === 'X') {
                selectedCell.textContent = char;
                selectedCell.dataset.splitter = 'x';  // Just to mark it as a splitter
            }
            
            selectedCell.classList.remove('selected');
            selectedCell = null;
            
            // Add URL update
            updateURL();
        }
    });

    // Prevent context menu on right click
    grid.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });

    // Update the clearCell function
    function clearCell(cell) {
        // Remove shooter if exists
        const x = parseInt(cell.dataset.x);
        const y = parseInt(cell.dataset.y);
        const shooterIndex = shooters.findIndex(s => s.x === x && s.y === y);
        if (shooterIndex !== -1) {
            shooters.splice(shooterIndex, 1);
        }

        // Clear all cell properties
        cell.textContent = '';
        
        // Clear all possible data attributes
        cell.removeAttribute('data-direction');
        cell.removeAttribute('data-speed');
        cell.removeAttribute('data-tone');
        cell.removeAttribute('data-oscillator');
        cell.removeAttribute('data-noisetype');
        cell.removeAttribute('data-deflect');
        cell.removeAttribute('data-gate');
        cell.removeAttribute('data-bulletCount');
        cell.removeAttribute('data-sample');
        cell.removeAttribute('data-splitter');
        cell.removeAttribute('title');

        // Only keep the position data attributes
        cell.dataset.x = x;
        cell.dataset.y = y;
    }

    // Modify the right-click handler to update URL after removing objects
    grid.addEventListener('mousedown', (e) => {
        if (e.button === 2 && e.target.classList.contains('cell')) {
            e.preventDefault();
            clearCell(e.target);
            updateURL();
        }
    });

    // Add this CSS for the shooting animation
    document.head.insertAdjacentHTML('beforeend', `
        <style>
            @keyframes shoot {
                0% { background-color: #EDEAE6; }
                50% { background-color: rgba(241, 73, 29, 0.2); }
                100% { background-color: #EDEAE6; }
            }
            .shooting {
                animation: shoot 0.2s ease-out;
            }
            @keyframes hitT {
                0% { background-color: #EDEAE6; }
                50% { background-color: rgba(86, 29, 241, 0.2); } /* Purple for T */
                100% { background-color: #EDEAE6; }
            }

            @keyframes hitN {
                0% { background-color: #EDEAE6; }
                50% { background-color: rgba(241, 73, 29, 0.2); } /* Orange for N */
                100% { background-color: #EDEAE6; }
            }

            @keyframes hitD {
                0% { background-color: #EDEAE6; }
                50% { background-color: rgba(241, 202, 29, 0.2); } /* Yellow for D */
                100% { background-color: #EDEAE6; }
            }

            .hit-t {
                animation: hitT 0.2s ease-out;
            }

            .hit-n {
                animation: hitN 0.2s ease-out;
            }

            .hit-d {
                animation: hitD 0.2s ease-out;
            }
        </style>
    `);

    // Modal functionality
    const modal = document.getElementById('modal');
    const infoButton = document.getElementById('info-button');
    const closeButton = document.querySelector('.close');

    infoButton.addEventListener('click', () => {
        modal.style.display = 'block';
    });

    closeButton.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });

    // Add CSS for audio object
    document.head.insertAdjacentHTML('beforeend', `
        <style>
            .cell[data-sample] {
                color: #F1CA1D;  /* Yellow for audio */
            }

            .cell[data-sample]::before {
                content: attr(data-sample);
                position: absolute;
                top: 2px;
                left: 2px;
                font-size: 10px;
                opacity: 0.9;
                background-color: #F1CA1D;
                color: #282727;
                padding: 1px 3px;
                border-radius: 2px;
                cursor: pointer;
                z-index: 2;
            }

            @keyframes hitA {
                0% { background-color: #EDEAE6; }
                50% { background-color: rgba(241, 202, 29, 0.2); }
                100% { background-color: #EDEAE6; }
            }

            .hit-a {
                animation: hitA 0.2s ease-out;
            }
        </style>
    `);

    // Add these functions to your code
    function encodeGridState() {
        let encodedState = [];
        const cells = document.querySelectorAll('.cell');
        
        cells.forEach((cell, index) => {
            if (cell.textContent) {
                let cellCode = index.toString().padStart(3, '0'); // Changed to 3 digits
                cellCode += cell.textContent; // Object type
                
                // Add specific object properties
                switch (cell.textContent) {
                    case 'T': // Trigger
                        cellCode += cell.dataset.speed || 'n';
                        cellCode += cell.dataset.direction || 'e';
                        break;
                    case 'M': // Melody
                        cellCode += cell.dataset.oscillator || 'si';
                        cellCode += cell.dataset.tone || 'C4';
                        break;
                    case 'N': // Noise
                        cellCode += cell.dataset.noisetype || 'kd';
                        break;
                    case 'D': // Deflector
                        cellCode += cell.dataset.deflect || 'e';
                        break;
                    case 'G': // Gate
                        cellCode += cell.dataset.gate || '1';
                        break;
                    case 'S': // Sample
                        cellCode += cell.dataset.sample || '01';
                        break;
                    case 'X': // Splitter
                        cellCode += 'x';  // Just add a marker
                        break;
                }
                encodedState.push(cellCode);
            }
        });
        
        return encodedState.join('-');
    }

    function decodeGridState(encodedState) {
        clearGrid(); // Clear existing grid
        
        // Clear any existing projectiles
        projectiles = [];
        
        const cellCodes = encodedState.split('-');
        cellCodes.forEach(code => {
            const position = parseInt(code.slice(0, 3));
            const objectType = code[3];
            const cell = document.querySelectorAll('.cell')[position];
            
            if (cell) {
                cell.textContent = objectType;
                
                switch (objectType) {
                    case 'T':
                        const speed = code[4];
                        const direction = code[5];
                        cell.dataset.speed = speed;
                        cell.dataset.direction = direction;
                        shooters.push({
                            x: position % GRID_SIZE,
                            y: Math.floor(position / GRID_SIZE),
                            direction: DIRECTIONS[direction],
                            speedCode: speed
                        });
                        break;
                    case 'M':
                        const osc = code.slice(4, 6);
                        const tone = code.slice(6);
                        cell.dataset.oscillator = osc;
                        cell.dataset.tone = tone;
                        break;
                    case 'N':
                        const noiseType = code.slice(4);
                        cell.dataset.noisetype = noiseType;
                        break;
                    case 'D':
                        const deflectDir = code[4];
                        cell.dataset.deflect = deflectDir;
                        break;
                    case 'G':
                        const gateType = code[4];
                        cell.dataset.gate = gateType;
                        cell.dataset.bulletCount = '0';
                        break;
                    case 'S':
                        const sample = code.slice(4);
                        cell.dataset.sample = sample;
                        break;
                    case 'X':
                        cell.dataset.splitter = 'x';
                        break;
                }
            }
        });

        // Clear any bullet characters ('·') from cells
        document.querySelectorAll('.cell').forEach(cell => {
            if (cell.textContent === '·') {
                cell.textContent = '';
            }
        });
    }

    function clearGrid() {
        const cells = document.querySelectorAll('.cell');
        cells.forEach(cell => clearCell(cell));
        shooters = [];
    }

    // Update share button code
    document.querySelector('.controls').insertAdjacentHTML('beforeend', `
        <div id="share-button" class="control-button">
            <img src="share.svg" alt="Share" width="24" height="24">
        </div>
    `);

    // Update share button click handler
    document.getElementById('share-button').addEventListener('click', () => {
        // Just copy the current URL since it's always up to date
        navigator.clipboard.writeText(window.location.href).then(() => {
            alert('Share link copied to clipboard!');
        });
    });

    // Check for shared state on load
    window.addEventListener('load', () => {
        const params = new URLSearchParams(window.location.search);
        const gridState = params.get('grid');
        if (gridState) {
            decodeGridState(gridState);
        }
    });

    // Set initial play state to true
    isPlaying = true;
    
    // Start playing immediately
    shootingInterval = setInterval(() => {
        updateProjectiles();
        shootFromShooters();
    }, MS_PER_BEAT);
    
    // Set initial icon to stop
    controlIcon.src = 'stop.svg';

    // Add after other modal code
    const examplesModal = document.getElementById('examples-modal');
    const openButton = document.getElementById('open-button');

    openButton.addEventListener('click', () => {
        examplesModal.style.display = 'block';
    });

    // Add close button for examples modal
    examplesModal.querySelector('.close').addEventListener('click', () => {
        examplesModal.style.display = 'none';
    });

    // Handle example clicks
    document.querySelectorAll('.example-card').forEach(card => {
        card.addEventListener('click', () => {
            const gridState = card.dataset.grid;
            // Update URL
            const newURL = `${window.location.origin}${window.location.pathname}?grid=${gridState}`;
            window.history.replaceState({ grid: gridState }, '', newURL);
            // Load the example
            decodeGridState(gridState);
            // Close modal
            examplesModal.style.display = 'none';
        });
    });

    // Close examples modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === examplesModal) {
            examplesModal.style.display = 'none';
        }
    });
});
