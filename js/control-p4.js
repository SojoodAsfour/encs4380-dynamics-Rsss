
(function () {
    "use strict";

    const $ = id => document.getElementById(id);

    const requiredIds = [
        "p4Kp", "p4Ki", "p4Kd", "p4KpValue", "p4KiValue", "p4KdValue",
        "p4NewPlant", "p4StepTest", "p4TestWrap", "p4TestPlot",
        "p4Submit", "p4Hint", "p4HintResult",
        "p4Spec", "p4Results", "p4Score", "p4Status", "p4Truth",
        "p4OutputPlot", "p4ControlPlot",
        "p4SessionScore", "p4SessionMax", "p4Completed", "p4Accuracy", "p4PlantType",
        "p4IdentifyWrap", "p4PlantGuess", "p4CheckPlant", "p4PlantResult",
        "p4Prediction", "p4CheckPrediction", "p4PredictionResult"
    ];

    if (requiredIds.some(id => !$(id)) || !window.Plotly) {
        console.error("P4: Required elements or Plotly are missing.");
        return;
    }

    /* ---------- Settings ---------- */

    const SETPOINT = 1;
    const U_MAX = 20;
    const SSE_LIMIT = 0.5;                            // "zero" steady-state error means <= 0.5% (needs Ki)
    const WEIGHTS = { overshoot: 30, settling: 40, steady: 30 };
    const NOISE = 0.02;                               // step-test noise, fraction of the final value
    const TEST_POINTS = 400;

    /* ---------- State ---------- */

    let plant = null;       // hidden plant
    let spec = null;        // specification for this round
    let submitted = false;  // has this round already been scored?
    let hintLevel = 0;
    let lastScore = 0;
    let plantIdentified = false;   
    let stepTestRun = false;      

    const session = { score: 0, max: 0, completed: 0 };

    /* ---------- Helpers ---------- */

    const rand = (a, b) => a + Math.random() * (b - a);
    const pick = list => list[Math.floor(Math.random() * list.length)];
    const round = (x, d) => Number(x.toFixed(d));

    function randn() {
        let u = 0;
        while (u === 0) u = Math.random();
        const v = Math.random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    /* ---------- Plant models ---------- */
    /*
     * first:  tau*y' + y = K*u
     * second: y'' + 2*zeta*wn*y' + wn^2*y = wn^2*u   (DC gain 1, like Module 4)
     */

    function randomPlant() {
        // Ranges follow Module 4's hidden sensors
        if (Math.random() < 0.55) {
            return { type: "first", K: round(rand(0.5, 8), 2), tau: round(rand(0.5, 8), 2) };
        }
        return { type: "second", zeta: round(rand(0.15, 0.65), 2), wn: round(rand(1, 10), 2) };
    }

    function openLoopSettling(p) {
        if (p.type === "first") return 3.9 * p.tau;
        return 4 / (p.zeta * p.wn);
    }

    function runDuration(p) {
        return Math.min(40, Math.max(15, 1.5 * openLoopSettling(p)));
    }

    function plantStep(p, s, u, dt) {
        if (p.type === "first") {
            s.y += dt * (p.K * u - s.y) / p.tau;
        } else {
            const acceleration = p.wn * p.wn * (u - s.y) - 2 * p.zeta * p.wn * s.v;
            s.v += dt * acceleration;               // semi-implicit Euler
            s.y += dt * s.v;
        }
    }

    // Closed loop: PID with derivative on the measurement, saturation and anti-windup
    function simulateClosed(p, { Kp, Ki, Kd }, dt = 0.001) {
        const duration = runDuration(p);
        const s = { y: 0, v: 0 };
        let integral = 0;
        let yPrev = 0;

        const steps = Math.round(duration / dt);
        const time = [], y = [], u = [];

        for (let i = 0; i <= steps; i++) {
            const error = SETPOINT - s.y;
            const yDot = p.type === "second" ? s.v : (s.y - yPrev) / dt;

            const requested = Kp * error + Ki * integral - Kd * yDot;
            const uApplied = Math.max(-U_MAX, Math.min(U_MAX, requested));

            time.push(i * dt);
            y.push(s.y);
            u.push(uApplied);

            if (i === steps) break;

            const pushing = (requested >= U_MAX && error > 0) || (requested <= -U_MAX && error < 0);
            if (Ki > 0 && !pushing) integral += error * dt;

            yPrev = s.y;
            plantStep(p, s, uApplied, dt);
        }

        return { time, y, u, duration };
    }

    // Open-loop unit step (u = 1) sampled with measurement noise, like Module 4
    function buildStepTest(p) {
        const duration = Math.min(40, Math.max(6, 1.5 * openLoopSettling(p)));
        const dt = duration / (TEST_POINTS * 5);
        const finalValue = p.type === "first" ? p.K : 1;
        const sigma = NOISE * finalValue;
        const s = { y: 0, v: 0 };

        // Reuse the Homework 1 step responses (Module 1 / Module 3, as Module 4 does)
        const exact = p.type === "first"
            ? (window.Module1 && window.Module1.stepResponse
                ? t => window.Module1.stepResponse(t, p.K, p.tau) : null)
            : (window.Module3 && window.Module3.stepResponse
                ? t => window.Module3.stepResponse(t, p.wn, p.zeta) : null);

        const time = [], noisy = [];
        for (let i = 0; i <= TEST_POINTS * 5; i++) {
            if (i % 5 === 0) {
                const clean = exact ? exact(i * dt) : s.y;
                time.push(i * dt);
                noisy.push(clean + sigma * randn());
            }
            if (!exact) plantStep(p, s, 1, dt);
        }
        return { time, noisy };
    }

    /* ---------- Metrics ---------- */

    function calculateMetrics(sim) {
        const { time, y } = sim;
        const last = y.length - 1;

        if (!y.every(Number.isFinite) || Math.max(...y.map(Math.abs)) > 1e3) {
            return { overshoot: null, settling: null, steadyError: null, diverged: true };
        }

        const overshoot = Math.max(0, (Math.max(...y) - SETPOINT) / SETPOINT * 100);

        let lastOutside = -1;
        for (let i = 0; i <= last; i++) {
            if (Math.abs(y[i] - SETPOINT) > 0.02 * SETPOINT) lastOutside = i;
        }
        // Must stay inside the band for the last 10% of the run (a limit cycle can cross it at the very end)
        const settled = lastOutside < Math.floor(last * 0.9);
        const settling = settled ? (lastOutside < 0 ? 0 : time[lastOutside + 1]) : null;

        // Steady-state error only means something if the output has stopped moving
        // (last 10% of the run). Otherwise an oscillation would give a misleading number.
        const lastPart = y.slice(Math.floor(last * 0.9));
        const spread = Math.max(...lastPart) - Math.min(...lastPart);
        const mean = lastPart.reduce((a, b) => a + b, 0) / lastPart.length;
        const steadyError = spread <= 0.005 * SETPOINT
            ? Math.abs(SETPOINT - mean) / SETPOINT * 100
            : null;

        return { overshoot, settling, steadyError, diverged: false };
    }

    function evaluate(m) {
        const results = {
            overshoot: m.overshoot !== null && m.overshoot <= spec.overshoot,
            settling: m.settling !== null && m.settling <= spec.settling,
            steady: m.steadyError !== null && m.steadyError <= SSE_LIMIT
        };
        const score = Object.keys(results).reduce((sum, key) => sum + (results[key] ? WEIGHTS[key] : 0), 0);
        return { results, score };
    }

    /* ---------- Spec generation (always solvable) ---------- */

    // Fastest settling found on a coarse gain grid that meets overshoot and steady-state error
    function fastestFeasibleSettling(p, overshootLimit) {
        let best = null;

        for (const Kp of [1, 3, 6, 10, 15]) {
            for (const Ki of [0, 1, 3, 6, 10]) {
                for (const Kd of [0, 0.2, 0.6, 1.5]) {
                    const m = calculateMetrics(simulateClosed(p, { Kp, Ki, Kd }, 0.002));
                    if (m.diverged || m.settling === null) continue;
                    if (m.overshoot > overshootLimit || m.steadyError > SSE_LIMIT) continue;
                    if (best === null || m.settling < best) best = m.settling;
                }
            }
        }
        return best;
    }

    function generateChallenge() {
        for (let attempt = 0; attempt < 20; attempt++) {
            const candidate = randomPlant();
            const limit = pick([5, 10, 15]);

            let tBest = fastestFeasibleSettling(candidate, limit);
            let overshoot = limit;

            if (tBest === null) {
                tBest = fastestFeasibleSettling(candidate, 25);   // looser overshoot limit
                overshoot = 25;
                if (tBest === null) continue;
            }

            return {
                plant: candidate,
                spec: { overshoot, settling: Math.max(1, round(tBest * 3, 1)) }
            };
        }

        return { plant: { type: "first", K: 1, tau: 1 }, spec: { overshoot: 10, settling: 2 } };
    }

    /* ---------- Plot helpers ---------- */

    function chartStyle() {
        const styles = getComputedStyle(document.documentElement);
        return {
            primary: styles.getPropertyValue("--primary").trim() || "#3158B8",
            accent: styles.getPropertyValue("--accent").trim() || "#DA91AA",
            text: getComputedStyle(document.body).color,
            grid: "rgba(140,150,180,0.2)"
        };
    }

    function layoutFor(c, yTitle) {
        return {
            paper_bgcolor: "rgba(0,0,0,0)",
            plot_bgcolor: "rgba(0,0,0,0)",
            font: { color: c.text },
            margin: { l: 55, r: 20, t: 20, b: 55 },
            xaxis: { title: { text: "Time (s)" }, gridcolor: c.grid },
            yaxis: { title: { text: yTitle }, gridcolor: c.grid, automargin: true },
            legend: { orientation: "h", y: 1.2 }
        };
    }

    function downsample(values, maxPoints = 800) {
        const stride = Math.max(1, Math.ceil(values.length / maxPoints));
        return values.filter((_, i) => i % stride === 0 || i === values.length - 1);
    }

    const PLOT_CONFIG = { responsive: true, displaylogo: false };

    /* ---------- Interface ---------- */

    function addResultCard(container, title, requirement, actual, passed, points) {
        const card = document.createElement("div");
        card.className = "lab-panel p-4";

        const heading = document.createElement("p");
        heading.className = "font-bold mb-2";
        heading.textContent = title;

        const values = document.createElement("p");
        values.className = "lab-muted text-sm";
        values.textContent = `Required: ${requirement} | Yours: ${actual}`;

        const status = document.createElement("p");
        status.className = "font-bold mt-2";
        status.textContent = passed ? `PASS ✓  (+${points})` : "FAIL ✗  (+0)";
        status.style.color = passed ? "#15803d" : "#dc2626";

        card.append(heading, values, status);
        container.appendChild(card);
    }

    function updateScoreboard() {
        $("p4SessionScore").textContent = session.score;
        $("p4SessionMax").textContent = session.max;
        $("p4Completed").textContent = session.completed;
        $("p4Accuracy").textContent = session.max > 0
            ? Math.round(100 * session.score / session.max) + "%"
            : "--";
    }

    function updateP4() {
        const gains = {
            Kp: Number($("p4Kp").value),
            Ki: Number($("p4Ki").value),
            Kd: Number($("p4Kd").value)
        };

        $("p4KpValue").textContent = gains.Kp.toFixed(1);
        $("p4KiValue").textContent = gains.Ki.toFixed(1);
        $("p4KdValue").textContent = gains.Kd.toFixed(2);

        const sim = simulateClosed(plant, gains);
        const m = calculateMetrics(sim);
        const { results, score } = evaluate(m);
        lastScore = score;

        const container = $("p4Results");
        container.replaceChildren();

        addResultCard(container, "Overshoot", `≤ ${spec.overshoot}%`,
            m.overshoot === null ? "Unstable" : m.overshoot.toFixed(2) + "%",
            results.overshoot, WEIGHTS.overshoot);

        addResultCard(container, "Settling time (±2%)", `≤ ${spec.settling.toFixed(1)} s`,
            m.settling === null ? "Not settled" : m.settling.toFixed(2) + " s",
            results.settling, WEIGHTS.settling);

        addResultCard(container, "Steady-state error", `≤ ${SSE_LIMIT}%`,
            m.steadyError === null ? (m.diverged ? "Unstable" : "Not steady") : m.steadyError.toFixed(2) + "%",
            results.steady, WEIGHTS.steady);

        $("p4Score").textContent = `${score} / 100`;

        $("p4Status").textContent = submitted
            ? "This design is already submitted. Press “New Challenge” for another round."
            : score === 100
                ? "Every part of the spec is met. Submit your design!"
                : m.diverged
                    ? "The loop is unstable. Reduce the gains."
                    : "Some parts of the spec are not met yet. Keep tuning.";

        const c = chartStyle();
        const t = downsample(sim.time);
        const end = sim.time[sim.time.length - 1];
        const overshootLine = SETPOINT * (1 + spec.overshoot / 100);

        // Output with the spec drawn on top: ±2% band, settling deadline, overshoot limit
        const layout = layoutFor(c, "Output");
        layout.shapes = [
            {
                type: "rect", xref: "paper", yref: "y", x0: 0, x1: 1,
                y0: 0.98 * SETPOINT, y1: 1.02 * SETPOINT,
                fillcolor: "rgba(34,197,94,0.15)", line: { width: 0 }
            },
            {
                type: "line", xref: "x", yref: "paper", x0: spec.settling, x1: spec.settling,
                y0: 0, y1: 1, line: { color: c.text, width: 1, dash: "dot" }
            },
            {
                type: "line", xref: "paper", yref: "y", x0: 0, x1: 1, y0: overshootLine, y1: overshootLine,
                line: { color: "#dc2626", width: 1, dash: "dash" }
            }
        ];

        Plotly.react("p4OutputPlot", [
            { x: t, y: downsample(sim.y), type: "scatter", mode: "lines", name: "Output", line: { color: c.primary, width: 3 } },
            { x: [0, end], y: [SETPOINT, SETPOINT], type: "scatter", mode: "lines", name: "Setpoint", line: { color: c.accent, width: 2, dash: "dash" } }
        ], layout, PLOT_CONFIG);

        Plotly.react("p4ControlPlot", [
            { x: t, y: downsample(sim.u), type: "scatter", mode: "lines", name: "Control u", line: { color: c.primary, width: 2.5 } },
            { x: [0, end], y: [U_MAX, U_MAX], type: "scatter", mode: "lines", name: "Limits", line: { color: c.accent, dash: "dot" } },
            { x: [0, end], y: [-U_MAX, -U_MAX], type: "scatter", mode: "lines", showlegend: false, line: { color: c.accent, dash: "dot" } }
        ], layoutFor(c, "Control u"), PLOT_CONFIG);
    }

    function drawStepTest() {
        if (!plant.test) plant.test = buildStepTest(plant);   // keep the same noisy data for this round

        const c = chartStyle();
        $("p4TestWrap").classList.remove("hidden");
        $("p4IdentifyWrap").classList.remove("hidden");
        stepTestRun = true;

        Plotly.react("p4TestPlot", [{
            x: plant.test.time,
            y: plant.test.noisy,
            type: "scatter",
            mode: "lines+markers",
            name: "Open-loop response to u = 1",
            line: { color: c.primary, width: 1.5 },
            marker: { color: c.primary, size: 4 },
            hovertemplate: "t = %{x:.3f} s<br>y = %{y:.3f}<extra></extra>"
        }], layoutFor(c, "Output y(t)"), PLOT_CONFIG);
    }

    function describePlantType() {
        return plant.type === "first" ? "First-order" : "Second-order";
    }

    function updateSpecDisplay() {
        $("p4Spec").textContent =
            `Overshoot ≤ ${spec.overshoot}%  •  Settling time (±2%) ≤ ${spec.settling.toFixed(1)} s  •  ` +
            `Steady-state error ≤ ${SSE_LIMIT}% (zero)  •  Control limit ±${U_MAX}`;
        $("p4PlantType").textContent = plantIdentified ? describePlantType() : "Unknown";
    }

    function startNewChallenge() {
        const challenge = generateChallenge();
        plant = challenge.plant;
        spec = challenge.spec;
        submitted = false;
        hintLevel = 0;
        plantIdentified = false;
        stepTestRun = false;

        $("p4Kp").value = 0;
        $("p4Ki").value = 0;
        $("p4Kd").value = 0;
        setSlidersDisabled(false);

        $("p4IdentifyWrap").classList.add("hidden");
        $("p4PlantGuess").value = "";
        $("p4PlantGuess").disabled = false;
        $("p4CheckPlant").disabled = false;
        $("p4PlantResult").classList.add("hidden");
        $("p4PlantResult").textContent = "";

        $("p4TestWrap").classList.add("hidden");
        $("p4HintResult").classList.add("hidden");
        $("p4HintResult").replaceChildren();
        $("p4Truth").classList.add("hidden");
        $("p4Truth").textContent = "";
        $("p4Hint").textContent = "Get Hint";
        $("p4Submit").disabled = false;
        if ($("p4PredictionResult")) $("p4PredictionResult").classList.add("hidden");

        Plotly.purge("p4TestPlot");

        updateSpecDisplay();
        updateP4();
    }

    /* ---------- Hints ---------- */

    const HINTS = {
        first: [
            "Run the step test. K is the final value of the open-loop response, and τ is the time at which it reaches 63.2% of K.",
            "With P only, τ_closed = τ / (1 + K·Kp) and the steady-state error is 1 / (1 + K·Kp). A larger Kp makes the loop faster.",
            "Add Ki to remove the steady-state error. For a PI loop, ωn = √(K·Ki/τ) and ζ = (1 + K·Kp) / (2√(τ·K·Ki)). Aim for ζ ≈ 0.7."
        ],
        second: [
            "Run the step test. Read the overshoot to get ζ, and the peak time tp = π / (ωn√(1−ζ²)) to get ωn.",
            "P control makes the plant stiffer: ωn' = ωn·√(1 + Kp) and ζ' = ζ / √(1 + Kp). So a large Kp alone increases oscillations.",
            "Kd adds damping (the plant's 2ζωn becomes 2ζωn + ωn²·Kd). Ki removes the steady-state error but keep it small, or it will cause oscillations."
        ]
    };

    function showHint() {
        const box = $("p4HintResult");

        if (!stepTestRun) {
            box.textContent = "Run the open-loop step test first, then ask for a hint.";
            box.classList.remove("hidden");
            return;
        }

        if (!plantIdentified) {
            box.textContent = "Hint: look at the shape of the step response. A smooth rise with no overshoot " +
                "is first-order; overshoot and ringing mean second-order. Identify the plant type first.";
            box.classList.remove("hidden");
            return;
        }

        const hints = HINTS[plant.type];

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
        $("p4Hint").textContent = hintLevel < hints.length ? "Next Hint" : "No more hints";
    }

    /* ---------- Identify the plant ---------- */

    function setSlidersDisabled(disabled) {
        ["p4Kp", "p4Ki", "p4Kd"].forEach(id => { $(id).disabled = disabled; });
    }

    function checkPlantType() {
        if (plantIdentified) return;

        const choice = $("p4PlantGuess").value;
        const box = $("p4PlantResult");
        box.classList.remove("hidden");

        if (!choice) {
            box.textContent = "Please choose a plant type first.";
            return;
        }

        if (choice === plant.type) {
            plantIdentified = true;
            box.textContent = `Correct! This is a ${describePlantType().toLowerCase()} plant.`;
            $("p4PlantType").textContent = describePlantType();
            $("p4PlantGuess").disabled = true;
            $("p4CheckPlant").disabled = true;
            $("p4Status").textContent = "Plant identified. Tune the gains and submit when the spec is met.";
        } else {
            box.textContent = "Try Again. Look closely at the shape of the step response.";
        }
    }

    /* ---------- Submit ---------- */

    function submitDesign() {
        if (submitted) return;

        if (!plantIdentified) {
            $("p4Status").textContent = "Identify the plant type first (run the step test, then use “Check Plant Type”).";
            return;
        }

        submitted = true;
        session.score += lastScore;
        session.max += 100;
        session.completed++;
        updateScoreboard();

        $("p4Submit").disabled = true;
        setSlidersDisabled(true);

        const truth = $("p4Truth");
        truth.textContent = plant.type === "first"
            ? `Revealed: first-order plant with K = ${plant.K}, τ = ${plant.tau} s. Score this round: ${lastScore} / 100.`
            : `Revealed: second-order plant with ζ = ${plant.zeta}, ωn = ${plant.wn} rad/s. Score this round: ${lastScore} / 100.`;
        truth.classList.remove("hidden");

        updateP4();
    }

    /* ---------- Events ---------- */

    $("p4NewPlant").addEventListener("click", startNewChallenge);
    $("p4StepTest").addEventListener("click", drawStepTest);
    $("p4Hint").addEventListener("click", showHint);
    $("p4Submit").addEventListener("click", submitDesign);
    $("p4CheckPlant").addEventListener("click", checkPlantType);

    ["p4Kp", "p4Ki", "p4Kd"].forEach(id => $(id).addEventListener("input", updateP4));

    window.addEventListener("transient-theme-change", () => {
        if (!plant) return;
        updateP4();
        if (!$("p4TestWrap").classList.contains("hidden")) drawStepTest();
    });

    // Predict, then Check: what does adding I do to the steady-state error?
    if ($("p4CheckPrediction") && $("p4Prediction") && $("p4PredictionResult")) {
        $("p4CheckPrediction").addEventListener("click", () => {
            const choice = $("p4Prediction").value;
            const result = $("p4PredictionResult");

            result.classList.remove("hidden");

            if (!choice) {
                result.textContent = "Please select your prediction first.";
                return;
            }

            const Kp = Number($("p4Kp").value);
            const simP = simulateClosed(plant, { Kp, Ki: 0, Kd: 0 }, 0.002);
            const simPI = simulateClosed(plant, { Kp, Ki: 1, Kd: 0 }, 0.002);
            const metricsPI = calculateMetrics(simPI);

            
            const finalError = sim => {
                const part = sim.y.slice(Math.floor(sim.y.length * 0.95));
                return Math.abs(SETPOINT - part.reduce((a, b) => a + b, 0) / part.length) / SETPOINT * 100;
            };

            const errorP = finalError(simP);
            const errorPI = finalError(simPI);
            const unsteady = metricsPI.diverged || metricsPI.steadyError === null;

            const actual = errorPI < errorP - 0.01 ? "decrease"
                : errorPI > errorP + 0.01 ? "increase"
                    : "same";

            result.textContent =
                (choice === actual ? "Correct prediction! " : "Not quite. ") +
                `With Kp = ${Kp.toFixed(1)} and Ki = 0, the steady-state error is ${errorP.toFixed(2)}%. ` +
                `Adding Ki = 1 changes it to ${errorPI.toFixed(2)}%. ` +
                "The integral keeps growing while any error remains, so it pushes the error toward zero " +
                "(if the loop stays stable)." +
                (unsteady ? " Note: with these gains the PI loop is still oscillating, so this value is only approximate." : "");
        });
    }

    updateScoreboard();
    startNewChallenge();
})();