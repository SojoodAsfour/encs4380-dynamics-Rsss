/*
 * Module 4 — Guess the Sensor
 */

(() => {
    "use strict";

    const $ = id => document.getElementById(id);

    // Stop quietly if the page or an earlier module is missing
    if (!$("m4ResponsePlot") || typeof Plotly === "undefined" ||
        !window.Module1 || !window.Module3) return;

    /* ---------- Settings ---------- */

    const NOISE = 0.02;   // noise std-dev as a fraction of the signal size
    const POINTS = 400;   // samples per curve

    /* ---------- State ---------- */

    let sensor = null;    // true parameters of the hidden sensor
    let data = null;      // { time, clean, noisy, input }
    let answered = false; // has this round already been checked?
    let hintLevel = 0;    // how many hints were shown this round

    const session = { score: 0, max: 0, completed: 0 };

    /* ---------- Helpers ---------- */

    const rand = (min, max) => min + Math.random() * (max - min);
    const round = (x, digits) => Number(x.toFixed(digits));

    
    function randn() {
        let u = 0;
        while (u === 0) u = Math.random();
        const v = Math.random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    // First-order frequency response, reusing Module 2 when available
    function firstOrderSine(tau, omega) {
        if (window.Module2 && typeof window.Module2.calculate === "function") {
            return window.Module2.calculate(tau, omega);
        }

        const ratio = omega * tau;

        return {
            magnitude: 1 / Math.sqrt(1 + ratio * ratio),
            phase: -Math.atan(ratio)
        };
    }

   
    function trueOutput(s, t) {

        if (s.kind === "second") {
            return window.Module3.stepResponse(t, s.wn, s.zeta);
        }

        if (s.kind === "sine") {
            const r = firstOrderSine(s.tau, s.omega);
            return s.K * r.magnitude * Math.sin(s.omega * t + r.phase);
        }

        return window.Module1.stepResponse(t, s.K, s.tau);
    }

    /* ---------- Random hidden sensor ---------- */

    function generateSensor() {
        const roll = Math.random();

        // 40%: first-order step
        if (roll < 0.4) {
            const tau = round(rand(0.5, 8), 2);

            return {
                kind: "step",
                K: round(rand(0.5, 8), 2),
                tau,
                endTime: tau * rand(5, 8)
            };
        }

        // 20%: first-order sine 
        if (roll < 0.6) {
            const omega = round(rand(1, 4), 1);
            const tau = round(rand(0.5, 2.5) / omega, 3);

            return {
                kind: "sine",
                K: round(rand(0.5, 5), 2),
                tau,
                omega,
                endTime: 4 * 2 * Math.PI / omega   // four periods
            };
        }

        // 40%: second-order step, underdamped so overshoot is readable
        const zeta = round(rand(0.15, 0.65), 2);
        const wn = round(rand(1, 10), 2);

        return {
            kind: "second",
            zeta,
            wn,
            endTime: rand(6, 9) / (zeta * wn)
        };
    }

    // Sample the true curve and add noise
    function buildData(s) {
        const time = [];
        const clean = [];
        const noisy = [];
        const input = [];

        let sigma = NOISE;   // second order: final value is 1

        if (s.kind === "step") {
            sigma = NOISE * s.K;
        }

        if (s.kind === "sine") {
            sigma = NOISE * s.K * firstOrderSine(s.tau, s.omega).magnitude;
        }

        for (let i = 0; i <= POINTS; i++) {
            const t = s.endTime * i / POINTS;
            const y = trueOutput(s, t);

            time.push(t);
            clean.push(y);
            noisy.push(y + sigma * randn());

            if (s.kind === "sine") input.push(Math.sin(s.omega * t));
        }

        return {
            time,
            clean,
            noisy,
            input: s.kind === "sine" ? input : null
        };
    }

    /* ---------- Interface text ---------- */

    const TYPE_LABEL = {
        step: "First-order · Step",
        sine: "First-order · Sine",
        second: "Second-order · Step"
    };

    function describe(s) {

        if (s.kind === "step") {
            return {
                task: "Input: unit step, x(t) = 1 for t ≥ 0. " +
                      "Estimate the gain K and the time constant τ.",
                method: "The curve settles at K. τ is the time at which " +
                        "the output reaches 63.2% of K. You can also use " +
                        "the log-method helper below."
            };
        }

        if (s.kind === "sine") {
            return {
                task: `Input: x(t) = sin(${s.omega.toFixed(1)} t), shown dashed. ` +
                      "Estimate K and τ. The output is plotted after the " +
                      "start-up transient has died out.",
                method: "The phase lag gives τ through φ = tan⁻¹(ωτ). " +
                        "The output amplitude is K·M with " +
                        "M = 1/√(1+(ωτ)²), so K = amplitude / M."
            };
        }

        return {
            task: "Input: unit step. The sensor has K = 1. " +
                  "Estimate the damping ratio ζ and the natural frequency ωn.",
            method: "Read the overshoot to get ζ, then use the peak time " +
                    "tp = π / (ωn√(1−ζ²)) to get ωn."
        };
    }

    // Set up the page for the current sensor
    function updateInterface(s) {
        const info = describe(s);

        $("m4SensorType").textContent = TYPE_LABEL[s.kind];
        $("m4Task").textContent = info.task;
        $("m4Method").textContent = info.method;

        $("m4GuessFirstOrder").classList.toggle("hidden", s.kind === "second");
        $("m4GuessSecondOrder").classList.toggle("hidden", s.kind !== "second");
        $("m4ToolsSection").classList.toggle("hidden", s.kind !== "step");

        ["m4GainGuess", "m4TauGuess", "m4ZetaGuess", "m4WnGuess", "m4LogK"]
            .forEach(id => { $(id).value = ""; });

        ["m4HintResult", "m4GuessResult", "m4RevealSection",
         "m4LogNote", "m4LogPlot"]
            .forEach(id => $(id).classList.add("hidden"));

        ["m4HintResult", "m4GuessResult", "m4ActualValues"]
            .forEach(id => $(id).replaceChildren());

        Plotly.purge("m4LogPlot");
        Plotly.purge("m4ComparisonPlot");

        $("m4Hint").textContent = "Get Hint";
        $("m4CheckGuess").disabled = false;
    }

    function updateScoreboard() {
        $("m4Score").textContent = session.score;
        $("m4MaxScore").textContent = session.max;
        $("m4Completed").textContent = session.completed;

        $("m4Accuracy").textContent = session.max > 0
            ? Math.round(100 * session.score / session.max) + "%"
            : "--";
    }

    // Start a new round
    function newSensor() {
        sensor = generateSensor();
        data = buildData(sensor);
        answered = false;
        hintLevel = 0;

        updateInterface(sensor);
        drawResponse();   // defined in part 2
    }

 
    /* ---------- Colors and plotting ---------- */

    function getColors() {
        const css = getComputedStyle(document.documentElement);

        return {
            background: css.getPropertyValue("--surface-soft").trim(),
            text: css.getPropertyValue("--text").trim(),
            grid: css.getPropertyValue("--chart-grid").trim(),
            primary: css.getPropertyValue("--primary").trim(),
            accent: css.getPropertyValue("--accent").trim()
        };
    }

    function baseLayout(c, xTitle, yTitle) {
        return {
            paper_bgcolor: c.background,
            plot_bgcolor: c.background,
            font: { color: c.text },
            margin: { l: 65, r: 20, t: 30, b: 60 },
            xaxis: {
                title: { text: xTitle },
                gridcolor: c.grid,
                zeroline: false
            },
            yaxis: {
                title: { text: yTitle },
                gridcolor: c.grid,
                zeroline: false
            },
            legend: { orientation: "h", x: 0, y: 1.15 }
        };
    }

    const PLOT_CONFIG = { responsive: true, displaylogo: false };

    // Main plot: the noisy response of the hidden sensor
    function drawResponse() {
        const c = getColors();
        const traces = [];

        
        if (sensor.kind === "sine") {
            traces.push({
                x: data.time,
                y: data.input,
                type: "scatter",
                mode: "lines",
                name: "Input x(t)",
                line: { color: c.accent, width: 2, dash: "dash" },
                hovertemplate: "t = %{x:.3f} s<br>x = %{y:.3f}<extra>Input</extra>"
            });
        }

        traces.push({
            x: data.time,
            y: data.noisy,
            type: "scatter",
            mode: "lines+markers",
            name: "Sensor output y(t)",
            line: { color: c.primary, width: 1.5 },
            marker: { color: c.primary, size: 4 },
            hovertemplate: "t = %{x:.3f} s<br>y = %{y:.3f}<extra>Output</extra>"
        });

        const layout = baseLayout(
            c,
            "Time (s)",
            sensor.kind === "second" ? "Output (K = 1)" : "Sensor output y(t)"
        );

        if (sensor.kind !== "sine") {
            layout.yaxis.rangemode = "tozero";
        }

        Plotly.react("m4ResponsePlot", traces, layout, PLOT_CONFIG);
    }

    /* ---------- Log-method helper (first-order step only) ---------- */

  
    function drawLog() {
        const note = $("m4LogNote");
        const plot = $("m4LogPlot");
        const K = Number($("m4LogK").value);

        note.classList.remove("hidden");

        if (!(K > 0)) {
            note.textContent = "Enter a positive estimate for K first.";
            plot.classList.add("hidden");
            return;
        }

        const x = [];
        const y = [];
        let dropped = 0;

        for (let i = 0; i < data.time.length; i++) {
            const error = 1 - data.noisy[i] / K;

            if (error > 0.05) {
                x.push(data.time[i]);
                y.push(Math.log(error));
            } else {
                dropped++;
            }
        }

        if (x.length < 5) {
            note.textContent =
                "Too few usable points. Your K is probably too small, " +
                "since the curve goes above it.";
            plot.classList.add("hidden");
            return;
        }

        note.textContent =
            "If K is right, the points follow a straight line with slope −1/τ, " +
            "so τ = −1 / slope. If the line bends, adjust K and plot again." +
            (dropped > 0
                ? ` ${dropped} points with 1 − y/K ≤ 0.05 are hidden because noise dominates there.`
                : "");

        plot.classList.remove("hidden");

        const c = getColors();

        Plotly.react("m4LogPlot", [{
            x,
            y,
            type: "scatter",
            mode: "markers",
            name: "ln(1 − y/K)",
            marker: { color: c.accent, size: 5 },
            hovertemplate: "t = %{x:.3f} s<br>ln = %{y:.3f}<extra></extra>"
        }], {
            ...baseLayout(c, "Time (s)", "ln(1 − y/K)"),
            showlegend: false
        }, PLOT_CONFIG);
    }

    /* ---------- Hints ---------- */

    const HINTS = {
        step: [
            "K is the final value the curve settles at.",
            "At t = τ the output has reached 63.2% of K. Find the time where y = 0.632·K.",
            "Plot ln(1 − y/K) against t with the helper below. It is a line with slope −1/τ."
        ],
        sine: [
            "In steady state the output is a sine with the same ω as the input, only smaller and shifted in time.",
            "Measure the time shift Δt between a peak of the input and the matching peak of the output. The phase lag is φ = ω·Δt, and τ = tan(φ)/ω.",
            "The input amplitude is 1, so the output amplitude is K·M, and M = cos(φ) here. That gives K = output amplitude / cos(φ)."
        ],
        second: [
            "Overshoot depends only on ζ.",
            "With overshoot as a fraction OS: ζ = −ln(OS) / √(π² + ln²(OS)).",
            "The peak time is tp = π / (ωn·√(1 − ζ²)). Use your ζ and the measured tp to solve for ωn."
        ]
    };

    function showHint() {
        const hints = HINTS[sensor.kind];
        const box = $("m4HintResult");

        if (hintLevel < hints.length) hintLevel++;

        box.replaceChildren();

        for (let i = 0; i < hintLevel; i++) {
            const p = document.createElement("p");
            p.className = i === 0 ? "text-sm" : "text-sm mt-2";

            const label = document.createElement("strong");
            label.textContent = `Hint ${i + 1}: `;

            p.append(label, document.createTextNode(hints[i]));
            box.appendChild(p);
        }

        box.classList.remove("hidden");

        $("m4Hint").textContent =
            hintLevel < hints.length ? "Next Hint" : "No more hints";
    }

    /* ---------- Reading the user's guess ---------- */

    function showMessage(text) {
        const box = $("m4GuessResult");
        const p = document.createElement("p");

        p.className = "text-sm font-semibold";
        p.textContent = text;

        box.replaceChildren(p);
        box.classList.remove("hidden");
    }

 
    function readGuess() {
        const second = sensor.kind === "second";

        const fields = second
            ? [["m4ZetaGuess", "ζ"], ["m4WnGuess", "ωn"]]
            : [["m4GainGuess", "K"], ["m4TauGuess", "τ"]];

        const values = [];

        for (const [id, label] of fields) {
            const text = $(id).value.trim();
            const value = Number(text);

            if (text === "" || !Number.isFinite(value) || value <= 0) {
                showMessage(`Please enter a positive number for ${label}.`);
                return null;
            }

            values.push(value);
        }

        if (second) {
            return { kind: "second", zeta: values[0], wn: values[1] };
        }

        return {
            kind: sensor.kind,
            K: values[0],
            tau: values[1],
            omega: sensor.omega
        };
    }


    /* ---------- Scoring ---------- */

    const FULL_TOLERANCE = 0.10;
    const PARTIAL_TOLERANCE = 0.20;
    const POINTS_PER_PARAMETER = 50;

    function scoreParameter(guess, truth) {
        const error = Math.abs(guess - truth) / truth;

        let points = 0;

        if (error <= FULL_TOLERANCE) {
            points = POINTS_PER_PARAMETER;
        } else if (error <= PARTIAL_TOLERANCE) {
            points = POINTS_PER_PARAMETER / 2;
        }

        return { error, points };
    }

    // The two parameters being estimated in this round
    function parameterList(guess) {

        if (sensor.kind === "second") {
            return [
                { label: "Damping ratio ζ", unit: "", digits: 3,
                  truth: sensor.zeta, guess: guess.zeta },
                { label: "Natural frequency ωn", unit: " rad/s", digits: 3,
                  truth: sensor.wn, guess: guess.wn }
            ];
        }

        return [
            { label: "Gain K", unit: "", digits: 3,
              truth: sensor.K, guess: guess.K },
            { label: "Time constant τ", unit: " s", digits: 3,
              truth: sensor.tau, guess: guess.tau }
        ];
    }

    /* ---------- Reveal ---------- */

    let lastGuess = null;   

    function drawComparison(guess) {
        const c = getColors();

        
        const time = [];
        const trueCurve = [];
        const guessCurve = [];
        const n = 800;

        for (let i = 0; i <= n; i++) {
            const t = sensor.endTime * i / n;

            time.push(t);
            trueCurve.push(trueOutput(sensor, t));
            guessCurve.push(trueOutput(guess, t));
        }

        const traces = [
            {
                x: data.time,
                y: data.noisy,
                type: "scatter",
                mode: "markers",
                name: "Measured (noisy)",
                marker: { color: c.text, size: 3, opacity: 0.35 },
                hovertemplate: "t = %{x:.3f} s<br>y = %{y:.3f}<extra>Measured</extra>"
            },
            {
                x: time,
                y: trueCurve,
                type: "scatter",
                mode: "lines",
                name: "True sensor",
                line: { color: c.primary, width: 3 },
                hovertemplate: "t = %{x:.3f} s<br>y = %{y:.3f}<extra>True</extra>"
            },
            {
                x: time,
                y: guessCurve,
                type: "scatter",
                mode: "lines",
                name: "Your guess",
                line: { color: c.accent, width: 3, dash: "dash" },
                hovertemplate: "t = %{x:.3f} s<br>y = %{y:.3f}<extra>Guess</extra>"
            }
        ];

        const layout = baseLayout(c, "Time (s)", "Output y(t)");
        layout.margin.b = 80;
        layout.legend = { orientation: "h", x: 0, y: -0.25 };

        Plotly.react("m4ComparisonPlot", traces, layout, PLOT_CONFIG);
    }

    function makeCard(item, result) {
        const card = document.createElement("div");
        card.className = "lab-panel p-4";

        const title = document.createElement("p");
        title.className = "font-bold";
        title.textContent = item.label;

        const truth = document.createElement("p");
        truth.className = "text-sm mt-2";
        truth.textContent =
            `True: ${item.truth.toFixed(item.digits)}${item.unit}`;

        const guess = document.createElement("p");
        guess.className = "text-sm";
        guess.textContent =
            `Your guess: ${item.guess.toFixed(item.digits)}${item.unit}`;

        const error = document.createElement("p");
        error.className = "text-sm lab-muted";
        error.textContent = `Error: ${(result.error * 100).toFixed(1)}%`;

        const points = document.createElement("p");
        points.className = result.points === POINTS_PER_PARAMETER
            ? "font-bold mt-2 text-green-600 dark:text-green-400"
            : result.points > 0
                ? "font-bold mt-2 lab-accent"
                : "font-bold mt-2 text-red-600 dark:text-red-400";
        points.textContent =
            `${result.points} / ${POINTS_PER_PARAMETER} points`;

        card.append(title, truth, guess, error, points);

        return card;
    }

    function checkGuess() {

        if (answered) {
            showMessage("This sensor is already scored. Press “New Sensor” for another round.");
            return;
        }

        const guess = readGuess();

        if (!guess) return;

        const items = parameterList(guess);
        const results = items.map(item => scoreParameter(item.guess, item.truth));
        const total = results.reduce((sum, r) => sum + r.points, 0);
        const roundMax = items.length * POINTS_PER_PARAMETER;

        // Only a checked guess counts toward the session
        answered = true;
        session.score += total;
        session.max += roundMax;
        session.completed++;
        updateScoreboard();

        $("m4CheckGuess").disabled = true;

        
        const verdict = document.createElement("div");
        const heading = document.createElement("p");
        const detail = document.createElement("p");

        heading.className = "font-bold text-lg";
        detail.className = "text-sm lab-muted mt-1";

        if (total === roundMax) {
            heading.className += " text-green-600 dark:text-green-400";
            heading.textContent = `Full marks! ${total} / ${roundMax}`;
            detail.textContent = "Both parameters are within 10% of the true values.";
        } else if (total > 0) {
            heading.className += " lab-accent";
            heading.textContent = `Close. ${total} / ${roundMax}`;
            detail.textContent = "Parameters within 10% get full marks, within 20% get half.";
        } else {
            heading.className += " text-red-600 dark:text-red-400";
            heading.textContent = `Not this time. ${total} / ${roundMax}`;
            detail.textContent = "Compare your curve with the true one below and try the next sensor.";
        }

        verdict.append(heading, detail);
        $("m4GuessResult").replaceChildren(verdict);
        $("m4GuessResult").classList.remove("hidden");

        // Reveal: true values and the overlay
        $("m4ActualValues").replaceChildren(
            ...items.map((item, i) => makeCard(item, results[i]))
        );

        $("m4RevealSection").classList.remove("hidden");

        lastGuess = guess;
        drawComparison(guess);

        $("m4RevealSection").scrollIntoView({
            behavior: "smooth",
            block: "nearest"
        });
    }

    

    $("m4CheckGuess").addEventListener("click", checkGuess);
    $("m4Hint").addEventListener("click", showHint);
    $("m4LogButton").addEventListener("click", drawLog);

    $("m4NewSensor").addEventListener("click", () => {
        lastGuess = null;
        newSensor();
    });

    
    ["m4GainGuess", "m4TauGuess", "m4ZetaGuess", "m4WnGuess"].forEach(id => {
        $(id).addEventListener("keydown", event => {
            if (event.key === "Enter" && !answered) checkGuess();
        });
    });

    $("m4LogK").addEventListener("keydown", event => {
        if (event.key === "Enter") drawLog();
    });

    // Redraw every plot with the new colors when the theme changes
    window.addEventListener("transient-theme-change", () => {
        if (!sensor) return;

        drawResponse();

        if (!$("m4LogPlot").classList.contains("hidden")) drawLog();

        if (answered && lastGuess) drawComparison(lastGuess);
    });

    

    updateScoreboard();
    newSensor();

})();
