document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('grid');
    let GRID_SIZE = 8;
    let selectedCell = null;
    const TEMPO_SETTINGS = [
        { bpm: 100, icon: 'tempo1.svg' },
        { bpm: 110, icon: 'tempo2.svg' },
        { bpm: 120, icon: 'tempo3.svg' },
        { bpm: 130, icon: 'tempo4.svg' },
        { bpm: 140, icon: 'tempo5.svg' }
    ];
    let currentTempoIndex = 0;
    let MS_PER_BEAT = (60 * 1000) / TEMPO_SETTINGS[currentTempoIndex].bpm;
    let projectiles = [];
    let shooters = [];
    let beatCount = 0;
    let isPlaying = true;
    let shootingInterval = null;

    const TONES = [
        'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4',
        'C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5'
    ];

    const SCALES = [
        { code: 'free',   label: 'free',    notes: null },
        { code: 'major',  label: 'major',   notes: ['C','D','E','F','G','A','B'] },
        { code: 'minor',  label: 'minor',   notes: ['A','B','C','D','E','F','G'] },
        { code: 'cpenta', label: 'C penta', notes: ['C','D','E','G','A'] },
        { code: 'gpenta', label: 'G penta', notes: ['G','A','B','D','E'] },
        { code: 'fpenta', label: 'F penta', notes: ['F','G','A','C','D'] },
    ];

    function getScaleTones(scaleCode) {
        const scale = SCALES.find(s => s.code === scaleCode);
        if (!scale || !scale.notes) return TONES;
        return TONES.filter(t => scale.notes.includes(t.replace(/\d/g, '')));
    }

    function applyScale(cell, scaleCode) {
        if (scaleCode === 'free') {
            cell.removeAttribute('data-scale');
        } else {
            cell.dataset.scale = scaleCode;
            const available = getScaleTones(scaleCode);
            if (!available.includes(cell.dataset.tone)) {
                cell.dataset.tone = available[0] || 'C4';
                cell.title = cell.dataset.tone;
            }
        }
        updateURL();
    }

    const OSCILLATOR_TYPES = [
        { code: 'si', type: 'sine' },
        { code: 'sq', type: 'square' },
        { code: 'tr', type: 'triangle' },
        { code: 'st', type: 'sawtooth' }
    ];

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

    const SHOOT_SPEEDS = [
        { code: 'n',  multiplier: 1,    desc: 'normal' },
        { code: 'f',  multiplier: 2,    desc: 'fast' },
        { code: 'ff', multiplier: 4,    desc: 'very fast' },
        { code: 's',  multiplier: 0.5,  desc: 'slow' },
        { code: 'ss', multiplier: 0.25, desc: 'very slow' }
    ];

    const DIRECTIONS = {
        e: { dx: 1,  dy: 0,  name: 'e' },
        s: { dx: 0,  dy: 1,  name: 's' },
        w: { dx: -1, dy: 0,  name: 'w' },
        n: { dx: 0,  dy: -1, name: 'n' }
    };

    const GATE_FILTERS = [
        { code: '1', interval: 1 },
        { code: '2', interval: 2 },
        { code: '3', interval: 3 },
        { code: '4', interval: 4 },
        { code: 'r', interval: 'random' }
    ];

    const AUDIO_SAMPLES = [
        { code: '01', file: '01.wav' },
        { code: '02', file: '02.wav' },
        { code: '03', file: '03.wav' }
    ];

    // --- Global FX sends (parallel reverb + delay) ---
    const reverb = new Tone.Reverb({ decay: 2.5 });
    reverb.wet.value = 1;
    reverb.toDestination();

    const delay = new Tone.FeedbackDelay({ delayTime: 0.3, feedback: 0.35 });
    delay.wet.value = 1;
    delay.toDestination();

    const reverbSend = new Tone.Gain(0);
    reverbSend.connect(reverb);
    const delaySend = new Tone.Gain(0);
    delaySend.connect(delay);

    const audioPlayers = AUDIO_SAMPLES.map(sample => {
        const player = new Tone.Player({
            url: `samples/${sample.file}`,
            onload: () => console.log(`Loaded ${sample.file}`),
        }).toDestination();
        player.connect(reverbSend);
        player.connect(delaySend);
        return { code: sample.code, player };
    });

    function createSynth() {
        const synth = new Tone.Synth({
            oscillator: { type: 'sine' },
            envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.1 }
        }).toDestination();
        synth.connect(reverbSend);
        synth.connect(delaySend);
        return synth;
    }

    const synthPool = Array(5).fill(null).map(() => createSynth());
    let currentSynthIndex = 0;

    const noiseSynthPool = Array(5).fill(null).map(() => {
        const s = new Tone.NoiseSynth().toDestination();
        s.connect(reverbSend);
        s.connect(delaySend);
        return s;
    });
    let currentNoiseSynthIndex = 0;

    // --- Build grid cells and a fast 2D cache ---
    for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.x = i % GRID_SIZE;
        cell.dataset.y = Math.floor(i / GRID_SIZE);
        grid.appendChild(cell);
    }

    // Flat array and 2D array for O(1) lookup — built once, never queried again
    const cells = Array.from(grid.querySelectorAll('.cell'));
    const cellGrid = [];
    for (let y = 0; y < GRID_SIZE; y++) {
        cellGrid[y] = cells.slice(y * GRID_SIZE, y * GRID_SIZE + GRID_SIZE);
    }


    function getCellAt(x, y) {
        if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return null;
        return cellGrid[y][x];
    }

    // --- Animation helpers ---
    function flashClass(el, cls) {
        el.classList.add(cls);
        el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
    }

    // --- Click handler ---
    grid.addEventListener('click', async (e) => {
        if (skipNextClick) { skipNextClick = false; return; }
        if (!e.target.classList.contains('cell')) return;

        if (Tone.context.state !== 'running') {
            await Tone.start();
        }

        const cell = e.target;
        const x = parseInt(cell.dataset.x);
        const y = parseInt(cell.dataset.y);

        const rect = cell.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        const cornerThreshold = rect.width * 0.42;
        const isLeftCornerClick  = clickX <= cornerThreshold && clickY <= cornerThreshold;
        const isRightCornerClick = clickX >= rect.width - cornerThreshold && clickY <= cornerThreshold;

        // Handle T object
        if (cell.textContent === 'T') {
            const shooter = shooters.find(s => s.x === x && s.y === y);
            if (shooter) {
                if (isLeftCornerClick) {
                    const currentIndex = SHOOT_SPEEDS.findIndex(s => s.code === (cell.dataset.speed || 'n'));
                    const next = SHOOT_SPEEDS[(currentIndex + 1) % SHOOT_SPEEDS.length];
                    shooter.speedCode = next.code;
                    cell.dataset.speed = next.code;
                    updateURL();
                    return;
                } else if (isRightCornerClick) {
                    const dirs = Object.values(DIRECTIONS);
                    const currentIndex = dirs.findIndex(d => d.dx === shooter.direction.dx && d.dy === shooter.direction.dy);
                    const next = dirs[(currentIndex + 1) % dirs.length];
                    shooter.direction = next;
                    cell.dataset.direction = next.name;
                    updateURL();
                    return;
                }
            }
        }

        // Handle M object
        if (cell.textContent === 'M') {
            if (isLeftCornerClick) {
                const currentIndex = OSCILLATOR_TYPES.findIndex(o => o.code === (cell.dataset.oscillator || 'si'));
                const next = OSCILLATOR_TYPES[(currentIndex + 1) % OSCILLATOR_TYPES.length];
                cell.dataset.oscillator = next.code;
                const synth = synthPool[currentSynthIndex];
                synth.oscillator.type = next.type;
                synth.triggerAttackRelease(cell.dataset.tone || 'C4', '8n');
                updateURL();
                return;
            } else if (isRightCornerClick) {
                const scaleTones  = getScaleTones(cell.dataset.scale || 'free');
                const currentIndex = scaleTones.indexOf(cell.dataset.tone || 'C4');
                const nextTone = scaleTones[(currentIndex + 1) % scaleTones.length];
                cell.dataset.tone = nextTone;
                cell.title = nextTone;
                const oscType = OSCILLATOR_TYPES.find(o => o.code === (cell.dataset.oscillator || 'si')).type;
                const synth = synthPool[currentSynthIndex];
                synth.oscillator.type = oscType;
                synth.triggerAttackRelease(nextTone, '8n');
                updateURL();
                return;
            }
        }

        // Handle N object
        if (cell.textContent === 'N' && isLeftCornerClick) {
            const currentIndex = NOISE_TYPES.findIndex(n => n.code === (cell.dataset.noisetype || 'kd'));
            const next = NOISE_TYPES[(currentIndex + 1) % NOISE_TYPES.length];
            cell.dataset.noisetype = next.code;
            const synth = noiseSynthPool[currentNoiseSynthIndex];
            Object.assign(synth.noise, next.settings.noise);
            Object.assign(synth.envelope, next.settings.envelope);
            synth.triggerAttackRelease('8n');
            updateURL();
            return;
        }

        // Handle D object
        if (cell.textContent === 'D' && isRightCornerClick) {
            const dirs = Object.values(DIRECTIONS);
            const currentIndex = dirs.findIndex(d => d.name === (cell.dataset.deflect || 'e'));
            cell.dataset.deflect = dirs[(currentIndex + 1) % dirs.length].name;
            updateURL();
            return;
        }

        // Handle G object
        if (cell.textContent === 'G' && isLeftCornerClick) {
            const currentIndex = GATE_FILTERS.findIndex(g => g.code === (cell.dataset.gate || '1'));
            cell.dataset.gate = GATE_FILTERS[(currentIndex + 1) % GATE_FILTERS.length].code;
            updateURL();
            return;
        }

        // Handle S object
        if (cell.textContent === 'S' && isLeftCornerClick) {
            const currentIndex = AUDIO_SAMPLES.findIndex(s => s.code === (cell.dataset.sample || '01'));
            const next = AUDIO_SAMPLES[(currentIndex + 1) % AUDIO_SAMPLES.length];
            cell.dataset.sample = next.code;
            const player = audioPlayers.find(p => p.code === next.code);
            if (player && player.player.loaded) player.player.start();
            updateURL();
            return;
        }

        // Select cell if not a corner click
        if (!isLeftCornerClick && !isRightCornerClick) {
            if (selectedCell) selectedCell.classList.remove('selected');
            selectedCell = cell;
            selectedCell.classList.add('selected');
            showCellPopup(cell);
        }

        if (isLeftCornerClick || isRightCornerClick) {
            updateURL();
        }
    });

    function createProjectile(shooter) {
        const startX = parseInt(shooter.x);
        const startY = parseInt(shooter.y);
        if (startX >= 0 && startX < GRID_SIZE && startY >= 0 && startY < GRID_SIZE) {
            return { x: startX, y: startY, direction: shooter.direction, char: '·' };
        }
        return null;
    }

    function playTone(cell) {
        if (cell.textContent === 'S') {
            const sampleCode = cell.dataset.sample || '01';
            const player = audioPlayers.find(p => p.code === sampleCode);
            if (player && player.player.loaded) player.player.start();
        } else if (cell.textContent === 'N') {
            const noiseType = NOISE_TYPES.find(n => n.code === (cell.dataset.noisetype || 'kd'));
            const synth = noiseSynthPool[currentNoiseSynthIndex];
            Object.assign(synth.noise, noiseType.settings.noise);
            Object.assign(synth.envelope, noiseType.settings.envelope);
            synth.triggerAttackRelease('8n');
            currentNoiseSynthIndex = (currentNoiseSynthIndex + 1) % noiseSynthPool.length;
        } else if (cell.textContent === 'M') {
            const tone    = cell.dataset.tone || 'C4';
            const oscType = OSCILLATOR_TYPES.find(o => o.code === (cell.dataset.oscillator || 'si')).type;
            const synth   = synthPool[currentSynthIndex];
            synth.oscillator.type = oscType;
            synth.triggerAttackRelease(tone, '8n');
            currentSynthIndex = (currentSynthIndex + 1) % synthPool.length;
        }
    }

    function updateProjectiles() {
        const hitsToneThisFrame = [];
        const newProjectiles = [];

        projectiles = projectiles.filter(projectile => {
            const oldCell = getCellAt(projectile.x, projectile.y);
            if (oldCell && oldCell.textContent === projectile.char) {
                oldCell.textContent = '';
            }

            projectile.x += projectile.direction.dx;
            projectile.y += projectile.direction.dy;

            const newCell = getCellAt(projectile.x, projectile.y);
            if (!newCell) return false; // out of bounds
            if (newCell.classList.contains('busy')) return false; // wall

            // Handle gate
            if (newCell.textContent === 'G') {
                const gateType = newCell.dataset.gate;
                if (gateType === 'r') {
                    if (Math.random() < 0.5) {
                        flashClass(newCell, 'hit-g');
                    } else {
                        return false;
                    }
                } else {
                    const gateInterval = parseInt(gateType);
                    let bulletCount = parseInt(newCell.dataset.bulletCount || '0');
                    bulletCount = (bulletCount + 1) % gateInterval;
                    newCell.dataset.bulletCount = bulletCount;
                    if (bulletCount !== 0) return false;
                    flashClass(newCell, 'hit-g');
                }
            }

            // Handle deflector
            if (newCell.textContent === 'D') {
                projectile.direction = DIRECTIONS[newCell.dataset.deflect];
                flashClass(newCell, 'hit-d');
            }

            // Handle tone objects
            if (newCell.textContent === 'M') {
                hitsToneThisFrame.push(newCell);
                flashClass(newCell, 'hit-m');
            }
            if (newCell.textContent === 'N') {
                hitsToneThisFrame.push(newCell);
                flashClass(newCell, 'hit-n');
            }
            if (newCell.textContent === 'S') {
                hitsToneThisFrame.push(newCell);
                flashClass(newCell, 'hit-s');
            }

            // Handle splitter
            if (newCell.textContent === 'X') {
                const d = projectile.direction;
                if (Math.abs(d.dx) === 1) {
                    newProjectiles.push({ x: projectile.x, y: projectile.y, direction: DIRECTIONS.n, char: '·' });
                    newProjectiles.push({ x: projectile.x, y: projectile.y, direction: DIRECTIONS.s, char: '·' });
                } else {
                    newProjectiles.push({ x: projectile.x, y: projectile.y, direction: DIRECTIONS.e, char: '·' });
                    newProjectiles.push({ x: projectile.x, y: projectile.y, direction: DIRECTIONS.w, char: '·' });
                }
                flashClass(newCell, 'hit-x');
            }

            if (!newCell.textContent || newCell.textContent === '·') {
                newCell.textContent = projectile.char;
            }

            return true;
        });

        // Add new projectiles from splitters (bounds already checked by getCellAt)
        for (const p of newProjectiles) {
            if (getCellAt(p.x, p.y)) projectiles.push(p);
        }

        for (const cell of hitsToneThisFrame) {
            playTone(cell);
        }
    }

    function shootFromShooters() {
        beatCount++;
        for (const shooter of shooters) {
            const speedSetting = SHOOT_SPEEDS.find(s => s.code === shooter.speedCode);
            const beatMultiple = 4 / speedSetting.multiplier;
            if (beatCount % beatMultiple === 0) {
                const projectile = createProjectile(shooter);
                if (projectile) {
                    projectiles.push(projectile);
                    const shooterCell = getCellAt(shooter.x, shooter.y);
                    if (shooterCell) flashClass(shooterCell, 'shooting');
                }
            }
        }
    }

    // --- Play/Stop ---
    const playButton  = document.getElementById('play-button');
    const controlIcon = document.getElementById('control-icon');

    function startLoop() {
        shootingInterval = setInterval(() => {
            updateProjectiles();
            shootFromShooters();
        }, MS_PER_BEAT);
    }

    playButton.addEventListener('click', () => {
        isPlaying = !isPlaying;
        if (isPlaying) {
            startLoop();
            controlIcon.src = 'stop.svg';
        } else {
            clearInterval(shootingInterval);
            shootingInterval = null;
            controlIcon.src = 'play.svg';
        }
    });

    // --- URL state ---
    function updateURL() {
        const state  = encodeGridState();
        const newURL = `${window.location.origin}${window.location.pathname}?grid=${state}`;
        window.history.replaceState({ grid: state }, '', newURL);
    }

    function encodeGridState() {
        const parts = [`t${currentTempoIndex}`, `g${GRID_SIZE}`];
        cells.forEach((cell, index) => {
            const isBusy = cell.classList.contains('busy');
            if (!cell.textContent && !isBusy) return;
            const pos = index.toString().padStart(3, '0');
            if (isBusy) { parts.push(pos + 'W'); return; }
            let code = pos + cell.textContent;
            switch (cell.textContent) {
                case 'T': code += (cell.dataset.speed || 'n') + (cell.dataset.direction || 'e'); break;
                case 'M':
                    code += (cell.dataset.oscillator || 'si') + (cell.dataset.tone || 'C4');
                    if (cell.dataset.scale) code += '~' + cell.dataset.scale;
                    break;
                case 'N': code += (cell.dataset.noisetype || 'kd'); break;
                case 'D': code += (cell.dataset.deflect || 'e'); break;
                case 'G': code += (cell.dataset.gate || '1'); break;
                case 'S': code += (cell.dataset.sample || '01'); break;
                case 'X': code += 'x'; break;
            }
            parts.push(code);
        });
        return parts.join('-');
    }

    function decodeGridState(encodedState) {
        const cellCodes = encodedState.split('-');

        if (cellCodes[0].startsWith('t')) {
            currentTempoIndex = parseInt(cellCodes[0].slice(1));
            MS_PER_BEAT = (60 * 1000) / TEMPO_SETTINGS[currentTempoIndex].bpm;
            document.getElementById('tempo-button').querySelector('img').src = TEMPO_SETTINGS[currentTempoIndex].icon;
            cellCodes.shift();
        }

        if (cellCodes[0] && cellCodes[0].startsWith('g')) {
            const newSize = parseInt(cellCodes[0].slice(1));
            if (newSize >= 6 && newSize <= 16 && newSize !== GRID_SIZE) {
                rebuildGrid(newSize);
                document.querySelectorAll('.size-btn[data-size]').forEach(b =>
                    b.classList.toggle('active', parseInt(b.dataset.size) === GRID_SIZE)
                );
            }
            cellCodes.shift();
        }

        clearGrid();
        projectiles = [];

        for (const code of cellCodes) {
            const position  = parseInt(code.slice(0, 3));
            const cell      = cells[position];
            if (!cell) continue;
            if (code[3] === 'W') { cell.classList.add('busy'); continue; }

            const objectType = code[3];
            cell.textContent = objectType;

            switch (objectType) {
                case 'T':
                    cell.dataset.speed     = code[4];
                    cell.dataset.direction = code[5];
                    shooters.push({
                        x:         position % GRID_SIZE,
                        y:         Math.floor(position / GRID_SIZE),
                        direction: DIRECTIONS[code[5]],
                        speedCode: code[4]
                    });
                    break;
                case 'M': {
                    cell.dataset.oscillator = code.slice(4, 6);
                    const toneStr = code.slice(6);
                    const sep = toneStr.indexOf('~');
                    cell.dataset.tone = sep === -1 ? toneStr : toneStr.slice(0, sep);
                    if (sep !== -1) cell.dataset.scale = toneStr.slice(sep + 1);
                    break;
                }
                case 'N':
                    cell.dataset.noisetype = code.slice(4);
                    break;
                case 'D':
                    cell.dataset.deflect = code[4];
                    break;
                case 'G':
                    cell.dataset.gate        = code[4];
                    cell.dataset.bulletCount = '0';
                    break;
                case 'S':
                    cell.dataset.sample = code.slice(4);
                    break;
                case 'X':
                    cell.dataset.splitter = 'x';
                    break;
            }
        }

        // Clear any stray bullet characters
        for (const cell of cells) {
            if (cell.textContent === '·') cell.textContent = '';
        }
    }

    // --- Keyboard input ---
    document.addEventListener('keypress', (e) => {
        if (!selectedCell) return;
        if (selectedCell.classList.contains('busy')) return;
        const char = String.fromCharCode(e.keyCode).toUpperCase();

        if (char === 'T') {
            shooters.push({
                x: parseInt(selectedCell.dataset.x),
                y: parseInt(selectedCell.dataset.y),
                direction: DIRECTIONS.e,
                speedCode: 'n'
            });
            selectedCell.textContent    = 'T';
            selectedCell.dataset.direction = 'e';
            selectedCell.dataset.speed     = 'n';
        } else if (char === 'M') {
            selectedCell.textContent       = 'M';
            selectedCell.dataset.tone      = 'C4';
            selectedCell.dataset.oscillator = 'si';
            selectedCell.title             = 'C4';
        } else if (char === 'N') {
            selectedCell.textContent = 'N';
            selectedCell.dataset.noisetype = 'kd';
            selectedCell.removeAttribute('data-tone');
            selectedCell.removeAttribute('data-oscillator');
        } else if (char === 'D') {
            selectedCell.textContent    = 'D';
            selectedCell.dataset.deflect = 'e';
        } else if (char === 'G') {
            selectedCell.textContent        = 'G';
            selectedCell.dataset.gate       = '1';
            selectedCell.dataset.bulletCount = '0';
        } else if (char === 'S') {
            selectedCell.textContent     = 'S';
            selectedCell.dataset.sample  = '01';
        } else if (char === 'X') {
            selectedCell.textContent      = 'X';
            selectedCell.dataset.splitter = 'x';
        }

        selectedCell.classList.remove('selected');
        selectedCell = null;
        hideCellPopup();
        updateURL();
    });

    // --- Right-click to clear ---
    grid.addEventListener('contextmenu', (e) => e.preventDefault());

    grid.addEventListener('mousedown', (e) => {
        if (e.button === 2 && e.target.classList.contains('cell')) {
            e.preventDefault();
            clearCell(e.target);
            updateURL();
        }
    });

    function clearCell(cell) {
        const x = parseInt(cell.dataset.x);
        const y = parseInt(cell.dataset.y);
        const idx = shooters.findIndex(s => s.x === x && s.y === y);
        if (idx !== -1) shooters.splice(idx, 1);

        cell.textContent = '';
        cell.classList.remove('busy');
        ['data-direction','data-speed','data-tone','data-oscillator',
         'data-noisetype','data-deflect','data-gate','data-bulletCount',
         'data-sample','data-splitter','data-scale','title'].forEach(attr => cell.removeAttribute(attr));

        cell.dataset.x = x;
        cell.dataset.y = y;
    }

    function clearGrid() {
        shooters = [];
        for (const cell of cells) {
            cell.textContent = '';
            cell.classList.remove('busy');
            ['data-direction','data-speed','data-tone','data-oscillator',
             'data-noisetype','data-deflect','data-gate','data-bulletCount',
             'data-sample','data-splitter','title'].forEach(attr => cell.removeAttribute(attr));
        }
    }

    function rebuildGrid(newSize) {
        GRID_SIZE = newSize;
        document.documentElement.style.setProperty(
            '--cell-size',
            `min(48px, calc((min(100vw, 100vh) - 120px) / ${GRID_SIZE}))`
        );
        grid.style.gridTemplateColumns = `repeat(${GRID_SIZE}, 1fr)`;
        grid.innerHTML = '';
        for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.x = i % GRID_SIZE;
            cell.dataset.y = Math.floor(i / GRID_SIZE);
            grid.appendChild(cell);
        }
        cells.splice(0, cells.length, ...grid.querySelectorAll('.cell'));
        cellGrid.splice(0);
        for (let y = 0; y < GRID_SIZE; y++) {
            cellGrid[y] = cells.slice(y * GRID_SIZE, y * GRID_SIZE + GRID_SIZE);
        }
        shooters = [];
        projectiles = [];
        beatCount = 0;
    }

    // --- Modals ---
    const modal      = document.getElementById('modal');
    const infoButton = document.getElementById('info-button');
    infoButton.addEventListener('click', () => { modal.style.display = 'block'; });
    modal.querySelector('.close').addEventListener('click', () => { modal.style.display = 'none'; });

    const examplesModal = document.getElementById('examples-modal');
    const openButton    = document.getElementById('open-button');
    openButton.addEventListener('click', () => { examplesModal.style.display = 'block'; });
    examplesModal.querySelector('.close').addEventListener('click', () => { examplesModal.style.display = 'none'; });

    const settingsModal = document.getElementById('settings-modal');
    document.getElementById('settings-button').addEventListener('click', () => { settingsModal.style.display = 'block'; });
    settingsModal.querySelector('.close').addEventListener('click', () => { settingsModal.style.display = 'none'; });

    window.addEventListener('click', (e) => {
        if (e.target === modal)         modal.style.display = 'none';
        if (e.target === examplesModal) examplesModal.style.display = 'none';
        if (e.target === settingsModal) settingsModal.style.display = 'none';
    });

    // --- Settings: grid size buttons ---
    const sizeSelector = document.querySelector('.size-selector');
    for (let s = 6; s <= 16; s++) {
        const btn = document.createElement('button');
        btn.className = 'size-btn' + (s === GRID_SIZE ? ' active' : '');
        btn.textContent = s;
        btn.dataset.size = s;
        sizeSelector.appendChild(btn);
    }
    sizeSelector.addEventListener('click', (e) => {
        const btn = e.target.closest('.size-btn[data-size]');
        if (!btn) return;
        const s = parseInt(btn.dataset.size);
        if (s === GRID_SIZE) return;
        const wasPlaying = isPlaying;
        if (wasPlaying) clearInterval(shootingInterval);
        rebuildGrid(s);
        document.querySelectorAll('.size-btn[data-size]').forEach(b =>
            b.classList.toggle('active', parseInt(b.dataset.size) === GRID_SIZE)
        );
        if (wasPlaying) startLoop();
        updateURL();
    });

    // --- Settings: busy cells random fill ---
    document.getElementById('busy-toggle').addEventListener('click', () => {
        cells.forEach(cell => cell.classList.remove('busy'));
        cells.forEach(cell => {
            if (!cell.textContent && Math.random() < 0.10) {
                cell.classList.add('busy');
            }
        });
        updateURL();
    });

    // --- Settings: effects toggles ---
    let reverbOn = false;
    const reverbToggle = document.getElementById('reverb-toggle');
    reverbToggle.addEventListener('click', () => {
        reverbOn = !reverbOn;
        reverbSend.gain.rampTo(reverbOn ? 0.5 : 0, 0.2);
        reverbToggle.textContent = `Reverb: ${reverbOn ? 'on' : 'off'}`;
        reverbToggle.classList.toggle('active', reverbOn);
    });

    let delayOn = false;
    const delayToggle = document.getElementById('delay-toggle');
    delayToggle.addEventListener('click', () => {
        delayOn = !delayOn;
        delaySend.gain.rampTo(delayOn ? 0.45 : 0, 0.2);
        delayToggle.textContent = `Delay: ${delayOn ? 'on' : 'off'}`;
        delayToggle.classList.toggle('active', delayOn);
    });

    document.querySelectorAll('.example-card').forEach(card => {
        card.addEventListener('click', () => {
            const gridState = card.dataset.grid;
            const newURL = `${window.location.origin}${window.location.pathname}?grid=${gridState}`;
            window.history.replaceState({ grid: gridState }, '', newURL);
            decodeGridState(gridState);
            examplesModal.style.display = 'none';
        });
    });

    // --- Share button ---
    document.querySelector('.controls').insertAdjacentHTML('beforeend', `
        <div id="share-button" class="control-button">
            <img src="share.svg" alt="Share" width="24" height="24">
        </div>
    `);
    document.getElementById('share-button').addEventListener('click', () => {
        navigator.clipboard.writeText(window.location.href).then(() => {
            alert('Share link copied to clipboard!');
        });
    });

    // --- Tempo button ---
    document.getElementById('tempo-button').addEventListener('click', () => {
        if (shootingInterval) clearInterval(shootingInterval);
        currentTempoIndex = (currentTempoIndex + 1) % TEMPO_SETTINGS.length;
        MS_PER_BEAT = (60 * 1000) / TEMPO_SETTINGS[currentTempoIndex].bpm;
        document.getElementById('tempo-button').querySelector('img').src = TEMPO_SETTINGS[currentTempoIndex].icon;
        if (isPlaying) startLoop();
        updateURL();
    });

    // --- Load shared state on startup ---
    window.addEventListener('load', () => {
        const params    = new URLSearchParams(window.location.search);
        const gridState = params.get('grid');
        if (gridState) {
            decodeGridState(gridState);
        } else {
            cells.forEach(cell => {
                if (Math.random() < 0.10) cell.classList.add('busy');
            });
        }
    });

    // --- Clipboard + popup ---
    let clipboard = null;
    const CELL_ATTRS = ['direction', 'speed', 'tone', 'oscillator',
                        'noisetype', 'deflect', 'gate', 'sample', 'splitter', 'scale'];

    const cellPopup = document.createElement('div');
    cellPopup.id = 'cell-popup';
    document.body.appendChild(cellPopup);

    function makePopupBtn(label, variant, onClick) {
        const btn = document.createElement('button');
        btn.className = 'popup-btn' + (variant ? ' ' + variant : '');
        btn.textContent = label;
        btn.addEventListener('click', (e) => { e.stopPropagation(); if (onClick) onClick(); });
        return btn;
    }

    function copyCellData(cell) {
        clipboard = { textContent: cell.textContent, title: cell.title || '' };
        for (const attr of CELL_ATTRS) {
            if (cell.dataset[attr] !== undefined) clipboard[attr] = cell.dataset[attr];
        }
    }

    function pasteCellData(cell) {
        if (!clipboard) return;
        if (cell.textContent && cell.textContent !== '·') clearCell(cell);
        cell.textContent = clipboard.textContent;
        if (clipboard.title) cell.title = clipboard.title;
        for (const attr of CELL_ATTRS) {
            if (clipboard[attr] !== undefined) cell.dataset[attr] = clipboard[attr];
        }
        if (clipboard.textContent === 'G') cell.dataset.bulletCount = '0';
        if (clipboard.textContent === 'T') {
            shooters.push({
                x: parseInt(cell.dataset.x),
                y: parseInt(cell.dataset.y),
                direction: DIRECTIONS[clipboard.direction || 'e'],
                speedCode: clipboard.speed || 'n'
            });
        }
        updateURL();
    }

    function showCellPopup(cell) {
        const hasContent = cell.textContent && cell.textContent !== '·';
        cellPopup.innerHTML = '';

        if (hasContent) {
            cellPopup.appendChild(makePopupBtn('copy', null, () => { copyCellData(cell); hideCellPopup(); }));
            if (cell.textContent === 'M') {
                cellPopup.appendChild(makePopupBtn('scale', 'accent', () => showScalePopup(cell)));
            }
            cellPopup.appendChild(makePopupBtn('del', 'danger', () => { clearCell(cell); updateURL(); hideCellPopup(); }));
        } else if (clipboard) {
            cellPopup.appendChild(makePopupBtn('paste', 'accent', () => { pasteCellData(cell); hideCellPopup(); }));
        } else {
            return;
        }

        positionCellPopup(cell);
    }

    function showScalePopup(cell) {
        cellPopup.innerHTML = '';
        cellPopup.appendChild(makePopupBtn('←', null, () => showCellPopup(cell)));
        const scaleCode = cell.dataset.scale || 'free';
        SCALES.filter(s => s.code !== 'free').forEach(s => {
            const isActive = s.code === scaleCode;
            cellPopup.appendChild(makePopupBtn(s.label, isActive ? 'active' : null, () => {
                applyScale(cell, isActive ? 'free' : s.code);
                hideCellPopup();
            }));
        });
        positionCellPopup(cell);
    }

    function positionCellPopup(cell) {
        cellPopup.style.visibility = 'hidden';
        cellPopup.classList.add('visible');
        const pw = cellPopup.offsetWidth;
        const ph = cellPopup.offsetHeight;
        const rect = cell.getBoundingClientRect();
        let x = rect.left + rect.width / 2 - pw / 2;
        let y = rect.top - ph - 6;
        x = Math.max(4, Math.min(x, window.innerWidth - pw - 4));
        if (y < 4) y = rect.bottom + 6;
        cellPopup.style.left = x + 'px';
        cellPopup.style.top  = y + 'px';
        cellPopup.style.visibility = '';
    }

    function hideCellPopup() {
        cellPopup.classList.remove('visible');
    }

    // Dismiss popup when clicking outside of it
    document.addEventListener('mousedown', (e) => {
        if (!cellPopup.contains(e.target)) hideCellPopup();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'c') {
            if (!selectedCell || !selectedCell.textContent || selectedCell.textContent === '·') return;
            e.preventDefault();
            copyCellData(selectedCell);
            hideCellPopup();
        } else if (e.ctrlKey && e.key === 'v') {
            if (!selectedCell || !clipboard) return;
            e.preventDefault();
            pasteCellData(selectedCell);
            hideCellPopup();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
            if (!selectedCell || !selectedCell.textContent || selectedCell.textContent === '·') return;
            // Don't intercept Backspace in text inputs (modals)
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            e.preventDefault();
            clearCell(selectedCell);
            updateURL();
            hideCellPopup();
        }
    });

    // --- Drag and drop ---
    const DRAG_THRESHOLD = 6;
    let dragState = null;
    let skipNextClick = false;

    const ghost = document.createElement('div');
    ghost.id = 'drag-ghost';
    document.body.appendChild(ghost);

    grid.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        const cell = e.target.closest('.cell');
        if (!cell || !cell.textContent || cell.textContent === '·') return;
        dragState = { cell, startX: e.clientX, startY: e.clientY, active: false, dropTarget: null };
    });

    document.addEventListener('mousemove', (e) => {
        if (!dragState) return;
        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;

        if (!dragState.active && Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
            dragState.active = true;
            ghost.textContent = dragState.cell.textContent;
            ghost.style.color = getComputedStyle(dragState.cell).color;
            ghost.style.display = 'flex';
            dragState.cell.classList.add('dragging');
            hideCellPopup();
            tooltip.classList.remove('visible');
            tooltipTarget = null;
        }

        if (!dragState.active) return;

        ghost.style.left = e.clientX + 'px';
        ghost.style.top  = e.clientY + 'px';

        // Find cell under cursor without ghost blocking hit-test
        ghost.style.display = 'none';
        const under = document.elementFromPoint(e.clientX, e.clientY);
        ghost.style.display = 'flex';

        const over = under?.closest('.cell');

        if (dragState.dropTarget && dragState.dropTarget !== over) {
            dragState.dropTarget.classList.remove('drop-target');
            dragState.dropTarget = null;
        }
        if (over && over !== dragState.cell && !over.textContent && !over.classList.contains('busy')) {
            over.classList.add('drop-target');
            dragState.dropTarget = over;
        }
    });

    document.addEventListener('mouseup', (e) => {
        if (!dragState) return;

        if (dragState.active) {
            skipNextClick = true;
            ghost.style.display = 'none';
            dragState.cell.classList.remove('dragging');

            if (dragState.dropTarget) {
                dragState.dropTarget.classList.remove('drop-target');
                moveCellTo(dragState.cell, dragState.dropTarget);
            }

            // Clean up any stray highlights
            grid.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
        }

        dragState = null;
    });

    function moveCellTo(from, to) {
        to.textContent = from.textContent;
        if (from.title) to.title = from.title;

        const attrs = ['direction', 'speed', 'tone', 'oscillator',
                       'noisetype', 'deflect', 'gate', 'bulletCount',
                       'sample', 'splitter'];
        for (const attr of attrs) {
            if (from.dataset[attr] !== undefined) to.dataset[attr] = from.dataset[attr];
        }

        // Update shooters array if this is a T cell
        if (from.textContent === 'T') {
            const shooter = shooters.find(s => s.x === parseInt(from.dataset.x) && s.y === parseInt(from.dataset.y));
            if (shooter) {
                shooter.x = parseInt(to.dataset.x);
                shooter.y = parseInt(to.dataset.y);
            }
        }

        clearCell(from);
        updateURL();
    }

    // --- Cell tooltip ---
    const tooltip = document.createElement('div');
    tooltip.id = 'cell-tooltip';
    document.body.appendChild(tooltip);

    const TOOLTIP_DATA = {
        T: (cell) => ({
            title: 'T  Trigger',
            color: '#F1491D',
            desc: 'Shoots bullets on each beat',
            left:  { label: 'speed ◂',     value: cell.dataset.speed     || 'n',  map: { ss: 'very slow', s: 'slow', n: 'normal', f: 'fast', ff: 'very fast' } },
            right: { label: 'direction ▸', value: cell.dataset.direction || 'e',  map: { n: 'north', e: 'east', s: 'south', w: 'west' } },
            hint: 'click top-left / top-right to cycle'
        }),
        M: (cell) => ({
            title: 'M  Melody',
            color: '#561DF1',
            desc: 'Plays a note when hit by bullet',
            left:  { label: 'wave ◂', value: cell.dataset.oscillator || 'si', map: { si: 'sine', sq: 'square', tr: 'triangle', st: 'sawtooth' } },
            right: { label: 'note ▸', value: cell.dataset.tone || 'C4' },
            hint: 'click top-left / top-right to cycle'
        }),
        N: (cell) => ({
            title: 'N  Noise',
            color: '#F1491D',
            desc: 'Plays a drum sound when hit',
            left: { label: 'drum ◂', value: cell.dataset.noisetype || 'kd', map: { kd: 'kick', sn: 'snare', hh: 'hi-hat', tm: 'tom' } },
            hint: 'click top-left to cycle'
        }),
        D: (cell) => ({
            title: 'D  Deflector',
            color: '#F1CA1D',
            desc: 'Redirects incoming bullets',
            right: { label: 'direction ▸', value: cell.dataset.deflect || 'e', map: { n: 'north', e: 'east', s: 'south', w: 'west' } },
            hint: 'click top-right to cycle'
        }),
        G: (cell) => ({
            title: 'G  Gate',
            color: '#561DF1',
            desc: 'Filters bullet passage',
            left: { label: 'mode ◂', value: cell.dataset.gate || '1', map: { '1': 'every', '2': 'every 2nd', '3': 'every 3rd', '4': 'every 4th', r: 'random 50%' } },
            hint: 'click top-left to cycle'
        }),
        S: (cell) => ({
            title: 'S  Sample',
            color: '#F1CA1D',
            desc: 'Plays audio sample when hit',
            left: { label: 'sample ◂', value: cell.dataset.sample || '01' },
            hint: 'click top-left to cycle'
        }),
        X: () => ({
            title: 'X  Splitter',
            color: '#561DF1',
            desc: 'Splits bullet into two perpendicular',
            hint: 'no settings'
        })
    };

    function buildTooltip(cell) {
        const fn = TOOLTIP_DATA[cell.textContent];
        if (!fn) return null;
        const d = fn(cell);

        const resolve = (item) => item.map ? `${item.value} — ${item.map[item.value] || item.value}` : item.value;

        let html = `<div class="tt-title" style="color:${d.color}">${d.title}</div>`;
        html += `<div class="tt-desc">${d.desc}</div>`;

        if (d.left || d.right) {
            html += '<div class="tt-settings">';
            if (d.left)  html += `<div class="tt-item"><span class="tt-label">${d.left.label}</span><span class="tt-value">${resolve(d.left)}</span></div>`;
            if (d.right) html += `<div class="tt-item"><span class="tt-label">${d.right.label}</span><span class="tt-value">${resolve(d.right)}</span></div>`;
            html += '</div>';
        }

        if (d.hint) html += `<div class="tt-hint">${d.hint}</div>`;
        return html;
    }

    function positionTooltip(mouseX, mouseY) {
        const offset = 14;
        const tw = tooltip.offsetWidth;
        const th = tooltip.offsetHeight;
        let x = mouseX + offset;
        let y = mouseY + offset;
        if (x + tw > window.innerWidth  - 8) x = mouseX - tw - offset;
        if (y + th > window.innerHeight - 8) y = mouseY - th - offset;
        tooltip.style.left = x + 'px';
        tooltip.style.top  = y + 'px';
    }

    let tooltipTarget = null;

    grid.addEventListener('mouseover', (e) => {
        const cell = e.target.closest('.cell');
        if (!cell || !cell.textContent || cell.textContent === '·') {
            tooltip.classList.remove('visible');
            tooltipTarget = null;
            return;
        }
        if (cell === tooltipTarget) return;
        const html = buildTooltip(cell);
        if (!html) { tooltip.classList.remove('visible'); tooltipTarget = null; return; }
        tooltipTarget = cell;
        tooltip.innerHTML = html;
        tooltip.classList.add('visible');
    });

    grid.addEventListener('mouseout', (e) => {
        if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('#grid')) {
            tooltip.classList.remove('visible');
            tooltipTarget = null;
        }
    });

    grid.addEventListener('mousemove', (e) => {
        if (tooltip.classList.contains('visible')) positionTooltip(e.clientX, e.clientY);
    });

    // --- Start ---
    isPlaying = true;
    startLoop();
    controlIcon.src = 'stop.svg';
});
